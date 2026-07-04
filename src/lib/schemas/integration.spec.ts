import { describe, expect, it } from 'vitest';
import { addConnectionSchema, saveDigestSchema, updateConnectionDigestSchema } from './integration';

describe('addConnectionSchema', () => {
	it('accepts a valid connection', () => {
		const result = addConnectionSchema.safeParse({
			provider: 'slack',
			webhookUrl: 'https://hooks.slack.com/services/T0/B0/x',
			label: '#availability'
		});
		expect(result.success).toBe(true);
	});

	it('defaults label to empty and trims the url', () => {
		const result = addConnectionSchema.parse({
			provider: 'discord',
			webhookUrl: '  https://discord.com/api/webhooks/1/x  '
		});
		expect(result.label).toBe('');
		expect(result.webhookUrl).toBe('https://discord.com/api/webhooks/1/x');
	});

	it('rejects unknown providers and non-urls', () => {
		expect(
			addConnectionSchema.safeParse({ provider: 'skype', webhookUrl: 'https://x.test' }).success
		).toBe(false);
		expect(
			addConnectionSchema.safeParse({ provider: 'slack', webhookUrl: 'not a url' }).success
		).toBe(false);
	});
});

describe('saveDigestSchema', () => {
	const valid = {
		enabled: true,
		weekday: 1,
		hour: 8,
		timezone: 'Europe/Riga',
		postWhenEmpty: false
	};

	it('accepts a valid config', () => {
		expect(saveDigestSchema.parse(valid)).toEqual(valid);
	});

	it('rejects an out-of-range weekday', () => {
		expect(saveDigestSchema.safeParse({ ...valid, weekday: 8 }).success).toBe(false);
	});

	it('rejects an out-of-range hour', () => {
		expect(saveDigestSchema.safeParse({ ...valid, hour: 24 }).success).toBe(false);
	});

	it('rejects an unknown timezone', () => {
		expect(saveDigestSchema.safeParse({ ...valid, timezone: 'Mars/Olympus' }).success).toBe(false);
	});
});

describe('updateConnectionDigestSchema', () => {
	it('coerces the notifyDigest flag', () => {
		expect(updateConnectionDigestSchema.parse({ id: 'c1', notifyDigest: 'false' })).toEqual({
			id: 'c1',
			notifyDigest: false
		});
	});
});
