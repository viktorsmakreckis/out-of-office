import type { IntegrationProvider } from '$lib/server/db/schema';
import { composeLine, type OooMessage } from './message';
import { digestHeaderText, digestRosterText, type DigestMessage } from './digest-message';

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

export function slackDigestPayload(message: DigestMessage): unknown {
	const header = digestHeaderText(message);
	const text = `*${header}*\n${digestRosterText(message, (s) => `*${s}*`)}`;
	return { text: header, blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }] };
}

export function discordDigestPayload(message: DigestMessage): unknown {
	return {
		embeds: [
			{
				title: digestHeaderText(message),
				description: digestRosterText(message, (s) => `**${s}**`)
			}
		]
	};
}

export function msteamsDigestPayload(message: DigestMessage): unknown {
	return {
		type: 'message',
		attachments: [
			{
				contentType: 'application/vnd.microsoft.card.adaptive',
				content: {
					$schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
					type: 'AdaptiveCard',
					version: '1.4',
					body: [
						{ type: 'TextBlock', text: digestHeaderText(message), weight: 'Bolder', wrap: true },
						{ type: 'TextBlock', text: digestRosterText(message, (s) => `**${s}**`), wrap: true }
					]
				}
			}
		]
	};
}

const digestFormatters: Record<IntegrationProvider, (message: DigestMessage) => unknown> = {
	slack: slackDigestPayload,
	discord: discordDigestPayload,
	msteams: msteamsDigestPayload
};

/** Returns null for a provider with no formatter (guards a future enum widening). */
export function digestPayloadFor(provider: IntegrationProvider, message: DigestMessage): unknown {
	const format = digestFormatters[provider];
	return format ? format(message) : null;
}
