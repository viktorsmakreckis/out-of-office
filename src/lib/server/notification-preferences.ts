import { inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { notificationPreference } from '$lib/server/db/schema';

export type ChannelPrefs = {
	oooInApp: boolean;
	oooEmail: boolean;
	sharedInApp: boolean;
	sharedEmail: boolean;
};

export const DEFAULT_CHANNEL_PREFS: ChannelPrefs = {
	oooInApp: true,
	oooEmail: true,
	sharedInApp: true,
	sharedEmail: true
};

/** Recipients whose preference for `channel` is on; a missing prefs entry defaults on. */
export function recipientsForChannel<T extends { id: string }>(
	recipients: T[],
	prefs: Map<string, ChannelPrefs>,
	channel: keyof ChannelPrefs
): T[] {
	return recipients.filter(
		(recipient) => (prefs.get(recipient.id) ?? DEFAULT_CHANNEL_PREFS)[channel]
	);
}

/** id → prefs for the given users. Users with no stored row are simply absent from the map. */
export async function getUserChannelPrefs(userIds: string[]): Promise<Map<string, ChannelPrefs>> {
	if (userIds.length === 0) return new Map();
	const rows = await db
		.select({
			userId: notificationPreference.userId,
			oooInApp: notificationPreference.oooInApp,
			oooEmail: notificationPreference.oooEmail,
			sharedInApp: notificationPreference.sharedInApp,
			sharedEmail: notificationPreference.sharedEmail
		})
		.from(notificationPreference)
		.where(inArray(notificationPreference.userId, userIds));
	return new Map(rows.map(({ userId, ...prefs }) => [userId, prefs]));
}

/** One user's prefs, defaulting to all-on when no row exists (for the settings form). */
export async function getChannelPrefs(userId: string): Promise<ChannelPrefs> {
	return (await getUserChannelPrefs([userId])).get(userId) ?? DEFAULT_CHANNEL_PREFS;
}

/** Upserts the user's prefs row. */
export async function upsertChannelPrefs(userId: string, prefs: ChannelPrefs): Promise<void> {
	await db
		.insert(notificationPreference)
		.values({ userId, ...prefs })
		.onConflictDoUpdate({ target: notificationPreference.userId, set: prefs });
}
