import { error, fail, redirect as kitRedirect } from '@sveltejs/kit';
import { and, desc, eq, gt } from 'drizzle-orm';
import { redirect } from 'sveltekit-flash-message/server';
import { setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '$lib/paraglide/messages.js';
import { addConnectionSchema, connectionIdSchema } from '$lib/schemas/integration';
import {
	inviteMemberSchema,
	memberIdSchema,
	renameTeamSchema,
	updateRoleSchema
} from '$lib/schemas/team';
import { shareIdSchema, shareTargetSchema } from '$lib/schemas/share';
import { auth } from '$lib/server/auth';
import { authErrorMessage } from '$lib/server/auth-error';
import { db } from '$lib/server/db';
import {
	calendarShare,
	integrationConnection,
	invitation,
	member,
	organization,
	user
} from '$lib/server/db/schema';
import {
	feedUrl,
	getOrCreateFeedToken,
	regenerateFeedToken
} from '$lib/server/integrations/feed-tokens';
import { testMessage } from '$lib/server/integrations/message';
import { deliverToConnection, isAllowedWebhookUrl } from '$lib/server/integrations/webhooks';
import { notifyShareCreated } from '$lib/server/notifications';
import { createShare, shareNameMaps, type ShareEntity } from '$lib/server/sharing';
import type { Actions, PageServerLoad } from './$types';

function requireUser(locals: App.Locals) {
	if (!locals.user) throw kitRedirect(303, '/login');
	return locals.user;
}

/** The caller's membership row, or 404 when they are not in this team. */
async function requireMembership(userId: string, orgId: string) {
	const rows = await db
		.select()
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
		.limit(1);
	if (!rows[0]) error(404);
	return rows[0];
}

function requireManager(membership: { role: string }) {
	if (membership.role !== 'owner' && membership.role !== 'admin') error(403, m.error_forbidden());
}

/** Resolves share rows to display labels ("Alice", "Team Design", pending emails). */
async function describeShareTargets(
	shares: (typeof calendarShare.$inferSelect)[]
): Promise<{ id: string; label: string; pending: boolean }[]> {
	const { userNames, orgNames } = await shareNameMaps(
		shares.flatMap((s) => (s.targetUserId ? [s.targetUserId] : [])),
		shares.flatMap((s) => (s.targetOrgId ? [s.targetOrgId] : []))
	);
	return shares.map((share) => ({
		id: share.id,
		pending: share.targetEmail !== null,
		label: share.targetUserId
			? (userNames.get(share.targetUserId) ?? '')
			: share.targetOrgId
				? m.share_from_team({ name: orgNames.get(share.targetOrgId) ?? '' })
				: (share.targetEmail ?? '')
	}));
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const currentUser = requireUser(locals);
	const membership = await requireMembership(currentUser.id, params.id);
	const [team] = await db
		.select({ id: organization.id, name: organization.name })
		.from(organization)
		.where(eq(organization.id, params.id));
	if (!team) error(404);
	const [members, pendingInvitations, teamShares, allTeams] = await Promise.all([
		db
			.select({
				id: member.id,
				userId: member.userId,
				role: member.role,
				name: user.name,
				email: user.email
			})
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(eq(member.organizationId, params.id))
			.orderBy(user.name),
		db
			.select({ id: invitation.id, email: invitation.email, role: invitation.role })
			.from(invitation)
			.where(
				and(
					eq(invitation.organizationId, params.id),
					eq(invitation.status, 'pending'),
					gt(invitation.expiresAt, new Date())
				)
			),
		db
			.select()
			.from(calendarShare)
			.where(eq(calendarShare.sharerOrgId, params.id))
			.orderBy(desc(calendarShare.createdAt)),
		db
			.select({ id: organization.id, name: organization.name })
			.from(organization)
			.orderBy(organization.name)
	]);
	const [inviteForm, renameForm, shareForm] = await Promise.all([
		superValidate(zod4(inviteMemberSchema), { id: 'invite' }),
		superValidate({ name: team.name }, zod4(renameTeamSchema), { id: 'rename' }),
		superValidate(zod4(shareTargetSchema), { id: 'share' })
	]);
	const canManage = membership.role === 'owner' || membership.role === 'admin';
	const integrations = canManage
		? {
				connections: await db
					.select({
						id: integrationConnection.id,
						provider: integrationConnection.provider,
						label: integrationConnection.label,
						consecutiveFailures: integrationConnection.consecutiveFailures,
						lastFailureAt: integrationConnection.lastFailureAt
					})
					.from(integrationConnection)
					.where(eq(integrationConnection.orgId, params.id))
					.orderBy(integrationConnection.createdAt),
				feedUrl: feedUrl(await getOrCreateFeedToken({ type: 'org', id: params.id })),
				connectionForm: await superValidate(zod4(addConnectionSchema), { id: 'connection' })
			}
		: null;
	return {
		team,
		members,
		pendingInvitations,
		shares: await describeShareTargets(teamShares),
		// Teams the team calendar could be shared with (any team; exclude this team itself).
		shareableTeams: allTeams.filter((t) => t.id !== params.id),
		myRole: membership.role,
		inviteForm,
		renameForm,
		shareForm,
		integrations
	};
};

const teamPath = (id: string) => `/app/teams/${id}`;

export const actions: Actions = {
	invite: async (event) => {
		const form = await superValidate(event.request, zod4(inviteMemberSchema), { id: 'invite' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		requireManager(await requireMembership(currentUser.id, event.params.id));
		try {
			await auth.api.createInvitation({
				body: {
					email: form.data.email,
					role: form.data.role,
					organizationId: event.params.id,
					resend: true
				},
				headers: event.request.headers
			});
		} catch (err) {
			return setError(form, '', authErrorMessage(err));
		}
		redirect(
			303,
			teamPath(event.params.id),
			{ type: 'success', message: m.team_invite_sent() },
			event
		);
	},

	// requireManager is the first layer; better-auth's removeMember/updateMemberRole are the
	// second — they reject removing/demoting the owner and reject memberIds outside organizationId.
	removeMember: async (event) => {
		const form = await superValidate(event.request, zod4(memberIdSchema), { id: 'member' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		requireManager(await requireMembership(currentUser.id, event.params.id));
		try {
			await auth.api.removeMember({
				body: { memberIdOrEmail: form.data.memberId, organizationId: event.params.id },
				headers: event.request.headers
			});
		} catch (err) {
			return setError(form, '', authErrorMessage(err));
		}
		redirect(
			303,
			teamPath(event.params.id),
			{ type: 'success', message: m.team_member_removed() },
			event
		);
	},

	// See removeMember above: better-auth enforces owner-immutability and org-scoped memberIds.
	updateRole: async (event) => {
		const form = await superValidate(event.request, zod4(updateRoleSchema), { id: 'role' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		requireManager(await requireMembership(currentUser.id, event.params.id));
		try {
			await auth.api.updateMemberRole({
				body: {
					memberId: form.data.memberId,
					role: form.data.role,
					organizationId: event.params.id
				},
				headers: event.request.headers
			});
		} catch (err) {
			return setError(form, '', authErrorMessage(err));
		}
		redirect(
			303,
			teamPath(event.params.id),
			{ type: 'success', message: m.team_role_updated() },
			event
		);
	},

	transferOwnership: async (event) => {
		const form = await superValidate(event.request, zod4(memberIdSchema), { id: 'member' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		const membership = await requireMembership(currentUser.id, event.params.id);
		if (membership.role !== 'owner') error(403, m.error_forbidden());
		try {
			// Accepted risk: these two calls are not transactional. If the promote succeeds and
			// this self-demote fails, the team temporarily has two owners; re-running the action
			// completes the demotion.
			await auth.api.updateMemberRole({
				body: { memberId: form.data.memberId, role: 'owner', organizationId: event.params.id },
				headers: event.request.headers
			});
			await auth.api.updateMemberRole({
				body: { memberId: membership.id, role: 'admin', organizationId: event.params.id },
				headers: event.request.headers
			});
		} catch (err) {
			return setError(form, '', authErrorMessage(err));
		}
		redirect(
			303,
			teamPath(event.params.id),
			{ type: 'success', message: m.team_transferred() },
			event
		);
	},

	rename: async (event) => {
		const form = await superValidate(event.request, zod4(renameTeamSchema), { id: 'rename' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		const membership = await requireMembership(currentUser.id, event.params.id);
		if (membership.role !== 'owner') error(403, m.error_forbidden());
		try {
			await auth.api.updateOrganization({
				body: { organizationId: event.params.id, data: { name: form.data.name } },
				headers: event.request.headers
			});
		} catch (err) {
			return setError(form, '', authErrorMessage(err));
		}
		redirect(303, teamPath(event.params.id), { type: 'success', message: m.team_renamed() }, event);
	},

	deleteTeam: async (event) => {
		const currentUser = requireUser(event.locals);
		const membership = await requireMembership(currentUser.id, event.params.id);
		if (membership.role !== 'owner') error(403, m.error_forbidden());
		try {
			await auth.api.deleteOrganization({
				body: { organizationId: event.params.id },
				headers: event.request.headers
			});
		} catch {
			redirect(
				303,
				teamPath(event.params.id),
				{ type: 'error', message: m.error_generic() },
				event
			);
		}
		redirect(303, '/app/teams', { type: 'success', message: m.team_deleted() }, event);
	},

	leave: async (event) => {
		const currentUser = requireUser(event.locals);
		await requireMembership(currentUser.id, event.params.id);
		try {
			await auth.api.leaveOrganization({
				body: { organizationId: event.params.id },
				headers: event.request.headers
			});
		} catch {
			redirect(
				303,
				teamPath(event.params.id),
				{ type: 'error', message: m.error_generic() },
				event
			);
		}
		redirect(303, '/app/teams', { type: 'success', message: m.team_left() }, event);
	},

	share: async (event) => {
		const form = await superValidate(event.request, zod4(shareTargetSchema), { id: 'share' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		requireManager(await requireMembership(currentUser.id, event.params.id));

		let target: ShareEntity;
		if (form.data.targetType === 'team') {
			if (form.data.teamId === event.params.id) return fail(400, { form });
			const [org] = await db
				.select({ id: organization.id })
				.from(organization)
				.where(eq(organization.id, form.data.teamId));
			if (!org) return setError(form, 'teamId', m.error_generic());
			target = { type: 'org', id: form.data.teamId };
		} else {
			const [existing] = await db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.email, form.data.email))
				.limit(1);
			target = existing
				? { type: 'user', id: existing.id }
				: { type: 'email', email: form.data.email };
		}
		const [team] = await db
			.select({ name: organization.name })
			.from(organization)
			.where(eq(organization.id, event.params.id));
		const created = await createShare({ type: 'org', id: event.params.id }, target, currentUser.id);
		if (created === 'duplicate') {
			redirect(
				303,
				teamPath(event.params.id),
				{ type: 'error', message: m.share_duplicate() },
				event
			);
		}
		await notifyShareCreated(created.id, team?.name ?? '', target);
		redirect(
			303,
			teamPath(event.params.id),
			{ type: 'success', message: m.share_created() },
			event
		);
	},

	revokeShare: async (event) => {
		const form = await superValidate(event.request, zod4(shareIdSchema), { id: 'revoke' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		requireManager(await requireMembership(currentUser.id, event.params.id));
		const deleted = await db
			.delete(calendarShare)
			.where(
				and(eq(calendarShare.id, form.data.id), eq(calendarShare.sharerOrgId, event.params.id))
			)
			.returning({ id: calendarShare.id });
		if (deleted.length === 0) error(404);
		redirect(
			303,
			teamPath(event.params.id),
			{ type: 'success', message: m.share_revoked() },
			event
		);
	},

	addConnection: async (event) => {
		const form = await superValidate(event.request, zod4(addConnectionSchema), {
			id: 'connection'
		});
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		requireManager(await requireMembership(currentUser.id, event.params.id));
		if (!isAllowedWebhookUrl(form.data.provider, form.data.webhookUrl)) {
			return setError(form, 'webhookUrl', m.integrations_invalid_webhook_url());
		}
		await db.insert(integrationConnection).values({
			orgId: event.params.id,
			provider: form.data.provider,
			webhookUrl: form.data.webhookUrl,
			label: form.data.label === '' ? null : form.data.label,
			createdById: currentUser.id
		});
		redirect(
			303,
			teamPath(event.params.id),
			{ type: 'success', message: m.integrations_added() },
			event
		);
	},

	removeConnection: async (event) => {
		const form = await superValidate(event.request, zod4(connectionIdSchema), {
			id: 'connection-id'
		});
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		requireManager(await requireMembership(currentUser.id, event.params.id));
		const deleted = await db
			.delete(integrationConnection)
			.where(
				and(
					eq(integrationConnection.id, form.data.id),
					eq(integrationConnection.orgId, event.params.id)
				)
			)
			.returning({ id: integrationConnection.id });
		if (deleted.length === 0) error(404);
		redirect(
			303,
			teamPath(event.params.id),
			{ type: 'success', message: m.integrations_removed() },
			event
		);
	},

	testConnection: async (event) => {
		const form = await superValidate(event.request, zod4(connectionIdSchema), {
			id: 'connection-id'
		});
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		requireManager(await requireMembership(currentUser.id, event.params.id));
		const [connection] = await db
			.select()
			.from(integrationConnection)
			.where(
				and(
					eq(integrationConnection.id, form.data.id),
					eq(integrationConnection.orgId, event.params.id)
				)
			);
		if (!connection) error(404);
		const ok = await deliverToConnection(connection, testMessage());
		redirect(
			303,
			teamPath(event.params.id),
			ok
				? { type: 'success', message: m.integrations_test_sent() }
				: { type: 'error', message: m.integrations_test_failed() },
			event
		);
	},

	regenerateFeed: async (event) => {
		const currentUser = requireUser(event.locals);
		requireManager(await requireMembership(currentUser.id, event.params.id));
		await regenerateFeedToken({ type: 'org', id: event.params.id });
		redirect(
			303,
			teamPath(event.params.id),
			{ type: 'success', message: m.feed_regenerated() },
			event
		);
	}
};
