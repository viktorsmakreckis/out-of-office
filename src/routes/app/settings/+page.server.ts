import { fail, redirect as kitRedirect } from '@sveltejs/kit';
import { redirect, setFlash } from 'sveltekit-flash-message/server';
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
import { notificationPreferencesSchema } from '$lib/schemas/notification';
import { auth } from '$lib/server/auth';
import { authErrorMessage } from '$lib/server/auth-error';
import {
	feedUrl,
	getOrCreateFeedToken,
	regenerateFeedToken
} from '$lib/server/integrations/feed-tokens';
import { getChannelPrefs, upsertChannelPrefs } from '$lib/server/notification-preferences';
import { checkRateLimit } from '$lib/server/rate-limit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	const channelPrefs = await getChannelPrefs(user.id);
	const [profileForm, emailForm, passwordForm, deleteForm, notificationsForm] = await Promise.all([
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
		superValidate(zod4(deleteAccountSchema), { id: 'deleteAccount' }),
		superValidate(channelPrefs, zod4(notificationPreferencesSchema), {
			id: 'notifications',
			errors: false
		})
	]);
	return {
		profileForm,
		emailForm,
		passwordForm,
		deleteForm,
		notificationsForm,
		feedUrl: feedUrl(await getOrCreateFeedToken({ type: 'user', id: user.id }))
	};
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

		event.cookies.set(cookieName, form.data.locale, {
			path: '/',
			maxAge: cookieMaxAge,
			httpOnly: false
		});
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

		const user = event.locals.user;
		if (!user) throw kitRedirect(303, '/login');
		const limitOk = await checkRateLimit({
			key: `change-email:user:${user.id}`,
			max: 3,
			windowSeconds: 3600
		});
		if (!limitOk) return setError(form, 'newEmail', m.rate_limit_exceeded());

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

		const user = event.locals.user;
		if (!user) throw kitRedirect(303, '/login');
		const limitOk = await checkRateLimit({
			key: `change-password:user:${user.id}`,
			max: 5,
			windowSeconds: 900
		});
		if (!limitOk) return setError(form, 'currentPassword', m.rate_limit_exceeded());

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
	notifications: async (event) => {
		const form = await superValidate(event.request, zod4(notificationPreferencesSchema), {
			id: 'notifications'
		});
		if (!form.valid) return fail(400, { form });

		const user = event.locals.user;
		if (!user) throw kitRedirect(303, '/login');
		await upsertChannelPrefs(user.id, form.data);

		redirect(
			303,
			'/app/settings',
			{ type: 'success', message: m.settings_notifications_saved() },
			event
		);
	},
	deleteAccount: async (event) => {
		const form = await superValidate(event.request, zod4(deleteAccountSchema), {
			id: 'deleteAccount'
		});
		if (!form.valid) return fail(400, { form });

		const user = event.locals.user;
		if (!user) throw kitRedirect(303, '/login');
		const limitOk = await checkRateLimit({
			key: `delete-account:user:${user.id}`,
			max: 5,
			windowSeconds: 900
		});
		if (!limitOk) return setError(form, 'password', m.rate_limit_exceeded());

		try {
			await auth.api.deleteUser({
				body: { password: form.data.password },
				headers: event.request.headers
			});
		} catch (error) {
			return setError(form, 'password', authErrorMessage(error));
		}

		redirect(303, '/login', { type: 'success', message: m.settings_deleted() }, event);
	},
	regenerateFeed: async (event) => {
		const user = event.locals.user;
		if (!user) throw kitRedirect(303, '/login');
		await regenerateFeedToken({ type: 'user', id: user.id });
		// Flash in place so the settings page keeps its scroll position.
		setFlash({ type: 'success', message: m.feed_regenerated() }, event);
		return {};
	}
};
