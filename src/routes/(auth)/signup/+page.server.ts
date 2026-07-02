import { fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import { setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { APIError } from 'better-auth/api';
import { m } from '$lib/paraglide/messages.js';
import { getLocale } from '$lib/paraglide/runtime';
import { signupSchema } from '$lib/schemas/auth';
import { auth } from '$lib/server/auth';
import { authErrorMessage } from '$lib/server/auth-error';
import { checkRateLimit } from '$lib/server/rate-limit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const form = await superValidate(zod4(signupSchema));
	// Server-side defaults so the hidden inputs are meaningful without JS.
	form.data.timezone = 'UTC';
	form.data.locale = getLocale();
	return { form };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(signupSchema));
		if (!form.valid) return fail(400, { form });

		const limitOk = await checkRateLimit({
			key: `signup:ip:${event.getClientAddress()}`,
			max: 10,
			windowSeconds: 3600
		});
		if (!limitOk) return setError(form, '', m.rate_limit_exceeded());

		try {
			await auth.api.signUpEmail({
				body: { ...form.data, callbackURL: '/app' },
				headers: event.request.headers
			});
		} catch (error) {
			if (error instanceof APIError && error.body?.code?.startsWith('USER_ALREADY_EXISTS')) {
				return setError(form, 'email', m.auth_error_email_taken());
			}
			return setError(form, '', authErrorMessage(error));
		}

		redirect(
			303,
			`/verify-email?email=${encodeURIComponent(form.data.email)}`,
			{ type: 'success', message: m.auth_signup_success() },
			event
		);
	}
};
