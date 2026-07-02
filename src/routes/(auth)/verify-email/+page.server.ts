import { fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import { setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '$lib/paraglide/messages.js';
import { resendVerificationSchema } from '$lib/schemas/auth';
import { auth } from '$lib/server/auth';
import { authErrorMessage } from '$lib/server/auth-error';
import { checkRateLimit } from '$lib/server/rate-limit';
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

		const limitOk = await checkRateLimit(
			{ key: `resend:email:${form.data.email.toLowerCase()}`, max: 3, windowSeconds: 3600 },
			{ key: `resend:ip:${event.getClientAddress()}`, max: 10, windowSeconds: 3600 }
		);
		if (!limitOk) return setError(form, '', m.rate_limit_exceeded());

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
