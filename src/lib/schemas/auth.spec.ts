import { describe, expect, it } from 'vitest';
import { m } from '$lib/paraglide/messages.js';
import { profileSchema, signupSchema } from './auth';

const validSignup = {
	name: 'Ada Lovelace',
	email: 'ada@example.com',
	password: 'supersecret',
	timezone: 'Europe/Riga',
	locale: 'pl'
};

describe('signupSchema', () => {
	it('accepts valid input', () => {
		const result = signupSchema.safeParse(validSignup);
		expect(result.success).toBe(true);
	});

	it('rejects an invalid email with a localized message', () => {
		const result = signupSchema.safeParse({ ...validSignup, email: 'nope' });
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toBe(m.validation_email_invalid());
	});

	it('rejects a short password', () => {
		const result = signupSchema.safeParse({ ...validSignup, password: 'short' });
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toBe(m.validation_password_min());
	});

	it('falls back to defaults for invalid hidden fields', () => {
		const result = signupSchema.parse({
			...validSignup,
			timezone: 'Not/AZone',
			locale: 'xx'
		});
		expect(result.timezone).toBe('UTC');
		expect(result.locale).toBe('en');
	});
});

describe('profileSchema', () => {
	it('rejects an invalid timezone instead of falling back', () => {
		const result = profileSchema.safeParse({
			name: 'Ada',
			locale: 'en',
			timezone: 'Not/AZone'
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toBe(m.validation_timezone_invalid());
	});
});
