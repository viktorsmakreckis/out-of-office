import { describe, expect, it } from 'vitest';
import type { IntegrationProvider } from '$lib/server/db/schema';
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

	it('rejects a provider with no host rule (guards a future enum widening)', () => {
		expect(isAllowedWebhookUrl('sms' as IntegrationProvider, 'https://hooks.slack.com/x')).toBe(
			false
		);
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

	it('sends an abort signal and disallows redirects', async () => {
		let seen: RequestInit | undefined;
		const fetchFn = (async (_url: unknown, init?: RequestInit) => {
			seen = init;
			return new Response('ok', { status: 200 });
		}) as typeof fetch;
		await postJson('https://hooks.slack.com/x', {}, fetchFn);
		expect(seen?.signal).toBeInstanceOf(AbortSignal);
		expect(seen?.redirect).toBe('error');
	});

	it('returns false when the request times out', async () => {
		const timingOut = (async () => {
			throw new DOMException('The operation timed out.', 'TimeoutError');
		}) as typeof fetch;
		expect(await postJson('https://hooks.slack.com/x', {}, timingOut)).toBe(false);
	});
});
