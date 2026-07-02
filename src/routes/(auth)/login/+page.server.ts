import { fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import { setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { APIError } from 'better-auth/api';
import { m } from '$lib/paraglide/messages.js';
import { loginSchema } from '$lib/schemas/auth';
import { auth } from '$lib/server/auth';
import { authErrorMessage } from '$lib/server/auth-error';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return { form: await superValidate(zod4(loginSchema)) };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(loginSchema));
		if (!form.valid) return fail(400, { form });

		try {
			await auth.api.signInEmail({
				body: { email: form.data.email, password: form.data.password },
				headers: event.request.headers
			});
		} catch (error) {
			if (error instanceof APIError && error.body?.code === 'EMAIL_NOT_VERIFIED') {
				redirect(
					303,
					`/verify-email?email=${encodeURIComponent(form.data.email)}`,
					{ type: 'info', message: m.auth_error_email_not_verified() },
					event
				);
			}
			return setError(form, '', authErrorMessage(error));
		}

		redirect(303, '/app');
	}
};
