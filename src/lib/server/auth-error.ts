import { APIError } from 'better-auth/api';
import { m } from '$lib/paraglide/messages.js';

/** Localized, user-safe message for a failed better-auth API call. */
export function authErrorMessage(error: unknown): string {
	if (!(error instanceof APIError)) return m.error_generic();
	switch (error.body?.code) {
		case 'INVALID_EMAIL_OR_PASSWORD':
			return m.auth_error_invalid_credentials();
		case 'USER_ALREADY_EXISTS':
		case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
			return m.auth_error_email_taken();
		case 'EMAIL_NOT_VERIFIED':
			return m.auth_error_email_not_verified();
		case 'INVALID_TOKEN':
			return m.auth_error_invalid_token();
		case 'INVALID_PASSWORD':
			return m.auth_error_wrong_password();
		case 'PASSWORD_TOO_SHORT':
			return m.validation_password_min();
		case 'PASSWORD_TOO_LONG':
			return m.validation_password_max();
		default:
			return m.error_generic();
	}
}
