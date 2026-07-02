import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendarShare, calendarShareHide, member, user } from '$lib/server/db/schema';

export type MembershipRow = { organizationId: string; userId: string };
export type ShareRow = {
	id: string;
	sharerUserId: string | null;
	sharerOrgId: string | null;
	targetUserId: string | null;
	targetOrgId: string | null;
};
export type ShareEntity =
	{ type: 'user'; id: string } | { type: 'org'; id: string } | { type: 'email'; email: string };

function membersByOrg(memberships: MembershipRow[]): Map<string, string[]> {
	const map = new Map<string, string[]>();
	for (const row of memberships) {
		const list = map.get(row.organizationId);
		if (list) list.push(row.userId);
		else map.set(row.organizationId, [row.userId]);
	}
	return map;
}

function orgIdsOf(userId: string, memberships: MembershipRow[]): Set<string> {
	return new Set(memberships.filter((m) => m.userId === userId).map((m) => m.organizationId));
}

/**
 * Owners whose calendars the viewer can see, excluding the viewer.
 * 'team' (shared org membership) wins over 'share' when both apply.
 * `shares` must already exclude shares the viewer has hidden.
 */
export function resolveVisibleOwners(
	viewerId: string,
	memberships: MembershipRow[],
	shares: ShareRow[]
): Map<string, 'team' | 'share'> {
	const byOrg = membersByOrg(memberships);
	const viewerOrgs = orgIdsOf(viewerId, memberships);
	const result = new Map<string, 'team' | 'share'>();
	for (const orgId of viewerOrgs) {
		for (const userId of byOrg.get(orgId) ?? []) {
			if (userId !== viewerId) result.set(userId, 'team');
		}
	}
	for (const share of shares) {
		const targetsViewer =
			share.targetUserId === viewerId ||
			(share.targetOrgId !== null && viewerOrgs.has(share.targetOrgId));
		if (!targetsViewer) continue;
		const owners = share.sharerUserId
			? [share.sharerUserId]
			: (byOrg.get(share.sharerOrgId ?? '') ?? []);
		for (const userId of owners) {
			if (userId !== viewerId && !result.has(userId)) result.set(userId, 'share');
		}
	}
	return result;
}

/** Users to notify about a change to the owner's calendar, excluding the owner. */
export function resolveEventAudience(
	ownerId: string,
	memberships: MembershipRow[],
	shares: ShareRow[],
	hides: { userId: string; shareId: string }[]
): Set<string> {
	const byOrg = membersByOrg(memberships);
	const ownerOrgs = orgIdsOf(ownerId, memberships);
	const hiddenBy = new Map<string, Set<string>>();
	for (const hide of hides) {
		const set = hiddenBy.get(hide.shareId);
		if (set) set.add(hide.userId);
		else hiddenBy.set(hide.shareId, new Set([hide.userId]));
	}
	const audience = new Set<string>();
	for (const orgId of ownerOrgs) {
		for (const userId of byOrg.get(orgId) ?? []) audience.add(userId);
	}
	for (const share of shares) {
		const coversOwner =
			share.sharerUserId === ownerId ||
			(share.sharerOrgId !== null && ownerOrgs.has(share.sharerOrgId));
		if (!coversOwner) continue;
		const recipients = share.targetUserId
			? [share.targetUserId]
			: (byOrg.get(share.targetOrgId ?? '') ?? []);
		const hidden = hiddenBy.get(share.id);
		for (const userId of recipients) {
			if (!hidden?.has(userId)) audience.add(userId);
		}
	}
	audience.delete(ownerId);
	return audience;
}

const shareColumns = {
	id: calendarShare.id,
	sharerUserId: calendarShare.sharerUserId,
	sharerOrgId: calendarShare.sharerOrgId,
	targetUserId: calendarShare.targetUserId,
	targetOrgId: calendarShare.targetOrgId
};

async function membershipsOfOrgs(orgIds: string[]): Promise<MembershipRow[]> {
	if (orgIds.length === 0) return [];
	return db
		.select({ organizationId: member.organizationId, userId: member.userId })
		.from(member)
		.where(inArray(member.organizationId, orgIds));
}

async function orgIdsOfUser(userId: string): Promise<string[]> {
	const rows = await db
		.select({ organizationId: member.organizationId })
		.from(member)
		.where(eq(member.userId, userId));
	return rows.map((row) => row.organizationId);
}

export type VisibleOwner = { id: string; name: string; via: 'team' | 'share' };

/** All owners (id + display name) whose calendars the viewer can see. */
export async function getVisibleOwners(viewerId: string): Promise<VisibleOwner[]> {
	const viewerOrgIds = await orgIdsOfUser(viewerId);
	const targetFilters = [eq(calendarShare.targetUserId, viewerId)];
	if (viewerOrgIds.length > 0) targetFilters.push(inArray(calendarShare.targetOrgId, viewerOrgIds));
	const shareRows = await db
		.select({ ...shareColumns, hiddenBy: calendarShareHide.userId })
		.from(calendarShare)
		.leftJoin(
			calendarShareHide,
			and(eq(calendarShareHide.shareId, calendarShare.id), eq(calendarShareHide.userId, viewerId))
		)
		.where(or(...targetFilters));
	const shares = shareRows.filter((row) => row.hiddenBy === null);
	const sharerOrgIds = shares.flatMap((s) => (s.sharerOrgId ? [s.sharerOrgId] : []));
	const memberships = await membershipsOfOrgs([...new Set([...viewerOrgIds, ...sharerOrgIds])]);
	const owners = resolveVisibleOwners(viewerId, memberships, shares);
	if (owners.size === 0) return [];
	const users = await db
		.select({ id: user.id, name: user.name })
		.from(user)
		.where(inArray(user.id, [...owners.keys()]));
	return users.map((u) => ({ ...u, via: owners.get(u.id)! }));
}

export type Recipient = { id: string; email: string; name: string; locale: string };

export async function getUsersByIds(ids: string[]): Promise<Recipient[]> {
	if (ids.length === 0) return [];
	return db
		.select({ id: user.id, email: user.email, name: user.name, locale: user.locale })
		.from(user)
		.where(inArray(user.id, ids));
}

/** Everyone to notify about a change to the owner's calendar (owner excluded). */
export async function getEventAudience(ownerId: string): Promise<Recipient[]> {
	const ownerOrgIds = await orgIdsOfUser(ownerId);
	const sharerFilters = [eq(calendarShare.sharerUserId, ownerId)];
	if (ownerOrgIds.length > 0) sharerFilters.push(inArray(calendarShare.sharerOrgId, ownerOrgIds));
	const shares = await db
		.select(shareColumns)
		.from(calendarShare)
		.where(or(...sharerFilters));
	const targetOrgIds = shares.flatMap((s) => (s.targetOrgId ? [s.targetOrgId] : []));
	const memberships = await membershipsOfOrgs([...new Set([...ownerOrgIds, ...targetOrgIds])]);
	const hides =
		shares.length === 0
			? []
			: await db
					.select({ userId: calendarShareHide.userId, shareId: calendarShareHide.shareId })
					.from(calendarShareHide)
					.where(
						inArray(
							calendarShareHide.shareId,
							shares.map((s) => s.id)
						)
					);
	const audience = resolveEventAudience(ownerId, memberships, shares, hides);
	return getUsersByIds([...audience]);
}

function entityColumns(prefix: 'sharer' | 'target', entity: ShareEntity) {
	return {
		[`${prefix}UserId`]: entity.type === 'user' ? entity.id : null,
		[`${prefix}OrgId`]: entity.type === 'org' ? entity.id : null,
		...(prefix === 'target' ? { targetEmail: entity.type === 'email' ? entity.email : null } : {})
	};
}

/** Inserts a share; returns 'duplicate' when the (sharer, target) pair already exists. */
export async function createShare(
	sharer: ShareEntity,
	target: ShareEntity,
	createdById: string
): Promise<{ id: string } | 'duplicate'> {
	const inserted = await db
		.insert(calendarShare)
		.values({
			...entityColumns('sharer', sharer),
			...entityColumns('target', target),
			createdById
		})
		.onConflictDoNothing()
		.returning({ id: calendarShare.id });
	return inserted[0] ?? 'duplicate';
}
