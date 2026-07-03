import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { calendarFeedToken } from '$lib/server/db/schema';

export type FeedOwner = { type: 'user' | 'org'; id: string };

function ownerColumns(owner: FeedOwner) {
	return {
		userId: owner.type === 'user' ? owner.id : null,
		orgId: owner.type === 'org' ? owner.id : null
	};
}

function ownerFilter(owner: FeedOwner) {
	return owner.type === 'user'
		? eq(calendarFeedToken.userId, owner.id)
		: eq(calendarFeedToken.orgId, owner.id);
}

/** Lazily creates the owner's feed token on first access. */
export async function getOrCreateFeedToken(owner: FeedOwner): Promise<string> {
	const inserted = await db
		.insert(calendarFeedToken)
		.values(ownerColumns(owner))
		.onConflictDoNothing()
		.returning({ token: calendarFeedToken.token });
	if (inserted[0]) return inserted[0].token;
	const [existing] = await db
		.select({ token: calendarFeedToken.token })
		.from(calendarFeedToken)
		.where(ownerFilter(owner));
	return existing.token;
}

/** Atomically swaps the token; the old feed URL 404s immediately. */
export async function regenerateFeedToken(owner: FeedOwner): Promise<string> {
	return db.transaction(async (tx) => {
		await tx.delete(calendarFeedToken).where(ownerFilter(owner));
		const [row] = await tx
			.insert(calendarFeedToken)
			.values(ownerColumns(owner))
			.returning({ token: calendarFeedToken.token });
		return row.token;
	});
}

export const feedUrl = (token: string) => `${env.ORIGIN}/feeds/${token}.ics`;
