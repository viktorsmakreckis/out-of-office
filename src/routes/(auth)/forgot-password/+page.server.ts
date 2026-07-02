import { fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '$lib/paraglide/messages.js';
import { forgotPasswordSchema } from '$lib/schemas/auth';
import { auth } from '$lib/server/auth';
import { checkRateLimit } from '$lib/server/rate-limit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return { form: await superValidate(zod4(forgotPasswordSchema)) };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(forgotPasswordSchema));
		if (!form.valid) return fail(400, { form });

		const limitOk = await checkRateLimit(
			{ key: `forgot:email:${form.data.email.toLowerCase()}`, max: 3, windowSeconds: 3600 },
			{ key: `forgot:ip:${event.getClientAddress()}`, max: 10, windowSeconds: 3600 }
		);

		if (limitOk) {
			try {
				await auth.api.requestPasswordReset({
					body: { email: form.data.email, redirectTo: '/reset-password' }
				});
			} catch (error) {
				// Always report success so account existence can't be probed.
				console.error('requestPasswordReset failed', error);
			}
		}

		redirect(303, '/login', { type: 'success', message: m.auth_forgot_sent() }, event);
	}
};
