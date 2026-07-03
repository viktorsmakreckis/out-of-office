import { fail, redirect as kitRedirect } from '@sveltejs/kit';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { redirect } from 'sveltekit-flash-message/server';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '$lib/paraglide/messages.js';
import { invitationActionSchema } from '$lib/schemas/team';
import { shareBackSchema } from '$lib/schemas/share';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { calendarShare, invitation, notification, organization } from '$lib/server/db/schema';
import { notifyShareCreated } from '$lib/server/notifications';
import { createShare, type ShareEntity } from '$lib/server/sharing';
import type { Actions, PageServerLoad } from './$types';

function requireUser(locals: App.Locals) {
	if (!locals.user) throw kitRedirect(303, '/login');
	return locals.user;
}

export const load: PageServerLoad = async ({ locals }) => {
	const currentUser = requireUser(locals);
	const [notifications, pendingInvitations] = await Promise.all([
		db
			.select()
			.from(notification)
			.where(eq(notification.userId, currentUser.id))
			.orderBy(desc(notification.createdAt))
			.limit(50),
		db
			.select({ id: invitation.id, teamName: organization.name })
			.from(invitation)
			.innerJoin(organization, eq(invitation.organizationId, organization.id))
			.where(
				and(
					eq(invitation.email, currentUser.email),
					eq(invitation.status, 'pending'),
					gt(invitation.expiresAt, new Date())
				)
			)
	]);
	// Pending invitation ids: a team_invite notification only shows Accept/Decline
	// while its invitation is still actionable.
	return {
		notifications,
		pendingInvitationIds: pendingInvitations.map((row) => row.id)
	};
};

const PATH = '/app/notifications';

export const actions: Actions = {
	shareBack: async (event) => {
		const form = await superValidate(event.request, zod4(shareBackSchema), { id: 'share-back' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		const [row] = await db
			.select()
			.from(notification)
			.where(
				and(
					eq(notification.id, form.data.notificationId),
					eq(notification.userId, currentUser.id),
					eq(notification.type, 'calendar_shared')
				)
			);
		const shareId = row?.data.shareId;
		if (!shareId) return fail(404, { form });
		const [originalShare] = await db
			.select()
			.from(calendarShare)
			.where(eq(calendarShare.id, shareId));
		if (!originalShare) {
			redirect(303, PATH, { type: 'error', message: m.share_back_gone() }, event);
		}
		const target: ShareEntity = originalShare.sharerUserId
			? { type: 'user', id: originalShare.sharerUserId }
			: { type: 'org', id: originalShare.sharerOrgId! };
		const created = await createShare({ type: 'user', id: currentUser.id }, target, currentUser.id);
		if (created !== 'duplicate') {
			await notifyShareCreated(created.id, currentUser.name, target);
		}
		redirect(303, PATH, { type: 'success', message: m.share_back_done() }, event);
	},

	acceptInvitation: async (event) => {
		const form = await superValidate(event.request, zod4(invitationActionSchema), {
			id: 'invitation'
		});
		if (!form.valid) return fail(400, { form });
		requireUser(event.locals);
		try {
			await auth.api.acceptInvitation({
				body: { invitationId: form.data.invitationId },
				headers: event.request.headers
			});
		} catch {
			redirect(303, PATH, { type: 'error', message: m.invitation_gone() }, event);
		}
		redirect(303, PATH, { type: 'success', message: m.invitation_accepted() }, event);
	},

	declineInvitation: async (event) => {
		const form = await superValidate(event.request, zod4(invitationActionSchema), {
			id: 'invitation'
		});
		if (!form.valid) return fail(400, { form });
		requireUser(event.locals);
		try {
			await auth.api.rejectInvitation({
				body: { invitationId: form.data.invitationId },
				headers: event.request.headers
			});
		} catch {
			redirect(303, PATH, { type: 'error', message: m.invitation_gone() }, event);
		}
		redirect(303, PATH, { type: 'success', message: m.invitation_declined() }, event);
	},

	markAllRead: async (event) => {
		const currentUser = requireUser(event.locals);
		await db
			.update(notification)
			.set({ readAt: new Date() })
			.where(and(eq(notification.userId, currentUser.id), isNull(notification.readAt)));
		redirect(303, PATH, { type: 'success', message: m.notifications_marked_read() }, event);
	}
};
