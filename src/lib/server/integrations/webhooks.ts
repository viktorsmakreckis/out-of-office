import { and, eq, inArray, sql } from 'drizzle-orm';
import { baseLocale, isLocale, type Locale } from '$lib/paraglide/runtime';
import { db } from '$lib/server/db';
import {
	integrationConnection,
	member,
	organization,
	type IntegrationProvider
} from '$lib/server/db/schema';
import { payloadFor } from './formatters';
import { buildEventMessage, type OooMessage } from './message';

/** A calendar-event change ready to render per team, in that team's locale. */
export type ChannelEvent = {
	actorName: string;
	kind: 'created' | 'updated' | 'deleted';
	title: string | null;
	type: string;
	range: { allDay: boolean; start: Date; end: Date };
};

const resolveLocale = (value: string | null): Locale => (isLocale(value) ? value : baseLocale);

/** SSRF guard: only official provider webhook hosts, https only. */
const allowedHost: Record<IntegrationProvider, (host: string) => boolean> = {
	slack: (host) => host === 'hooks.slack.com',
	discord: (host) => host === 'discord.com' || host === 'discordapp.com',
	msteams: (host) => host.endsWith('.logic.azure.com') || host.endsWith('.api.powerplatform.com')
};

export function isAllowedWebhookUrl(provider: IntegrationProvider, raw: string): boolean {
	const isAllowed = allowedHost[provider];
	if (!isAllowed) return false;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return false;
	}
	return url.protocol === 'https:' && isAllowed(url.hostname);
}

export async function postJson(
	url: string,
	payload: unknown,
	fetchFn: typeof fetch = fetch
): Promise<boolean> {
	try {
		const response = await fetchFn(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(5000),
			redirect: 'error'
		});
		return response.ok;
	} catch {
		return false;
	}
}

async function recordDeliveryResult(connectionId: string, ok: boolean): Promise<void> {
	await db
		.update(integrationConnection)
		.set(
			ok
				? { consecutiveFailures: 0, lastFailureAt: null }
				: {
						consecutiveFailures: sql`${integrationConnection.consecutiveFailures} + 1`,
						lastFailureAt: new Date()
					}
		)
		.where(eq(integrationConnection.id, connectionId));
}

/** Posts one message to one connection and updates its failure counter. */
export async function deliverToConnection(
	connection: { id: string; provider: IntegrationProvider; webhookUrl: string },
	message: OooMessage
): Promise<boolean> {
	const payload = payloadFor(connection.provider, message);
	if (payload === null) return false; // no formatter for this provider — nothing to deliver
	const ok = await postJson(connection.webhookUrl, payload);
	await recordDeliveryResult(connection.id, ok);
	return ok;
}

/**
 * Best-effort post to every webhook connection of every team the actor is in.
 * Each team's message is rendered in that team's locale.
 */
export async function postEventToTeamChannels(actorId: string, event: ChannelEvent): Promise<void> {
	const memberships = await db
		.select({ organizationId: member.organizationId })
		.from(member)
		.where(eq(member.userId, actorId));
	if (memberships.length === 0) return;
	const connections = await db
		.select({
			id: integrationConnection.id,
			provider: integrationConnection.provider,
			webhookUrl: integrationConnection.webhookUrl,
			orgLocale: organization.locale
		})
		.from(integrationConnection)
		.innerJoin(organization, eq(integrationConnection.orgId, organization.id))
		.where(
			and(
				inArray(
					integrationConnection.orgId,
					memberships.map((row) => row.organizationId)
				),
				eq(integrationConnection.kind, 'webhook')
			)
		);
	const results = await Promise.allSettled(
		connections.map((connection) =>
			deliverToConnection(
				connection,
				buildEventMessage(
					event.actorName,
					event.kind,
					event.title,
					event.type,
					event.range,
					resolveLocale(connection.orgLocale)
				)
			)
		)
	);
	for (const result of results) {
		if (result.status === 'rejected')
			console.error('[integrations] webhook delivery failed:', result.reason);
	}
}
