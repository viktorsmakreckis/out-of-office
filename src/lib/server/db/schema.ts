import { boolean, index, integer, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
// Relative import: drizzle-kit bundles this file without $lib alias resolution.
import { eventTypes } from '../../events/types';
import { user } from './auth.schema';

export * from './auth.schema';

/** Fixed-window counters for app-level auth throttling (see rate-limit.ts). */
export const authRateLimit = pgTable('auth_rate_limit', {
	key: text('key').primaryKey(),
	count: integer('count').notNull(),
	resetAt: timestamp('reset_at', { withTimezone: true }).notNull()
});

export const eventTypeEnum = pgEnum('event_type', eventTypes);

/**
 * Personal out-of-office events. start/end are instants; all-day rows store
 * UTC midnight and are end-inclusive by date part, timed rows are end-exclusive
 * (see docs/superpowers/specs/2026-07-02-calendar-events-design.md).
 */
export const calendarEvent = pgTable(
	'calendar_event',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		type: eventTypeEnum('type').notNull(),
		title: text('title'),
		allDay: boolean('all_day').notNull(),
		start: timestamp('start', { withTimezone: true, mode: 'date' }).notNull(),
		end: timestamp('end', { withTimezone: true, mode: 'date' }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(table) => [index('calendar_event_user_id_idx').on(table.userId)]
);
