import type { IntegrationProvider } from '$lib/server/db/schema';
import { composeLine, type OooMessage } from './message';

export function slackPayload(message: OooMessage): unknown {
	const text = composeLine(message, (s) => `*${s}*`);
	return { text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }] };
}

export function discordPayload(message: OooMessage): unknown {
	return { embeds: [{ description: composeLine(message, (s) => `**${s}**`) }] };
}

/** Power Automate Workflows webhook envelope (classic O365 connectors are retired). */
export function msteamsPayload(message: OooMessage): unknown {
	return {
		type: 'message',
		attachments: [
			{
				contentType: 'application/vnd.microsoft.card.adaptive',
				content: {
					$schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
					type: 'AdaptiveCard',
					version: '1.4',
					body: [{ type: 'TextBlock', text: composeLine(message, (s) => `**${s}**`), wrap: true }]
				}
			}
		]
	};
}

const formatters: Record<IntegrationProvider, (message: OooMessage) => unknown> = {
	slack: slackPayload,
	discord: discordPayload,
	msteams: msteamsPayload
};

/** Returns null for a provider with no formatter (guards a future enum widening). */
export function payloadFor(provider: IntegrationProvider, message: OooMessage): unknown {
	const format = formatters[provider];
	return format ? format(message) : null;
}
