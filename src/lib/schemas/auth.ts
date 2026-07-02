import { z } from 'zod';
import { m } from '$lib/paraglide/messages.js';
import { baseLocale, locales } from '$lib/paraglide/runtime';

const timezones = new Set(Intl.supportedValuesOf('timeZone'));

const nameSchema = z
	.string({ error: () => m.validation_name_required() })
	.trim()
	.min(1, { error: () => m.validation_name_required() })
	.max(100);
const emailSchema = z.email({ error: () => m.validation_email_invalid() });
const passwordSchema = z
	.string({ error: () => m.validation_password_min() })
	.min(8, { error: () => m.validation_password_min() })
	.max(128, { error: () => m.validation_password_max() });
const timezoneSchema = z
	.string({ error: () => m.validation_timezone_invalid() })
	.refine((tz) => timezones.has(tz), { error: () => m.validation_timezone_invalid() });
const localeSchema = z.enum(locales, { error: () => m.validation_locale_invalid() });

export const signupSchema = z.object({
	name: nameSchema,
	email: emailSchema,
	password: passwordSchema,
	// Hidden auto-detected fields: never block signup on them.
	timezone: timezoneSchema.catch('UTC'),
	locale: localeSchema.catch(baseLocale)
});

export const loginSchema = z.object({
	email: emailSchema,
	password: z.string({ error: () => m.auth_error_invalid_credentials() }).min(1, {
		error: () => m.auth_error_invalid_credentials()
	})
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
	password: passwordSchema,
	token: z.string().min(1, { error: () => m.auth_error_invalid_token() })
});

export const resendVerificationSchema = z.object({ email: emailSchema });

export const profileSchema = z.object({
	name: nameSchema,
	locale: localeSchema,
	timezone: timezoneSchema
});

export const changeEmailSchema = z.object({ newEmail: emailSchema });

export const changePasswordSchema = z.object({
	currentPassword: z.string({ error: () => m.auth_error_wrong_password() }).min(1, {
		error: () => m.auth_error_wrong_password()
	}),
	newPassword: passwordSchema
});

export const deleteAccountSchema = z.object({
	password: z.string({ error: () => m.auth_error_wrong_password() }).min(1, {
		error: () => m.auth_error_wrong_password()
	})
});
