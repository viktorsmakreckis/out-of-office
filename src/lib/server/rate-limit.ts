import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { authRateLimit } from '$lib/server/db/schema';

export interface RateLimitRule {
	key: string;
	max: number;
	windowSeconds: number;
}

/**
 * Fixed-window rate limiter. Increments every rule's counter atomically and
 * returns true only when ALL rules are within their max. Windows self-reset
 * in place, so no scheduled cleanup is needed for active keys.
 */
export async function checkRateLimit(...rules: RateLimitRule[]): Promise<boolean> {
	let allowed = true;
	for (const rule of rules) {
		const reset = sql`now() + make_interval(secs => ${rule.windowSeconds})`;
		const [row] = await db
			.insert(authRateLimit)
			.values({ key: rule.key, count: 1, resetAt: reset })
			.onConflictDoUpdate({
				target: authRateLimit.key,
				set: {
					count: sql`CASE WHEN ${authRateLimit.resetAt} < now() THEN 1 ELSE ${authRateLimit.count} + 1 END`,
					resetAt: sql`CASE WHEN ${authRateLimit.resetAt} < now() THEN now() + make_interval(secs => ${rule.windowSeconds}) ELSE ${authRateLimit.resetAt} END`
				}
			})
			.returning({ count: authRateLimit.count });
		if (row.count > rule.max) allowed = false;
	}
	// Opportunistic cleanup of long-dead keys; never blocks the caller.
	if (Math.random() < 0.01) {
		db.delete(authRateLimit)
			.where(sql`${authRateLimit.resetAt} < now() - interval '1 day'`)
			.catch((error) => console.error('rate-limit cleanup failed', error));
	}
	return allowed;
}
