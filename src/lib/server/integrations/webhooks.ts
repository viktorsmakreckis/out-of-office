import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { integrationConnection, member, type IntegrationProvider } from '$lib/server/db/schema';
import { payloadFor } from './formatters';
import type { OooMessage } from './message';

/** SSRF guard: only official provider webhook hosts, https only. */
const allowedHost: Record<IntegrationProvider, (host: string) => boolean> = {
	slack: (host) => host === 'hooks.slack.com',
	discord: (host) => host === 'discord.com' || host === 'discordapp.com',
	msteams: (host) => host.endsWith('.logic.azure.com') || host.endsWith('.api.powerplatform.com')
};

export function isAllowedWebhookUrl(provider: IntegrationProvider, raw: string): boolean {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return false;
	}
	return url.protocol === 'https:' && allowedHost[provider](url.hostname);
}

export async function postJson(
	url: string,
	payload: unknown,
	fetchFn: typeof fetch = fetch
): Promise<boolean> {
	try {
		const response = await fetchFn(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		return response.ok;
	} catch {
		return false;
	}
}

async function recordDeliveryResult(connectionId: string, ok: boolean): Promise<void> {
	await db
		.update(integrationConnection)
		.set(
			ok
				? { consecutiveFailures: 0, lastFailureAt: null }
				: {
						consecutiveFailures: sql`${integrationConnection.consecutiveFailures} + 1`,
						lastFailureAt: new Date()
					}
		)
		.where(eq(integrationConnection.id, connectionId));
}

/** Posts one message to one connection and updates its failure counter. */
export async function deliverToConnection(
	connection: { id: string; provider: IntegrationProvider; webhookUrl: string },
	message: OooMessage
): Promise<boolean> {
	const ok = await postJson(connection.webhookUrl, payloadFor(connection.provider, message));
	await recordDeliveryResult(connection.id, ok);
	return ok;
}

/** Best-effort post to every webhook connection of every team the actor is in. */
export async function postEventToTeamChannels(actorId: string, message: OooMessage): Promise<void> {
	const memberships = await db
		.select({ organizationId: member.organizationId })
		.from(member)
		.where(eq(member.userId, actorId));
	if (memberships.length === 0) return;
	const connections = await db
		.select()
		.from(integrationConnection)
		.where(
			inArray(
				integrationConnection.orgId,
				memberships.map((row) => row.organizationId)
			)
		);
	const results = await Promise.allSettled(
		connections.map((connection) => deliverToConnection(connection, message))
	);
	for (const result of results) {
		if (result.status === 'rejected')
			console.error('[integrations] webhook delivery failed:', result.reason);
	}
}
