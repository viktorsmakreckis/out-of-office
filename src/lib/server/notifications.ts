import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { eventTypeLabelFor } from '$lib/events/labels';
import { isLocale, baseLocale } from '$lib/paraglide/runtime';
import { db } from '$lib/server/db';
import {
	member,
	notification,
	organization,
	user,
	type EventChangeData,
	type NotificationData
} from '$lib/server/db/schema';
import {
	calendarSharedEmail,
	eventChangeEmail,
	sendEmail,
	type EmailContent
} from '$lib/server/email';
import { postEventToTeamChannels } from '$lib/server/integrations/webhooks';
import { getUserChannelPrefs, recipientsForChannel } from '$lib/server/notification-preferences';
import { enqueueEventDelivery } from '$lib/server/queue';
import type { EventDeliveryPayload } from '$lib/server/queue/job';
import { getEventAudience, getUsersByIds, type Recipient, type ShareEntity } from './sharing';

type NotificationType =
	'team_invite' | 'calendar_shared' | 'event_created' | 'event_updated' | 'event_deleted';

/** Inserts in-app rows for `inAppRecipients` and emails `emailRecipients`; email failures are logged, never thrown. */
async function notifyRecipients(
	inAppRecipients: Recipient[],
	emailRecipients: Recipient[],
	type: NotificationType,
	actorName: string,
	data: NotificationData,
	emailFor: (recipient: Recipient) => EmailContent
): Promise<void> {
	if (inAppRecipients.length > 0) {
		await db
			.insert(notification)
			.values(
				inAppRecipients.map((recipient) => ({ userId: recipient.id, type, actorName, data }))
			);
	}
	const results = await Promise.allSettled(
		emailRecipients.map((recipient) => sendEmail(recipient.email, emailFor(recipient)))
	);
	for (const result of results) {
		if (result.status === 'rejected') console.error('[notifications] email failed:', result.reason);
	}
}

function recipientLocale(recipient: { locale: string }) {
	return isLocale(recipient.locale) ? recipient.locale : baseLocale;
}

async function resolveTargetRecipients(target: ShareEntity): Promise<Recipient[]> {
	if (target.type === 'user') return getUsersByIds([target.id]);
	if (target.type === 'org') {
		const rows = await db
			.select({ userId: member.userId })
			.from(member)
			.where(eq(member.organizationId, target.id));
		return getUsersByIds(rows.map((row) => row.userId));
	}
	return []; // pending email target: no user rows yet
}

const notificationsUrl = () => `${env.ORIGIN}/app/notifications`;

/**
 * Notifies the share target (in-app + email). For a pending email target the
 * email goes straight to the address; the in-app row is created at signup by
 * the user.create hook in auth.ts.
 */
export async function notifyShareCreated(
	shareId: string,
	sharerName: string,
	target: ShareEntity
): Promise<void> {
	if (target.type === 'email') {
		try {
			await sendEmail(
				target.email,
				calendarSharedEmail(sharerName, notificationsUrl(), baseLocale)
			);
		} catch (error) {
			console.error('[notifications] email failed:', error);
		}
		return;
	}
	const recipients = await resolveTargetRecipients(target);
	const prefs = await getUserChannelPrefs(recipients.map((recipient) => recipient.id));
	await notifyRecipients(
		recipientsForChannel(recipients, prefs, 'sharedInApp'),
		recipientsForChannel(recipients, prefs, 'sharedEmail'),
		'calendar_shared',
		sharerName,
		{ shareId },
		(recipient) => calendarSharedEmail(sharerName, notificationsUrl(), recipientLocale(recipient))
	);
}

/** created/updated/deleted → the stored notification type. */
export function eventNotificationType(
	kind: 'created' | 'updated' | 'deleted'
): 'event_created' | 'event_updated' | 'event_deleted' {
	return kind === 'created'
		? 'event_created'
		: kind === 'updated'
			? 'event_updated'
			: 'event_deleted';
}

/**
 * In-band: resolves the audience, writes the in-app notification rows (fast,
 * local Postgres), then enqueues the slow external delivery (emails + webhooks)
 * with the resolved recipients so the emailed audience matches the in-app one.
 */
export async function notifyEventChange(
	actor: { id: string; name: string },
	kind: 'created' | 'updated' | 'deleted',
	eventTitle: string | null,
	eventType: string,
	range: { allDay: boolean; start: Date; end: Date }
): Promise<void> {
	const recipients = await getEventAudience(actor.id);
	const prefs = await getUserChannelPrefs(recipients.map((recipient) => recipient.id));
	const inAppRecipients = recipientsForChannel(recipients, prefs, 'oooInApp');
	const emailRecipients = recipientsForChannel(recipients, prefs, 'oooEmail');
	if (inAppRecipients.length > 0) {
		await db.insert(notification).values(
			inAppRecipients.map((recipient) => ({
				userId: recipient.id,
				type: eventNotificationType(kind),
				actorName: actor.name,
				data: { eventTitle, eventType } satisfies EventChangeData
			}))
		);
	}
	await enqueueEventDelivery({
		actorId: actor.id,
		actorName: actor.name,
		kind,
		title: eventTitle,
		type: eventType,
		range,
		emailRecipients: emailRecipients.map((recipient) => ({
			email: recipient.email,
			locale: recipient.locale
		}))
	});
}

/**
 * Worker-side: the external delivery for one event change. Best-effort —
 * individual email failures are logged, never thrown; webhook posts run after.
 */
export async function deliverEventChange(payload: EventDeliveryPayload): Promise<void> {
	const results = await Promise.allSettled(
		payload.emailRecipients.map((recipient) => {
			const locale = recipientLocale(recipient);
			const label = payload.title ?? eventTypeLabelFor(payload.type, locale);
			return sendEmail(
				recipient.email,
				eventChangeEmail(
					payload.actorName,
					label,
					payload.kind,
					`${env.ORIGIN}/app/calendar`,
					locale
				)
			);
		})
	);
	for (const result of results) {
		if (result.status === 'rejected') console.error('[notifications] email failed:', result.reason);
	}
	await postEventToTeamChannels(payload.actorId, {
		actorName: payload.actorName,
		kind: payload.kind,
		title: payload.title,
		type: payload.type,
		range: payload.range
	});
}

/** Display name of a share's sharer entity ("Alice" or the team name). */
export async function sharerDisplayName(share: {
	sharerUserId: string | null;
	sharerOrgId: string | null;
}): Promise<string> {
	if (share.sharerUserId) {
		const rows = await db
			.select({ name: user.name })
			.from(user)
			.where(eq(user.id, share.sharerUserId));
		return rows[0]?.name ?? '';
	}
	const rows = await db
		.select({ name: organization.name })
		.from(organization)
		.where(eq(organization.id, share.sharerOrgId ?? ''));
	return rows[0]?.name ?? '';
}
