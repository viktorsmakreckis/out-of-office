import { fail, redirect as kitRedirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { redirect } from 'sveltekit-flash-message/server';
import { setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '$lib/paraglide/messages.js';
import { createTeamSchema } from '$lib/schemas/team';
import { auth } from '$lib/server/auth';
import { authErrorMessage } from '$lib/server/auth-error';
import { db } from '$lib/server/db';
import { member, organization } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

function requireUser(locals: App.Locals) {
	if (!locals.user) throw kitRedirect(303, '/login');
	return locals.user;
}

/** Unique, URL-safe slug; better-auth requires one per organization. */
function teamSlug(name: string): string {
	const base = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, 40)
		.replace(/(^-|-$)/g, '');
	return `${base || 'team'}-${crypto.randomUUID().slice(0, 8)}`;
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	const [teams, createForm] = await Promise.all([
		db
			.select({ id: organization.id, name: organization.name, role: member.role })
			.from(member)
			.innerJoin(organization, eq(member.organizationId, organization.id))
			.where(eq(member.userId, user.id))
			.orderBy(organization.name),
		superValidate(zod4(createTeamSchema))
	]);
	return { teams, createForm };
};

export const actions: Actions = {
	create: async (event) => {
		const form = await superValidate(event.request, zod4(createTeamSchema));
		if (!form.valid) return fail(400, { form });
		requireUser(event.locals);
		try {
			await auth.api.createOrganization({
				body: { name: form.data.name, slug: teamSlug(form.data.name) },
				headers: event.request.headers
			});
		} catch (error) {
			return setError(form, '', authErrorMessage(error));
		}
		redirect(303, '/app/teams', { type: 'success', message: m.team_created() }, event);
	}
};
