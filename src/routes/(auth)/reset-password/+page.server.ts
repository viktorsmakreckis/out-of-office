import { fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import { setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '$lib/paraglide/messages.js';
import { resetPasswordSchema } from '$lib/schemas/auth';
import { auth } from '$lib/server/auth';
import { authErrorMessage } from '$lib/server/auth-error';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const token = event.url.searchParams.get('token');
	if (!token || event.url.searchParams.get('error')) {
		redirect(303, '/forgot-password', { type: 'error', message: m.auth_reset_invalid() }, event);
	}
	const form = await superValidate({ token }, zod4(resetPasswordSchema), { errors: false });
	return { form };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(resetPasswordSchema));
		if (!form.valid) return fail(400, { form });

		try {
			await auth.api.resetPassword({
				body: { newPassword: form.data.password, token: form.data.token }
			});
		} catch (error) {
			return setError(form, '', authErrorMessage(error));
		}

		redirect(303, '/login', { type: 'success', message: m.auth_reset_success() }, event);
	}
};
