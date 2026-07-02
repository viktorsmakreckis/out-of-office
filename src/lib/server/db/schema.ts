import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export * from './auth.schema';

/** Fixed-window counters for app-level auth throttling (see rate-limit.ts). */
export const authRateLimit = pgTable('auth_rate_limit', {
	key: text('key').primaryKey(),
	count: integer('count').notNull(),
	resetAt: timestamp('reset_at', { withTimezone: true }).notNull()
});
