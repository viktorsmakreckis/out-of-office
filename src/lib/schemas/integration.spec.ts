import { describe, expect, it } from 'vitest';
import { addConnectionSchema } from './integration';

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
