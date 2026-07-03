import { describe, expect, it } from 'vitest';
import { isAllowedWebhookUrl, postJson } from './webhooks';

describe('isAllowedWebhookUrl', () => {
	it('accepts official hosts per provider', () => {
		expect(isAllowedWebhookUrl('slack', 'https://hooks.slack.com/services/T0/B0/x')).toBe(true);
		expect(isAllowedWebhookUrl('discord', 'https://discord.com/api/webhooks/1/x')).toBe(true);
		expect(isAllowedWebhookUrl('discord', 'https://discordapp.com/api/webhooks/1/x')).toBe(true);
		expect(
			isAllowedWebhookUrl('msteams', 'https://prod-01.westeurope.logic.azure.com/workflows/x')
		).toBe(true);
		expect(isAllowedWebhookUrl('msteams', 'https://x.api.powerplatform.com/workflows/y')).toBe(
			true
		);
	});

	it('rejects wrong hosts, cross-provider hosts, and non-https', () => {
		expect(isAllowedWebhookUrl('slack', 'https://evil.example.com/services/x')).toBe(false);
		expect(isAllowedWebhookUrl('slack', 'https://discord.com/api/webhooks/1/x')).toBe(false);
		expect(isAllowedWebhookUrl('discord', 'http://discord.com/api/webhooks/1/x')).toBe(false);
		expect(isAllowedWebhookUrl('msteams', 'https://logic.azure.com.evil.com/x')).toBe(false);
		expect(isAllowedWebhookUrl('slack', 'not a url')).toBe(false);
	});
});

describe('postJson', () => {
	it('returns true on 2xx', async () => {
		const fetchFn = (async () => new Response('ok', { status: 200 })) as typeof fetch;
		expect(await postJson('https://hooks.slack.com/x', { a: 1 }, fetchFn)).toBe(true);
	});

	it('returns false on http errors and thrown fetch errors', async () => {
		const failing = (async () => new Response('no', { status: 404 })) as typeof fetch;
		const throwing = (async () => {
			throw new Error('network');
		}) as typeof fetch;
		expect(await postJson('https://hooks.slack.com/x', {}, failing)).toBe(false);
		expect(await postJson('https://hooks.slack.com/x', {}, throwing)).toBe(false);
	});

	it('sends the payload as a JSON POST', async () => {
		let seen: { method?: string; body?: unknown } = {};
		const fetchFn = (async (_url: unknown, init?: RequestInit) => {
			seen = { method: init?.method, body: init?.body };
			return new Response('ok', { status: 200 });
		}) as typeof fetch;
		await postJson('https://hooks.slack.com/x', { text: 'hi' }, fetchFn);
		expect(seen.method).toBe('POST');
		expect(seen.body).toBe(JSON.stringify({ text: 'hi' }));
	});
});
