import { describe, expect, it } from 'vitest';
import type { IntegrationProvider } from '$lib/server/db/schema';
import { discordPayload, msteamsPayload, payloadFor, slackPayload } from './formatters';
import { buildEventMessage } from './message';
import { buildDigestMessage } from './digest-message';
import { digestPayloadFor } from './formatters';

const message = buildEventMessage(
	'Alice',
	'created',
	null,
	'vacation',
	{
		allDay: true,
		start: new Date('2026-07-06T00:00:00Z'),
		end: new Date('2026-07-08T00:00:00Z')
	},
	'en-GB'
);
// The exact one-line rendering both markdown flavours wrap the actor name inside (en-GB dates).
const slackText = '🌴 *Alice* is out 6 Jul – 8 Jul (Vacation)';
const discordText = '🌴 **Alice** is out 6 Jul – 8 Jul (Vacation)';

describe('slackPayload', () => {
	it('produces the exact Block Kit envelope', () => {
		expect(slackPayload(message)).toEqual({
			text: slackText,
			blocks: [{ type: 'section', text: { type: 'mrkdwn', text: slackText } }]
		});
	});
});

describe('discordPayload', () => {
	it('produces the exact embed envelope', () => {
		expect(discordPayload(message)).toEqual({ embeds: [{ description: discordText }] });
	});
});

describe('msteamsPayload', () => {
	it('produces the exact Adaptive Card envelope', () => {
		expect(msteamsPayload(message)).toEqual({
			type: 'message',
			attachments: [
				{
					contentType: 'application/vnd.microsoft.card.adaptive',
					content: {
						$schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
						type: 'AdaptiveCard',
						version: '1.4',
						body: [{ type: 'TextBlock', text: discordText, wrap: true }]
					}
				}
			]
		});
	});
});

describe('payloadFor', () => {
	it('dispatches by provider', () => {
		expect(payloadFor('slack', message)).toEqual(slackPayload(message));
		expect(payloadFor('discord', message)).toEqual(discordPayload(message));
		expect(payloadFor('msteams', message)).toEqual(msteamsPayload(message));
	});

	it('returns null for a provider with no formatter', () => {
		expect(payloadFor('sms' as IntegrationProvider, message)).toBeNull();
	});
});

const digest = buildDigestMessage(
	'Team A',
	'Jul 6 – Jul 12',
	[
		{
			userId: 'u-alice',
			userName: 'Alice',
			type: 'vacation',
			title: null,
			allDay: true,
			start: new Date('2026-07-06T00:00:00Z'),
			end: new Date('2026-07-08T00:00:00Z')
		}
	],
	'en-GB'
);
const digestHeader = '🗓️ Team A — time off for Jul 6 – Jul 12';

describe('digestPayloadFor', () => {
	it('produces the Slack Block Kit envelope', () => {
		const slackText = `*${digestHeader}*\n*Alice* — 🌴 Vacation (6 Jul – 8 Jul)`;
		expect(digestPayloadFor('slack', digest)).toEqual({
			text: digestHeader,
			blocks: [{ type: 'section', text: { type: 'mrkdwn', text: slackText } }]
		});
	});

	it('produces the Discord embed envelope', () => {
		expect(digestPayloadFor('discord', digest)).toEqual({
			embeds: [{ title: digestHeader, description: '**Alice** — 🌴 Vacation (6 Jul – 8 Jul)' }]
		});
	});

	it('produces the Teams Adaptive Card envelope', () => {
		expect(digestPayloadFor('msteams', digest)).toEqual({
			type: 'message',
			attachments: [
				{
					contentType: 'application/vnd.microsoft.card.adaptive',
					content: {
						$schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
						type: 'AdaptiveCard',
						version: '1.4',
						body: [
							{ type: 'TextBlock', text: digestHeader, weight: 'Bolder', wrap: true },
							{ type: 'TextBlock', text: '**Alice** — 🌴 Vacation (6 Jul – 8 Jul)', wrap: true }
						]
					}
				}
			]
		});
	});

	it('returns null for a provider with no formatter', () => {
		expect(digestPayloadFor('sms' as IntegrationProvider, digest)).toBeNull();
	});
});
