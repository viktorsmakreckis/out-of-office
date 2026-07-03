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
	type NotificationData
} from '$lib/server/db/schema';
import {
	calendarSharedEmail,
	eventChangeEmail,
	sendEmail,
	type EmailContent
} from '$lib/server/email';
import { postEventToTeamChannels } from '$lib/server/integrations/webhooks';
import { getEventAudience, getUsersByIds, type Recipient, type ShareEntity } from './sharing';

type NotificationType = 'team_invite' | 'calendar_shared' | 'event_created' | 'event_updated';

/** Inserts in-app rows and sends emails; email failures are logged, never thrown. */
async function notifyRecipients(
	recipients: Recipient[],
	type: NotificationType,
	actorName: string,
	data: NotificationData,
	emailFor: (recipient: Recipient) => EmailContent
): Promise<void> {
	if (recipients.length === 0) return;
	await db
		.insert(notification)
		.values(recipients.map((recipient) => ({ userId: recipient.id, type, actorName, data })));
	const results = await Promise.allSettled(
		recipients.map((recipient) => sendEmail(recipient.email, emailFor(recipient)))
	);
	for (const result of results) {
		if (result.status === 'rejected') console.error('[notifications] email failed:', result.reason);
	}
}

function recipientLocale(recipient: Recipient) {
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
	await notifyRecipients(recipients, 'calendar_shared', sharerName, { shareId }, (recipient) =>
		calendarSharedEmail(sharerName, notificationsUrl(), recipientLocale(recipient))
	);
}

/** Notifies everyone who can see the actor's calendar about a created/updated event. */
export async function notifyEventChange(
	actor: { id: string; name: string },
	kind: 'created' | 'updated',
	eventTitle: string | null,
	eventType: string,
	range: { allDay: boolean; start: Date; end: Date }
): Promise<void> {
	const recipients = await getEventAudience(actor.id);
	const type = kind === 'created' ? 'event_created' : 'event_updated';
	await notifyRecipients(recipients, type, actor.name, { eventTitle, eventType }, (recipient) => {
		const locale = recipientLocale(recipient);
		const label = eventTitle ?? eventTypeLabelFor(eventType, locale);
		return eventChangeEmail(actor.name, label, kind, `${env.ORIGIN}/app/calendar`, locale);
	});
	await postEventToTeamChannels(actor.id, {
		actorName: actor.name,
		kind,
		title: eventTitle,
		type: eventType,
		range
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
