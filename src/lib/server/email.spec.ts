import { describe, expect, it } from 'vitest';
import { changeEmailConfirmationEmail, userLocale, verificationEmail } from './email';

describe('email templates', () => {
	it('embeds the action url in html and text', () => {
		const email = verificationEmail('https://example.com/verify?token=t', 'en');
		expect(email.html).toContain('https://example.com/verify?token=t');
		expect(email.text).toContain('https://example.com/verify?token=t');
		expect(email.subject.length).toBeGreaterThan(0);
	});

	it('localizes the subject', () => {
		const en = verificationEmail('https://x.test', 'en');
		const pl = verificationEmail('https://x.test', 'pl');
		expect(en.subject).not.toBe(pl.subject);
	});

	it('escapes html in interpolated values', () => {
		const email = changeEmailConfirmationEmail('https://x.test', '<b>evil</b>@x.test', 'en');
		expect(email.html).not.toContain('<b>evil</b>');
		expect(email.html).toContain('&lt;b&gt;evil&lt;/b&gt;@x.test');
	});
});

describe('userLocale', () => {
	it('returns the stored locale when valid', () => {
		expect(userLocale({ locale: 'fr' })).toBe('fr');
	});

	it('falls back when the stored locale is missing or invalid', () => {
		expect(userLocale({})).toBe('en');
		expect(userLocale({ locale: 'xx' })).toBe('en');
	});
});
