import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { baseLocale, isLocale, type Locale } from '$lib/paraglide/runtime';
import { db } from '$lib/server/db';
import {
	calendarEvent,
	integrationConnection,
	member,
	organization,
	user
} from '$lib/server/db/schema';
import { removeDigestSchedule } from '$lib/server/queue/digest-schedule';
import { getDigestConfig, setDigestLastSentWeekKey } from './digest-config';
import { buildDigestMessage, type DigestSourceEvent } from './digest-message';
import { overlapsWeek, zonedWeekBounds } from './digest-week';
import { digestPayloadFor } from './formatters';
import { deliverPayloadToConnection } from './webhooks';

const resolveLocale = (value: string | null): Locale => (isLocale(value) ? value : baseLocale);

/**
 * Builds and posts one team's weekly digest. Self-heals (removes its scheduler) when the
 * config is gone/disabled. Idempotent per team-week via lastSentWeekKey. Best-effort:
 * per-connection failures are counted, never thrown.
 */
export async function sendTeamDigest(orgId: string, now: Date = new Date()): Promise<void> {
	const config = await getDigestConfig(orgId);
	if (!config || !config.enabled) {
		await removeDigestSchedule(orgId);
		return;
	}

	const [org] = await db
		.select({ name: organization.name, locale: organization.locale })
		.from(organization)
		.where(eq(organization.id, orgId));
	if (!org) {
		await removeDigestSchedule(orgId);
		return;
	}
	const locale = resolveLocale(org.locale);
	const { weekStart, weekEndExclusive, weekKey, weekLabel } = zonedWeekBounds(
		now,
		config.timezone,
		locale
	);
	if (config.lastSentWeekKey === weekKey) return; // already sent this week

	const memberRows = await db
		.select({ userId: member.userId })
		.from(member)
		.where(eq(member.organizationId, orgId));
	const memberIds = memberRows.map((row) => row.userId);

	const candidates =
		memberIds.length === 0
			? []
			: await db
					.select({
						userId: user.id,
						userName: user.name,
						type: calendarEvent.type,
						title: calendarEvent.title,
						allDay: calendarEvent.allDay,
						start: calendarEvent.start,
						end: calendarEvent.end
					})
					.from(calendarEvent)
					.innerJoin(user, eq(calendarEvent.userId, user.id))
					.where(
						and(
							inArray(calendarEvent.userId, memberIds),
							lt(calendarEvent.start, weekEndExclusive),
							gte(calendarEvent.end, weekStart)
						)
					);
	const selected: DigestSourceEvent[] = candidates.filter((event) =>
		overlapsWeek(event, weekStart, weekEndExclusive)
	);

	const message = buildDigestMessage(org.name, weekLabel, selected, locale);
	if (message.entries.length === 0 && !config.postWhenEmpty) {
		await setDigestLastSentWeekKey(orgId, weekKey);
		return;
	}

	const connections = await db
		.select({
			id: integrationConnection.id,
			provider: integrationConnection.provider,
			webhookUrl: integrationConnection.webhookUrl
		})
		.from(integrationConnection)
		.where(
			and(
				eq(integrationConnection.orgId, orgId),
				eq(integrationConnection.kind, 'webhook'),
				eq(integrationConnection.notifyDigest, true)
			)
		);

	const results = await Promise.allSettled(
		connections.map((connection) => {
			const payload = digestPayloadFor(connection.provider, message);
			return payload === null
				? Promise.resolve(false)
				: deliverPayloadToConnection(connection, payload);
		})
	);
	for (const result of results) {
		if (result.status === 'rejected') console.error('[digest] delivery failed:', result.reason);
	}
	await setDigestLastSentWeekKey(orgId, weekKey);
}
