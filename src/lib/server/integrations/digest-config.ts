import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { teamDigestConfig } from '$lib/server/db/schema';

export type DigestConfig = typeof teamDigestConfig.$inferSelect;

export type DigestConfigInput = {
	enabled: boolean;
	weekday: number;
	hour: number;
	timezone: string;
	postWhenEmpty: boolean;
};

export async function getDigestConfig(orgId: string): Promise<DigestConfig | null> {
	const [row] = await db.select().from(teamDigestConfig).where(eq(teamDigestConfig.orgId, orgId));
	return row ?? null;
}

/** Upserts the config row; resetting lastSentWeekKey so a re-enabled/rescheduled digest can send this week. */
export async function upsertDigestConfig(orgId: string, values: DigestConfigInput): Promise<void> {
	await db
		.insert(teamDigestConfig)
		.values({ orgId, ...values, lastSentWeekKey: null })
		.onConflictDoUpdate({
			target: teamDigestConfig.orgId,
			set: { ...values, lastSentWeekKey: null }
		});
}

export async function setDigestLastSentWeekKey(orgId: string, weekKey: string): Promise<void> {
	await db
		.update(teamDigestConfig)
		.set({ lastSentWeekKey: weekKey })
		.where(eq(teamDigestConfig.orgId, orgId));
}

export async function listEnabledDigestConfigs(): Promise<
	Array<{ orgId: string; weekday: number; hour: number; timezone: string }>
> {
	return db
		.select({
			orgId: teamDigestConfig.orgId,
			weekday: teamDigestConfig.weekday,
			hour: teamDigestConfig.hour,
			timezone: teamDigestConfig.timezone
		})
		.from(teamDigestConfig)
		.where(eq(teamDigestConfig.enabled, true));
}
