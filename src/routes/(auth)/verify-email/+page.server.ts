import { fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import { setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '$lib/paraglide/messages.js';
import { resendVerificationSchema } from '$lib/schemas/auth';
import { auth } from '$lib/server/auth';
import { authErrorMessage } from '$lib/server/auth-error';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const form = await superValidate(
		{ email: url.searchParams.get('email') ?? '' },
		zod4(resendVerificationSchema),
		{ errors: false }
	);
	return { form };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(resendVerificationSchema));
		if (!form.valid) return fail(400, { form });

		try {
			await auth.api.sendVerificationEmail({
				body: { email: form.data.email, callbackURL: '/app' }
			});
		} catch (error) {
			return setError(form, '', authErrorMessage(error));
		}

		redirect(
			303,
			`/verify-email?email=${encodeURIComponent(form.data.email)}`,
			{ type: 'success', message: m.auth_verify_resent() },
			event
		);
	}
};
