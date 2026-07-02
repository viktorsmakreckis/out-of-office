import { describe, expect, it } from 'vitest';
import { APIError } from 'better-auth/api';
import { m } from '$lib/paraglide/messages.js';
import { authErrorMessage } from './auth-error';

describe('authErrorMessage', () => {
	it('maps known better-auth codes to localized messages', () => {
		const error = new APIError('UNAUTHORIZED', { message: 'invalid email or password' });
		expect(authErrorMessage(error)).toBe(m.auth_error_invalid_credentials());
	});

	it('falls back to a generic message for unknown codes', () => {
		const error = new APIError('BAD_REQUEST', { message: 'some internal detail' });
		expect(authErrorMessage(error)).toBe(m.error_generic());
	});

	it('handles non-APIError values', () => {
		expect(authErrorMessage(new Error('boom'))).toBe(m.error_generic());
		expect(authErrorMessage(undefined)).toBe(m.error_generic());
	});
});
