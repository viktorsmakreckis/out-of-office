import { error, fail, redirect as kitRedirect } from '@sveltejs/kit';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { redirect } from 'sveltekit-flash-message/server';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '$lib/paraglide/messages.js';
import { shareIdSchema, shareTargetSchema } from '$lib/schemas/share';
import { db } from '$lib/server/db';
import {
	calendarShare,
	calendarShareHide,
	member,
	organization,
	user
} from '$lib/server/db/schema';
import { notifyShareCreated } from '$lib/server/notifications';
import { createShare, type ShareEntity } from '$lib/server/sharing';
import type { Actions, PageServerLoad } from './$types';

function requireUser(locals: App.Locals) {
	if (!locals.user) throw kitRedirect(303, '/login');
	return locals.user;
}

/** Name lookup maps for rendering share rows. */
async function nameMaps(userIds: string[], orgIds: string[]) {
	const [users, orgs] = await Promise.all([
		userIds.length
			? db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds))
			: [],
		orgIds.length
			? db
					.select({ id: organization.id, name: organization.name })
					.from(organization)
					.where(inArray(organization.id, orgIds))
			: []
	]);
	return {
		userNames: new Map(users.map((u) => [u.id, u.name])),
		orgNames: new Map(orgs.map((o) => [o.id, o.name]))
	};
}

export const load: PageServerLoad = async ({ locals }) => {
	const currentUser = requireUser(locals);
	const myOrgRows = await db
		.select({ id: organization.id, name: organization.name })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, currentUser.id));
	const myOrgIds = myOrgRows.map((row) => row.id);

	const receivedFilters = [eq(calendarShare.targetUserId, currentUser.id)];
	if (myOrgIds.length > 0) receivedFilters.push(inArray(calendarShare.targetOrgId, myOrgIds));

	const [given, received] = await Promise.all([
		db
			.select()
			.from(calendarShare)
			.where(eq(calendarShare.sharerUserId, currentUser.id))
			.orderBy(desc(calendarShare.createdAt)),
		db
			.select({ share: calendarShare, hiddenBy: calendarShareHide.userId })
			.from(calendarShare)
			.leftJoin(
				calendarShareHide,
				and(
					eq(calendarShareHide.shareId, calendarShare.id),
					eq(calendarShareHide.userId, currentUser.id)
				)
			)
			.where(or(...receivedFilters))
			.orderBy(desc(calendarShare.createdAt))
	]);

	const { userNames, orgNames } = await nameMaps(
		[
			...given.flatMap((s) => (s.targetUserId ? [s.targetUserId] : [])),
			...received.flatMap((r) => (r.share.sharerUserId ? [r.share.sharerUserId] : []))
		],
		[
			...given.flatMap((s) => (s.targetOrgId ? [s.targetOrgId] : [])),
			...received.flatMap((r) => (r.share.sharerOrgId ? [r.share.sharerOrgId] : []))
		]
	);

	const shareForm = await superValidate(zod4(shareTargetSchema), { id: 'share' });

	return {
		myTeams: myOrgRows,
		givenShares: given.map((share) => ({
			id: share.id,
			pending: share.targetEmail !== null,
			label: share.targetUserId
				? (userNames.get(share.targetUserId) ?? '')
				: share.targetOrgId
					? m.share_from_team({ name: orgNames.get(share.targetOrgId) ?? '' })
					: (share.targetEmail ?? '')
		})),
		receivedShares: received.map(({ share, hiddenBy }) => ({
			id: share.id,
			hidden: hiddenBy !== null,
			label: share.sharerUserId
				? (userNames.get(share.sharerUserId) ?? '')
				: m.share_from_team({ name: orgNames.get(share.sharerOrgId ?? '') ?? '' })
		})),
		shareForm
	};
};

export const actions: Actions = {
	share: async (event) => {
		const form = await superValidate(event.request, zod4(shareTargetSchema), { id: 'share' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);

		let target: ShareEntity;
		if (form.data.targetType === 'team') {
			target = { type: 'org', id: form.data.teamId };
		} else {
			if (form.data.email.toLowerCase() === currentUser.email.toLowerCase()) {
				redirect(303, '/app/sharing', { type: 'error', message: m.share_self() }, event);
			}
			const [existing] = await db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.email, form.data.email))
				.limit(1);
			target = existing
				? { type: 'user', id: existing.id }
				: { type: 'email', email: form.data.email };
		}
		const created = await createShare({ type: 'user', id: currentUser.id }, target, currentUser.id);
		if (created === 'duplicate') {
			redirect(303, '/app/sharing', { type: 'error', message: m.share_duplicate() }, event);
		}
		await notifyShareCreated(created.id, currentUser.name, target);
		redirect(303, '/app/sharing', { type: 'success', message: m.share_created() }, event);
	},

	revoke: async (event) => {
		const form = await superValidate(event.request, zod4(shareIdSchema), { id: 'revoke' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		const deleted = await db
			.delete(calendarShare)
			.where(
				and(eq(calendarShare.id, form.data.id), eq(calendarShare.sharerUserId, currentUser.id))
			)
			.returning({ id: calendarShare.id });
		if (deleted.length === 0) error(404);
		redirect(303, '/app/sharing', { type: 'success', message: m.share_revoked() }, event);
	},

	hide: async (event) => {
		const form = await superValidate(event.request, zod4(shareIdSchema), { id: 'hide' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);

		const myOrgRows = await db
			.select({ id: organization.id })
			.from(member)
			.innerJoin(organization, eq(member.organizationId, organization.id))
			.where(eq(member.userId, currentUser.id));
		const myOrgIds = myOrgRows.map((row) => row.id);

		const receivedFilters = [eq(calendarShare.targetUserId, currentUser.id)];
		if (myOrgIds.length > 0) receivedFilters.push(inArray(calendarShare.targetOrgId, myOrgIds));

		const [existing] = await db
			.select({ id: calendarShare.id })
			.from(calendarShare)
			.where(and(eq(calendarShare.id, form.data.id), or(...receivedFilters)))
			.limit(1);
		if (!existing) error(404);

		await db
			.insert(calendarShareHide)
			.values({ userId: currentUser.id, shareId: form.data.id })
			.onConflictDoNothing();
		redirect(303, '/app/sharing', { type: 'success', message: m.share_hidden() }, event);
	},

	unhide: async (event) => {
		const form = await superValidate(event.request, zod4(shareIdSchema), { id: 'hide' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		await db
			.delete(calendarShareHide)
			.where(
				and(
					eq(calendarShareHide.userId, currentUser.id),
					eq(calendarShareHide.shareId, form.data.id)
				)
			);
		redirect(303, '/app/sharing', { type: 'success', message: m.share_unhidden() }, event);
	}
};
