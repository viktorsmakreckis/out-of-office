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
	(table) => [
		primaryKey({ columns: [table.userId, table.shareId] }),
		index('calendar_share_hide_share_id_idx').on(table.shareId)
	]
);

export const notificationTypeEnum = pgEnum('notification_type', [
	'team_invite',
	'calendar_shared',
	'event_created',
	'event_updated'
]);

/**
 * Per-type notification payloads. The jsonb column is typed as their union so writers
 * keep working with exact shapes; see `toAppNotification` in `$lib/notifications` for the
 * discriminated read-side view.
 */
export type TeamInviteData = { invitationId: string; teamName: string };
export type CalendarSharedData = { shareId: string };
export type EventChangeData = { eventTitle: string | null; eventType: string };
export type NotificationData = TeamInviteData | CalendarSharedData | EventChangeData;

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
		// Cast: DB-level default only; every writer supplies an exact-shaped `data` value.
		data: jsonb('data')
			.$type<NotificationData>()
			.notNull()
			.default({} as NotificationData),
		readAt: timestamp('read_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('notification_user_id_idx').on(table.userId, table.createdAt)]
);

export const integrationProviderEnum = pgEnum('integration_provider', [
	'slack',
	'discord',
	'msteams'
]);
export type IntegrationProvider = (typeof integrationProviderEnum.enumValues)[number];

/** Phase 1 only has webhooks; Phase 2 adds 'oauth'. */
export const integrationKindEnum = pgEnum('integration_kind', ['webhook']);

/**
 * A webhook connection owned by a team (org) or, from Phase 2, a user — XOR,
 * same pattern as calendar_share. Failure counters let the UI surface dead
 * webhooks; see docs/superpowers/specs/2026-07-03-integrations-phase-1-design.md.
 */
export const integrationConnection = pgTable(
	'integration_connection',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		orgId: text('org_id').references(() => organization.id, { onDelete: 'cascade' }),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		provider: integrationProviderEnum('provider').notNull(),
		kind: integrationKindEnum('kind').notNull().default('webhook'),
		webhookUrl: text('webhook_url').notNull(),
		label: text('label'),
		createdById: text('created_by_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		consecutiveFailures: integer('consecutive_failures').notNull().default(0),
		lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		check(
			'integration_connection_owner_xor',
			sql`num_nonnulls(${table.orgId}, ${table.userId}) = 1`
		),
		index('integration_connection_org_idx').on(table.orgId),
		index('integration_connection_user_idx').on(table.userId)
	]
);

/** Capability token for a read-only iCal feed; one per user or per org. */
export const calendarFeedToken = pgTable(
	'calendar_feed_token',
	{
		token: text('token')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		orgId: text('org_id').references(() => organization.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		check(
			'calendar_feed_token_owner_xor',
			sql`num_nonnulls(${table.userId}, ${table.orgId}) = 1`
		),
		unique('calendar_feed_token_owner_unique').on(table.userId, table.orgId).nullsNotDistinct()
	]
);
