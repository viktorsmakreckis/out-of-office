import { fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import { setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { m } from '$lib/paraglide/messages.js';
import { baseLocale, cookieMaxAge, cookieName, isLocale } from '$lib/paraglide/runtime';
import {
	changeEmailSchema,
	changePasswordSchema,
	deleteAccountSchema,
	profileSchema
} from '$lib/schemas/auth';
import { auth } from '$lib/server/auth';
import { authErrorMessage } from '$lib/server/auth-error';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	const [profileForm, emailForm, passwordForm, deleteForm] = await Promise.all([
		superValidate(
			{
				name: user.name,
				locale: isLocale(user.locale) ? user.locale : baseLocale,
				timezone: user.timezone
			},
			zod4(profileSchema),
			{ id: 'profile', errors: false }
		),
		superValidate(zod4(changeEmailSchema), { id: 'changeEmail' }),
		superValidate(zod4(changePasswordSchema), { id: 'changePassword' }),
		superValidate(zod4(deleteAccountSchema), { id: 'deleteAccount' })
	]);
	return { profileForm, emailForm, passwordForm, deleteForm };
};

export const actions: Actions = {
	profile: async (event) => {
		const form = await superValidate(event.request, zod4(profileSchema), { id: 'profile' });
		if (!form.valid) return fail(400, { form });

		try {
			await auth.api.updateUser({ body: form.data, headers: event.request.headers });
		} catch (error) {
			return setError(form, '', authErrorMessage(error));
		}

		event.cookies.set(cookieName, form.data.locale, { path: '/', maxAge: cookieMaxAge });
		redirect(
			303,
			'/app/settings',
			{ type: 'success', message: m.settings_profile_saved({}, { locale: form.data.locale }) },
			event
		);
	},
	changeEmail: async (event) => {
		const form = await superValidate(event.request, zod4(changeEmailSchema), {
			id: 'changeEmail'
		});
		if (!form.valid) return fail(400, { form });

		try {
			await auth.api.changeEmail({
				body: { newEmail: form.data.newEmail, callbackURL: '/app/settings' },
				headers: event.request.headers
			});
		} catch (error) {
			return setError(form, 'newEmail', authErrorMessage(error));
		}

		redirect(303, '/app/settings', { type: 'success', message: m.settings_email_sent() }, event);
	},
	changePassword: async (event) => {
		const form = await superValidate(event.request, zod4(changePasswordSchema), {
			id: 'changePassword'
		});
		if (!form.valid) return fail(400, { form });

		try {
			await auth.api.changePassword({
				body: {
					currentPassword: form.data.currentPassword,
					newPassword: form.data.newPassword,
					revokeOtherSessions: true
				},
				headers: event.request.headers
			});
		} catch (error) {
			return setError(form, 'currentPassword', authErrorMessage(error));
		}

		redirect(
			303,
			'/app/settings',
			{ type: 'success', message: m.settings_password_saved() },
			event
		);
	},
	deleteAccount: async (event) => {
		const form = await superValidate(event.request, zod4(deleteAccountSchema), {
			id: 'deleteAccount'
		});
		if (!form.valid) return fail(400, { form });

		try {
			await auth.api.deleteUser({
				body: { password: form.data.password },
				headers: event.request.headers
			});
		} catch (error) {
			return setError(form, 'password', authErrorMessage(error));
		}

		redirect(303, '/login', { type: 'success', message: m.settings_deleted() }, event);
	}
};
