import { describe, expect, it } from 'vitest';
import { discordPayload, msteamsPayload, payloadFor, slackPayload } from './formatters';
import { buildEventMessage } from './message';

const message = buildEventMessage('Alice', 'created', null, 'vacation', {
	allDay: true,
	start: new Date('2026-07-06T00:00:00Z'),
	end: new Date('2026-07-08T00:00:00Z')
});

describe('slackPayload', () => {
	it('produces mrkdwn text and a section block', () => {
		const payload = slackPayload(message) as { text: string; blocks: unknown[] };
		expect(payload.text).toContain('*Alice*');
		expect(payload.blocks).toHaveLength(1);
	});
});

describe('discordPayload', () => {
	it('produces an embed with markdown bold', () => {
		const payload = discordPayload(message) as { embeds: { description: string }[] };
		expect(payload.embeds[0].description).toContain('**Alice**');
	});
});

describe('msteamsPayload', () => {
	it('wraps an adaptive card attachment', () => {
		const payload = msteamsPayload(message) as {
			type: string;
			attachments: { contentType: string; content: { body: { text: string }[] } }[];
		};
		expect(payload.type).toBe('message');
		expect(payload.attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive');
		expect(payload.attachments[0].content.body[0].text).toContain('**Alice**');
	});
});

describe('payloadFor', () => {
	it('dispatches by provider', () => {
		expect(payloadFor('slack', message)).toEqual(slackPayload(message));
		expect(payloadFor('discord', message)).toEqual(discordPayload(message));
		expect(payloadFor('msteams', message)).toEqual(msteamsPayload(message));
	});
});
