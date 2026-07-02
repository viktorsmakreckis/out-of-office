import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique
} from 'drizzle-orm/pg-core';
// Relative import: drizzle-kit bundles this file without $lib alias resolution.
import { eventTypes } from '../../events/types';
import { organization, user } from './auth.schema';

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

/**
 * A calendar share: exactly one sharer column (user or org) and exactly one
 * target column (user, org, or a pending email that converts to a user on
 * signup). See docs/superpowers/specs/2026-07-02-calendar-sharing-design.md.
 */
export const calendarShare = pgTable(
	'calendar_share',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		sharerUserId: text('sharer_user_id').references(() => user.id, { onDelete: 'cascade' }),
		sharerOrgId: text('sharer_org_id').references(() => organization.id, { onDelete: 'cascade' }),
		targetUserId: text('target_user_id').references(() => user.id, { onDelete: 'cascade' }),
		targetOrgId: text('target_org_id').references(() => organization.id, { onDelete: 'cascade' }),
		targetEmail: text('target_email'),
		createdById: text('created_by_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		check(
			'calendar_share_sharer_xor',
			sql`num_nonnulls(${table.sharerUserId}, ${table.sharerOrgId}) = 1`
		),
		check(
			'calendar_share_target_xor',
			sql`num_nonnulls(${table.targetUserId}, ${table.targetOrgId}, ${table.targetEmail}) = 1`
		),
		unique('calendar_share_unique')
			.on(
				table.sharerUserId,
				table.sharerOrgId,
				table.targetUserId,
				table.targetOrgId,
				table.targetEmail
			)
			.nullsNotDistinct(),
		index('calendar_share_target_user_idx').on(table.targetUserId),
		index('calendar_share_target_org_idx').on(table.targetOrgId),
		index('calendar_share_sharer_user_idx').on(table.sharerUserId),
		index('calendar_share_sharer_org_idx').on(table.sharerOrgId),
		index('calendar_share_target_email_idx').on(table.targetEmail)
	]
);

/** Recipient-side opt-out: hides one share for one user without affecting others. */
export const calendarShareHide = pgTable(
	'calendar_share_hide',
	{
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		shareId: text('share_id')
			.notNull()
			.references(() => calendarShare.id, { onDelete: 'cascade' })
	},
	(table) => [primaryKey({ columns: [table.userId, table.shareId] })]
);

export const notificationTypeEnum = pgEnum('notification_type', [
	'team_invite',
	'calendar_shared',
	'event_created',
	'event_updated'
]);

export type NotificationData = {
	shareId?: string;
	invitationId?: string;
	teamName?: string;
	eventTitle?: string | null;
	eventType?: string;
};

export const notification = pgTable(
	'notification',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		type: notificationTypeEnum('type').notNull(),
		actorName: text('actor_name').notNull(),
		data: jsonb('data').$type<NotificationData>().notNull().default({}),
		readAt: timestamp('read_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('notification_user_id_idx').on(table.userId, table.createdAt)]
);
