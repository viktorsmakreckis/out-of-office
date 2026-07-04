# Integrations Phase 2a — Scheduler + Weekly Digests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teams enable a per-team, timezone-aware weekly "who's off this week" digest that posts to their chosen webhook channels on a schedule.

**Architecture:** A new `team_digest_config` table (one lazy row per team) drives per-team BullMQ repeatable job schedulers (one per enabled team, `pattern` + `tz`). A `digests` queue + in-process worker runs `sendTeamDigest(orgId)`, which computes the current ISO week in the team's timezone, selects overlapping member events, builds a provider-neutral message, and posts it to connections with `notifyDigest = true`, reusing Phase 1's formatter/failure-counter machinery. Pure logic (week math, message shape, formatters, cron patterns) is db-free and unit-tested; the db/IO glue is verified by `pnpm check` + manual runs, matching how Phase 1's `postEventToTeamChannels` is verified.

**Tech Stack:** TypeScript, SvelteKit, Svelte 5, Drizzle ORM (postgres-js), better-auth (organization plugin), BullMQ 5.79.2 + ioredis, sveltekit-superforms + Zod v4, paraglide (inlang), shadcn-svelte, Vitest.

## Global Constraints

- **Package manager:** pnpm. Tests: `pnpm exec vitest run <file>`; full suite `pnpm test`; types `pnpm check`; lint `pnpm lint`.
- **No new runtime dependencies.** Date/timezone logic is hand-rolled via `Intl` (same posture as `src/lib/server/integrations/ical.ts`).
- **Redis-optional posture:** every queue/scheduler function is a silent no-op when `REDIS_URL` is unset (return early when the connection is `null`), exactly like `src/lib/server/queue/index.ts`.
- **Pure/unit-testable modules must NOT import `$lib/server/db`** (importing it throws without `DATABASE_URL`). Keep db access out of `digest-week.ts`, `digest-message.ts`, `formatters.ts`, and `queue/digest-cron.ts`.
- **i18n:** every new message key is added to all four locale files — `messages/en-GB.json`, `messages/en-US.json`, `messages/pl.json`, `messages/fr.json`.
- **Svelte:** use shadcn-svelte components; when writing/editing `.svelte` files, run the Svelte MCP `svelte-autofixer` until it returns no issues, and consult Svelte MCP docs as needed.
- **Migrations:** after editing `src/lib/server/db/schema.ts`, run `pnpm db:generate` to emit a numbered SQL migration (committed), then `pnpm db:push` to apply to the dev database.
- **Commits:** do NOT co-author commits. Follow the `/karpathy-guidelines` skill (surgical changes, no overcomplication).
- **Channel messages render in the team locale** (a channel has no single reader), consistent with Phase 1.
- **Owner/admin only** for all team-integration mutations (`requireManager`).

---

## File Structure

**New files:**

- `src/lib/server/integrations/digest-week.ts` — pure week/timezone math: `zonedWeekBounds`, `overlapsWeek`. No db.
- `src/lib/server/integrations/digest-week.spec.ts` — tests for the above.
- `src/lib/server/integrations/digest-message.ts` — `DigestMessage` types, `buildDigestMessage`, channel text composition. No db.
- `src/lib/server/integrations/digest-message.spec.ts` — tests.
- `src/lib/server/integrations/digest-config.ts` — `team_digest_config` accessors. Imports db.
- `src/lib/server/integrations/digest.ts` — `sendTeamDigest(orgId)` orchestrator. Imports db.
- `src/lib/server/queue/digest-cron.ts` — pure `DIGEST_QUEUE_NAME`, `digestSchedulerId`, `digestCronPattern`, job-data type. No db, no bullmq.
- `src/lib/server/queue/digest-cron.spec.ts` — tests.
- `src/lib/server/queue/digest-schedule.ts` — `getDigestQueue`, `upsertDigestSchedule`, `removeDigestSchedule`, `reconcileDigestSchedules`.
- `src/lib/server/queue/digest-schedule.spec.ts` — no-op-without-Redis test.
- `src/lib/server/queue/digest-worker.ts` — `startDigestWorker`.
- `src/lib/server/queue/digest-worker.spec.ts` — no-op-without-Redis test.
- `src/lib/components/integrations/connection-settings-dialog.svelte` — per-connection settings dialog.
- `src/lib/components/integrations/digest-settings.svelte` — weekly-digest subsection form.

**Modified files:**

- `src/lib/server/db/schema.ts` — add `teamDigestConfig` table + `notifyDigest` column.
- `src/lib/server/integrations/message.ts` — export `emojiForType`.
- `src/lib/server/integrations/formatters.ts` — add `digestPayloadFor` + per-provider digest payloads.
- `src/lib/server/integrations/webhooks.ts` — extract `deliverPayloadToConnection`.
- `src/lib/schemas/integration.ts` — add `saveDigestSchema`, `updateConnectionDigestSchema`.
- `src/lib/schemas/integration.spec.ts` — tests for the new schemas.
- `src/routes/app/teams/[id]/+page.server.ts` — `saveDigest` + `updateConnectionDigest` actions, load additions.
- `src/lib/components/integrations/integrations-card.svelte` — compact rows + dialog + digest subsection.
- `src/hooks.server.ts` — call `startDigestWorker()`.
- `messages/en-GB.json`, `messages/en-US.json`, `messages/pl.json`, `messages/fr.json` — new keys.

---

## Task 1: Schema + migration

**Files:**

- Modify: `src/lib/server/db/schema.ts`
- Create: migration under `drizzle/` (generated)

**Interfaces:**

- Produces: `teamDigestConfig` table export; `integrationConnection.notifyDigest` column. Row type `typeof teamDigestConfig.$inferSelect` has `{ orgId, enabled, weekday, hour, timezone, postWhenEmpty, lastSentWeekKey, updatedAt }`.

- [ ] **Step 1: Add the `notifyDigest` column to `integrationConnection`.** In `src/lib/server/db/schema.ts`, inside the `integrationConnection` table definition, add after the `notifyOoo` line:

```ts
		notifyDigest: boolean('notify_digest').notNull().default(true),
```

- [ ] **Step 2: Add the `teamDigestConfig` table.** Append after the `calendarFeedToken` table:

```ts
/**
 * Per-team weekly digest schedule; one lazily-created row per team (absent row =
 * disabled). weekday is ISO 1–7 (Mon=1); hour is 0–23 local to `timezone`. The
 * scheduler fires at minute 0. lastSentWeekKey (ISO "2026-W28", in the team tz)
 * guards against retry double-posts. See
 * docs/superpowers/specs/2026-07-04-integrations-phase-2a-digests-design.md.
 */
export const teamDigestConfig = pgTable(
	'team_digest_config',
	{
		orgId: text('org_id')
			.primaryKey()
			.references(() => organization.id, { onDelete: 'cascade' }),
		enabled: boolean('enabled').notNull().default(false),
		weekday: integer('weekday').notNull(),
		hour: integer('hour').notNull(),
		timezone: text('timezone').notNull(),
		postWhenEmpty: boolean('post_when_empty').notNull().default(false),
		lastSentWeekKey: text('last_sent_week_key'),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(table) => [
		check('team_digest_config_weekday_range', sql`${table.weekday} between 1 and 7`),
		check('team_digest_config_hour_range', sql`${table.hour} between 0 and 23`)
	]
);
```

- [ ] **Step 3: Typecheck.**

Run: `pnpm check`
Expected: no errors.

- [ ] **Step 4: Generate the migration.**

Run: `pnpm db:generate`
Expected: a new `drizzle/00NN_*.sql` file is created containing `CREATE TABLE "team_digest_config"` and `ALTER TABLE "integration_connection" ADD COLUMN "notify_digest"`.

- [ ] **Step 5: Apply to the dev database.**

Run: `pnpm db:push`
Expected: prompts resolve and the schema is applied (dev Postgres must be running via `pnpm db:start`).

- [ ] **Step 6: Commit.**

```bash
git add src/lib/server/db/schema.ts drizzle/
git commit -m "feat(db): add team_digest_config table and notify_digest column"
```

---

## Task 2: Week/timezone math (`digest-week.ts`)

**Files:**

- Create: `src/lib/server/integrations/digest-week.ts`
- Test: `src/lib/server/integrations/digest-week.spec.ts`

**Interfaces:**

- Produces:
  - `type WeekBounds = { weekStart: Date; weekEndExclusive: Date; weekKey: string; weekLabel: string }`
  - `zonedWeekBounds(now: Date, tz: string, locale: string): WeekBounds`
  - `overlapsWeek(event: { allDay: boolean; start: Date; end: Date }, weekStart: Date, weekEndExclusive: Date): boolean`

- [ ] **Step 1: Write the failing test.** Create `src/lib/server/integrations/digest-week.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { overlapsWeek, zonedWeekBounds } from './digest-week';

describe('zonedWeekBounds', () => {
	it('anchors the ISO week to Monday 00:00 in UTC', () => {
		const b = zonedWeekBounds(new Date('2026-07-08T10:00:00Z'), 'UTC', 'en-US');
		expect(b.weekStart.toISOString()).toBe('2026-07-06T00:00:00.000Z');
		expect(b.weekEndExclusive.toISOString()).toBe('2026-07-13T00:00:00.000Z');
		expect(b.weekKey).toBe('2026-W28');
		expect(b.weekLabel).toBe('Jul 6 – Jul 12');
	});

	it('uses the local week in a non-UTC zone (late Sunday local rolls back a week)', () => {
		// 02:00Z Mon is 22:00 (Sun) in New York (EDT, UTC-4) → previous ISO week.
		const b = zonedWeekBounds(new Date('2026-07-06T02:00:00Z'), 'America/New_York', 'en-US');
		expect(b.weekStart.toISOString()).toBe('2026-06-29T04:00:00.000Z');
		expect(b.weekEndExclusive.toISOString()).toBe('2026-07-06T04:00:00.000Z');
		expect(b.weekKey).toBe('2026-W27');
	});

	it('handles a DST spring-forward inside the week', () => {
		// London BST starts Sun 2026-03-29 01:00Z; the Mon–Sun week straddles it.
		const b = zonedWeekBounds(new Date('2026-03-25T12:00:00Z'), 'Europe/London', 'en-US');
		expect(b.weekStart.toISOString()).toBe('2026-03-23T00:00:00.000Z');
		expect(b.weekEndExclusive.toISOString()).toBe('2026-03-29T23:00:00.000Z');
	});
});

describe('overlapsWeek', () => {
	const weekStart = new Date('2026-07-06T00:00:00Z');
	const weekEndExclusive = new Date('2026-07-13T00:00:00Z');

	it('includes an all-day event on the first day (end-inclusive by date)', () => {
		const e = {
			allDay: true,
			start: new Date('2026-07-06T00:00:00Z'),
			end: new Date('2026-07-06T00:00:00Z')
		};
		expect(overlapsWeek(e, weekStart, weekEndExclusive)).toBe(true);
	});

	it('excludes an all-day event ending the day before the week starts', () => {
		const e = {
			allDay: true,
			start: new Date('2026-07-05T00:00:00Z'),
			end: new Date('2026-07-05T00:00:00Z')
		};
		expect(overlapsWeek(e, weekStart, weekEndExclusive)).toBe(false);
	});

	it('includes a timed event overlapping the last day', () => {
		const e = {
			allDay: false,
			start: new Date('2026-07-12T22:00:00Z'),
			end: new Date('2026-07-12T23:00:00Z')
		};
		expect(overlapsWeek(e, weekStart, weekEndExclusive)).toBe(true);
	});

	it('excludes an event entirely after the week', () => {
		const e = {
			allDay: false,
			start: new Date('2026-07-13T00:00:00Z'),
			end: new Date('2026-07-13T01:00:00Z')
		};
		expect(overlapsWeek(e, weekStart, weekEndExclusive)).toBe(false);
	});
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `pnpm exec vitest run src/lib/server/integrations/digest-week.spec.ts`
Expected: FAIL — cannot find module `./digest-week`.

- [ ] **Step 3: Implement `digest-week.ts`.** Create `src/lib/server/integrations/digest-week.ts`:

```ts
export type WeekBounds = {
	weekStart: Date;
	weekEndExclusive: Date;
	weekKey: string;
	weekLabel: string;
};

/** Wall-clock parts of `date` in `tz`, all numeric. */
function zonedParts(date: Date, tz: string) {
	const dtf = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});
	const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
	return {
		year: Number(p.year),
		month: Number(p.month),
		day: Number(p.day),
		hour: Number(p.hour),
		minute: Number(p.minute),
		second: Number(p.second)
	};
}

/** Milliseconds east of UTC for `tz` at instant `date`. */
function tzOffsetMs(date: Date, tz: string): number {
	const p = zonedParts(date, tz);
	const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
	return asUtc - date.getTime();
}

/** The UTC instant of a wall-clock date/time in `tz` (DST-safe via a refine pass). */
function zonedToUtc(y: number, m: number, d: number, hour: number, tz: string): Date {
	const guess = Date.UTC(y, m - 1, d, hour, 0, 0);
	const off1 = tzOffsetMs(new Date(guess), tz);
	let instant = guess - off1;
	const off2 = tzOffsetMs(new Date(instant), tz);
	if (off2 !== off1) instant = guess - off2;
	return new Date(instant);
}

/** ISO weekday 1–7 (Mon=1) of a local calendar date. */
function isoWeekday(y: number, m: number, d: number): number {
	const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	return day === 0 ? 7 : day;
}

/** ISO week key ("2026-W28") for a Monday local date. */
function isoWeekKey(y: number, m: number, d: number): string {
	const date = new Date(Date.UTC(y, m - 1, d));
	const day = date.getUTCDay() || 7;
	date.setUTCDate(date.getUTCDate() + 4 - day); // Thursday of this ISO week
	const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
	const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
	return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * The Mon–Sun ISO week containing `now`, expressed in `tz`. weekStart / weekEnd
 * are UTC instants for Monday 00:00 local and the following Monday 00:00 local.
 */
export function zonedWeekBounds(now: Date, tz: string, locale: string): WeekBounds {
	const local = zonedParts(now, tz);
	const iso = isoWeekday(local.year, local.month, local.day);
	// Local calendar date of this week's Monday.
	const monday = new Date(
		Date.UTC(local.year, local.month - 1, local.day) - (iso - 1) * 86_400_000
	);
	const my = monday.getUTCFullYear();
	const mm = monday.getUTCMonth() + 1;
	const md = monday.getUTCDate();
	const sunday = new Date(monday.getTime() + 6 * 86_400_000);

	const weekStart = zonedToUtc(my, mm, md, 0, tz);
	const weekEndExclusive = zonedToUtc(
		sunday.getUTCFullYear(),
		sunday.getUTCMonth() + 1,
		sunday.getUTCDate() + 1,
		0,
		tz
	);

	const fmt = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: tz });
	const from = fmt.format(weekStart);
	const to = fmt.format(new Date(weekEndExclusive.getTime() - 12 * 3_600_000)); // Sunday noon-ish
	return {
		weekStart,
		weekEndExclusive,
		weekKey: isoWeekKey(my, mm, md),
		weekLabel: from === to ? from : `${from} – ${to}`
	};
}

/** All-day rows are end-inclusive by date → treated as [start, end+1day); timed as [start, end). */
export function overlapsWeek(
	event: { allDay: boolean; start: Date; end: Date },
	weekStart: Date,
	weekEndExclusive: Date
): boolean {
	const endExclusive = event.allDay ? new Date(event.end.getTime() + 86_400_000) : event.end;
	return (
		event.start.getTime() < weekEndExclusive.getTime() &&
		endExclusive.getTime() > weekStart.getTime()
	);
}
```

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `pnpm exec vitest run src/lib/server/integrations/digest-week.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/server/integrations/digest-week.ts src/lib/server/integrations/digest-week.spec.ts
git commit -m "feat(integrations): add timezone-aware week bounds and overlap logic"
```

---

## Task 3: Digest neutral message (`digest-message.ts`)

**Files:**

- Modify: `src/lib/server/integrations/message.ts` (export `emojiForType`)
- Create: `src/lib/server/integrations/digest-message.ts`
- Test: `src/lib/server/integrations/digest-message.spec.ts`
- Modify: `messages/en-GB.json`, `messages/en-US.json`, `messages/pl.json`, `messages/fr.json`

**Interfaces:**

- Consumes: `formatDateRange`, `emojiForType` from `./message`; `eventTypeLabelFor` from `$lib/events/labels`.
- Produces:
  - `type DigestItem = { emoji: string; label: string; dateRange: string }`
  - `type DigestEntry = { actorName: string; items: DigestItem[] }`
  - `type DigestMessage = { orgName: string; weekLabel: string; entries: DigestEntry[]; locale: Locale }`
  - `type DigestSourceEvent = { userName: string; type: string; title: string | null; allDay: boolean; start: Date; end: Date }`
  - `buildDigestMessage(orgName: string, weekLabel: string, events: DigestSourceEvent[], locale: Locale): DigestMessage`
  - `digestHeaderText(message: DigestMessage): string`
  - `digestRosterText(message: DigestMessage, bold: (s: string) => string): string`

- [ ] **Step 1: Export `emojiForType` from `message.ts`.** In `src/lib/server/integrations/message.ts`, add below the `eventTypeEmoji` map:

```ts
export function emojiForType(type: string): string {
	return eventTypeEmoji[type as EventType] ?? '📅';
}
```

- [ ] **Step 2: Add channel message keys to all four locale files.** Add these keys to `messages/en-GB.json` and `messages/en-US.json`:

```json
	"digest_channel_header": "🗓️ {team} — time off for {range}",
	"digest_channel_empty": "🎉 Full house — nobody's off during {range}."
```

To `messages/pl.json`:

```json
	"digest_channel_header": "🗓️ {team} — nieobecności w terminie {range}",
	"digest_channel_empty": "🎉 Komplet — nikt nie jest nieobecny w terminie {range}."
```

To `messages/fr.json`:

```json
	"digest_channel_header": "🗓️ {team} — absences pour {range}",
	"digest_channel_empty": "🎉 Au complet — personne n'est absent sur {range}."
```

- [ ] **Step 3: Write the failing test.** Create `src/lib/server/integrations/digest-message.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildDigestMessage, digestHeaderText, digestRosterText } from './digest-message';

const events = [
	{
		userName: 'Bob',
		type: 'sick_leave',
		title: null,
		allDay: true,
		start: new Date('2026-07-10T00:00:00Z'),
		end: new Date('2026-07-10T00:00:00Z')
	},
	{
		userName: 'Alice',
		type: 'vacation',
		title: null,
		allDay: true,
		start: new Date('2026-07-06T00:00:00Z'),
		end: new Date('2026-07-08T00:00:00Z')
	}
];

describe('buildDigestMessage', () => {
	it('groups by member sorted by name, items by start', () => {
		const m = buildDigestMessage('Team A', 'Jul 6 – Jul 12', events, 'en-GB');
		expect(m.orgName).toBe('Team A');
		expect(m.entries.map((e) => e.actorName)).toEqual(['Alice', 'Bob']);
		expect(m.entries[0].items[0]).toEqual({
			emoji: '🌴',
			label: 'Vacation',
			dateRange: '6 Jul – 8 Jul'
		});
		expect(m.entries[1].items[0]).toEqual({
			emoji: '🤒',
			label: 'Sick leave',
			dateRange: '10 Jul'
		});
	});

	it('uses the title as the label when present', () => {
		const m = buildDigestMessage(
			'Team A',
			'Jul 6 – Jul 12',
			[
				{
					userName: 'Alice',
					type: 'business_trip',
					title: 'Berlin',
					allDay: true,
					start: new Date('2026-07-06T00:00:00Z'),
					end: new Date('2026-07-06T00:00:00Z')
				}
			],
			'en-GB'
		);
		expect(m.entries[0].items[0].label).toBe('Berlin');
	});
});

describe('digest text', () => {
	it('renders a header and a bolded roster line per member', () => {
		const m = buildDigestMessage('Team A', 'Jul 6 – Jul 12', events, 'en-GB');
		expect(digestHeaderText(m)).toBe('🗓️ Team A — time off for Jul 6 – Jul 12');
		expect(digestRosterText(m, (s) => `*${s}*`)).toBe(
			'*Alice* — 🌴 Vacation (6 Jul – 8 Jul)\n*Bob* — 🤒 Sick leave (10 Jul)'
		);
	});

	it('renders the full-house line when nobody is off', () => {
		const m = buildDigestMessage('Team A', 'Jul 6 – Jul 12', [], 'en-GB');
		expect(digestRosterText(m, (s) => `*${s}*`)).toBe(
			"🎉 Full house — nobody's off during Jul 6 – Jul 12."
		);
	});
});
```

- [ ] **Step 4: Run it to verify it fails.**

Run: `pnpm exec vitest run src/lib/server/integrations/digest-message.spec.ts`
Expected: FAIL — cannot find module `./digest-message`.

- [ ] **Step 5: Implement `digest-message.ts`.** Create `src/lib/server/integrations/digest-message.ts`:

```ts
import { eventTypeLabelFor } from '$lib/events/labels';
import { m } from '$lib/paraglide/messages.js';
import type { Locale } from '$lib/paraglide/runtime';
import { emojiForType, formatDateRange } from './message';

export type DigestItem = { emoji: string; label: string; dateRange: string };
export type DigestEntry = { actorName: string; items: DigestItem[] };
export type DigestMessage = {
	orgName: string;
	weekLabel: string;
	entries: DigestEntry[];
	locale: Locale;
};

export type DigestSourceEvent = {
	userName: string;
	type: string;
	title: string | null;
	allDay: boolean;
	start: Date;
	end: Date;
};

/** Groups events by member (name-sorted), items start-sorted, rendered in `locale`. */
export function buildDigestMessage(
	orgName: string,
	weekLabel: string,
	events: DigestSourceEvent[],
	locale: Locale
): DigestMessage {
	const byMember = new Map<string, DigestItem[]>();
	for (const event of [...events].sort((a, b) => a.start.getTime() - b.start.getTime())) {
		const item: DigestItem = {
			emoji: emojiForType(event.type),
			label: event.title ?? eventTypeLabelFor(event.type, locale),
			dateRange: formatDateRange(event.start, event.end, event.allDay, locale)
		};
		const items = byMember.get(event.userName);
		if (items) items.push(item);
		else byMember.set(event.userName, [item]);
	}
	const entries = [...byMember.entries()]
		.map(([actorName, items]) => ({ actorName, items }))
		.sort((a, b) => a.actorName.localeCompare(b.actorName, locale));
	return { orgName, weekLabel, entries, locale };
}

export function digestHeaderText(message: DigestMessage): string {
	return m.digest_channel_header(
		{ team: message.orgName, range: message.weekLabel },
		{ locale: message.locale }
	);
}

/** The roster body: one bolded line per member, or the full-house line when empty. */
export function digestRosterText(message: DigestMessage, bold: (s: string) => string): string {
	if (message.entries.length === 0) {
		return m.digest_channel_empty({ range: message.weekLabel }, { locale: message.locale });
	}
	return message.entries
		.map(
			(entry) =>
				`${bold(entry.actorName)} — ${entry.items
					.map((item) => `${item.emoji} ${item.label} (${item.dateRange})`)
					.join(', ')}`
		)
		.join('\n');
}
```

- [ ] **Step 6: Run the tests to verify they pass.**

Run: `pnpm exec vitest run src/lib/server/integrations/digest-message.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit.**

```bash
git add src/lib/server/integrations/message.ts src/lib/server/integrations/digest-message.ts src/lib/server/integrations/digest-message.spec.ts messages/
git commit -m "feat(integrations): add weekly-digest neutral message builder"
```

---

## Task 4: Provider digest formatters (`formatters.ts`)

**Files:**

- Modify: `src/lib/server/integrations/formatters.ts`
- Test: `src/lib/server/integrations/formatters.spec.ts` (append)

**Interfaces:**

- Consumes: `DigestMessage`, `digestHeaderText`, `digestRosterText` from `./digest-message`.
- Produces: `digestPayloadFor(provider: IntegrationProvider, message: DigestMessage): unknown` (null for an unknown provider).

- [ ] **Step 1: Write the failing test.** Append to `src/lib/server/integrations/formatters.spec.ts`:

```ts
import { buildDigestMessage } from './digest-message';
import { digestPayloadFor } from './formatters';

const digest = buildDigestMessage(
	'Team A',
	'Jul 6 – Jul 12',
	[
		{
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
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `pnpm exec vitest run src/lib/server/integrations/formatters.spec.ts`
Expected: FAIL — `digestPayloadFor` is not exported.

- [ ] **Step 3: Implement the digest formatters.** Append to `src/lib/server/integrations/formatters.ts` (and add the import at the top):

```ts
import { digestHeaderText, digestRosterText, type DigestMessage } from './digest-message';

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
```

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `pnpm exec vitest run src/lib/server/integrations/formatters.spec.ts`
Expected: PASS (existing + 4 new).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/server/integrations/formatters.ts src/lib/server/integrations/formatters.spec.ts
git commit -m "feat(integrations): add per-provider weekly-digest formatters"
```

---

## Task 5: Cron/scheduler-id helpers (`queue/digest-cron.ts`)

**Files:**

- Create: `src/lib/server/queue/digest-cron.ts`
- Test: `src/lib/server/queue/digest-cron.spec.ts`

**Interfaces:**

- Produces:
  - `const DIGEST_QUEUE_NAME = 'digests'`
  - `type DigestJobData = { orgId: string }`
  - `digestSchedulerId(orgId: string): string` → `"digest:<orgId>"`
  - `digestCronPattern(weekday: number, hour: number): string` → `"0 <hour> * * <cron-dow>"`, ISO Sunday `7` → cron `0`.

- [ ] **Step 1: Write the failing test.** Create `src/lib/server/queue/digest-cron.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { digestCronPattern, digestSchedulerId } from './digest-cron';

describe('digestSchedulerId', () => {
	it('namespaces by org id', () => {
		expect(digestSchedulerId('org_123')).toBe('digest:org_123');
	});
});

describe('digestCronPattern', () => {
	it('maps ISO Monday to cron dow 1 at the given hour', () => {
		expect(digestCronPattern(1, 8)).toBe('0 8 * * 1');
	});

	it('maps ISO Sunday (7) to cron dow 0', () => {
		expect(digestCronPattern(7, 9)).toBe('0 9 * * 0');
	});

	it('maps ISO Friday to cron dow 5', () => {
		expect(digestCronPattern(5, 0)).toBe('0 0 * * 5');
	});
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `pnpm exec vitest run src/lib/server/queue/digest-cron.spec.ts`
Expected: FAIL — cannot find module `./digest-cron`.

- [ ] **Step 3: Implement `digest-cron.ts`.** Create `src/lib/server/queue/digest-cron.ts`:

```ts
export const DIGEST_QUEUE_NAME = 'digests';

export type DigestJobData = { orgId: string };

/** Stable per-team job-scheduler id, so upserts are idempotent. */
export function digestSchedulerId(orgId: string): string {
	return `digest:${orgId}`;
}

/** Cron pattern firing at minute 0 of `hour` on the given ISO weekday (Sun 7 → cron 0). */
export function digestCronPattern(weekday: number, hour: number): string {
	return `0 ${hour} * * ${weekday % 7}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `pnpm exec vitest run src/lib/server/queue/digest-cron.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/server/queue/digest-cron.ts src/lib/server/queue/digest-cron.spec.ts
git commit -m "feat(queue): add digest cron pattern and scheduler-id helpers"
```

---

## Task 6: Extract `deliverPayloadToConnection` (`webhooks.ts`)

**Files:**

- Modify: `src/lib/server/integrations/webhooks.ts`

**Interfaces:**

- Produces: `deliverPayloadToConnection(connection: { id: string; webhookUrl: string }, payload: unknown): Promise<boolean>` — POSTs a pre-built payload and updates the connection's failure counter. `deliverToConnection` now delegates to it.

- [ ] **Step 1: Refactor.** In `src/lib/server/integrations/webhooks.ts`, replace the `deliverToConnection` function with:

```ts
/** POSTs an already-formatted payload to one connection and updates its failure counter. */
export async function deliverPayloadToConnection(
	connection: { id: string; webhookUrl: string },
	payload: unknown
): Promise<boolean> {
	const ok = await postJson(connection.webhookUrl, payload);
	await recordDeliveryResult(connection.id, ok);
	return ok;
}

/** Posts one event message to one connection and updates its failure counter. */
export async function deliverToConnection(
	connection: { id: string; provider: IntegrationProvider; webhookUrl: string },
	message: OooMessage
): Promise<boolean> {
	const payload = payloadFor(connection.provider, message);
	if (payload === null) return false; // no formatter for this provider — nothing to deliver
	return deliverPayloadToConnection(connection, payload);
}
```

- [ ] **Step 2: Typecheck.**

Run: `pnpm check`
Expected: no errors.

- [ ] **Step 3: Run the existing webhooks tests to confirm no regression.**

Run: `pnpm exec vitest run src/lib/server/integrations/webhooks.spec.ts`
Expected: PASS (unchanged).

- [ ] **Step 4: Commit.**

```bash
git add src/lib/server/integrations/webhooks.ts
git commit -m "refactor(integrations): extract payload-agnostic deliverPayloadToConnection"
```

---

## Task 7: Digest config accessors (`digest-config.ts`)

**Files:**

- Create: `src/lib/server/integrations/digest-config.ts`

**Interfaces:**

- Produces:
  - `type DigestConfig = typeof teamDigestConfig.$inferSelect`
  - `getDigestConfig(orgId: string): Promise<DigestConfig | null>`
  - `upsertDigestConfig(orgId, values: { enabled; weekday; hour; timezone; postWhenEmpty }): Promise<void>`
  - `setDigestLastSentWeekKey(orgId: string, weekKey: string): Promise<void>`
  - `listEnabledDigestConfigs(): Promise<Array<{ orgId: string; weekday: number; hour: number; timezone: string }>>`

- [ ] **Step 1: Implement.** Create `src/lib/server/integrations/digest-config.ts`:

```ts
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
```

- [ ] **Step 2: Typecheck.**

Run: `pnpm check`
Expected: no errors.

- [ ] **Step 3: Commit.**

```bash
git add src/lib/server/integrations/digest-config.ts
git commit -m "feat(integrations): add team digest config accessors"
```

---

## Task 8: Schedule lifecycle (`queue/digest-schedule.ts`)

**Files:**

- Create: `src/lib/server/queue/digest-schedule.ts`
- Test: `src/lib/server/queue/digest-schedule.spec.ts`

**Interfaces:**

- Consumes: `DIGEST_QUEUE_NAME`, `digestSchedulerId`, `digestCronPattern` from `./digest-cron`; `listEnabledDigestConfigs` from `$lib/server/integrations/digest-config`; `getRedisConnection` from `./connection`.
- Produces:
  - `upsertDigestSchedule(config: { orgId; weekday; hour; timezone }): Promise<void>`
  - `removeDigestSchedule(orgId: string): Promise<void>`
  - `reconcileDigestSchedules(): Promise<void>`

- [ ] **Step 1: Write the failing test.** Create `src/lib/server/queue/digest-schedule.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { removeDigestSchedule, upsertDigestSchedule } from './digest-schedule';

describe('digest schedule (no Redis configured)', () => {
	it('upsert is a no-op that resolves', async () => {
		await expect(
			upsertDigestSchedule({ orgId: 'o1', weekday: 1, hour: 8, timezone: 'UTC' })
		).resolves.toBeUndefined();
	});

	it('remove is a no-op that resolves', async () => {
		await expect(removeDigestSchedule('o1')).resolves.toBeUndefined();
	});
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `pnpm exec vitest run src/lib/server/queue/digest-schedule.spec.ts`
Expected: FAIL — cannot find module `./digest-schedule`.

- [ ] **Step 3: Implement `digest-schedule.ts`.** Create `src/lib/server/queue/digest-schedule.ts`:

```ts
import { Queue } from 'bullmq';
import { listEnabledDigestConfigs } from '$lib/server/integrations/digest-config';
import { getRedisConnection } from './connection';
import {
	DIGEST_QUEUE_NAME,
	digestCronPattern,
	digestSchedulerId,
	type DigestJobData
} from './digest-cron';

let queue: Queue<DigestJobData> | null | undefined;

function getDigestQueue(): Queue<DigestJobData> | null {
	if (queue !== undefined) return queue;
	const connection = getRedisConnection();
	if (!connection) {
		queue = null;
		return queue;
	}
	queue = new Queue<DigestJobData>(DIGEST_QUEUE_NAME, { connection });
	queue.on('error', (err) => console.error('[digest] queue error:', err));
	return queue;
}

export type DigestScheduleConfig = {
	orgId: string;
	weekday: number;
	hour: number;
	timezone: string;
};

/** Idempotently (re)creates the team's repeatable job scheduler. No-op without Redis. */
export async function upsertDigestSchedule(config: DigestScheduleConfig): Promise<void> {
	const q = getDigestQueue();
	if (!q) return;
	await q.upsertJobScheduler(
		digestSchedulerId(config.orgId),
		{ pattern: digestCronPattern(config.weekday, config.hour), tz: config.timezone },
		{ name: 'weekly-digest', data: { orgId: config.orgId } }
	);
}

export async function removeDigestSchedule(orgId: string): Promise<void> {
	const q = getDigestQueue();
	if (!q) return;
	await q.removeJobScheduler(digestSchedulerId(orgId));
}

/** Aligns Redis schedulers with the enabled DB configs: upsert missing, remove orphaned. */
export async function reconcileDigestSchedules(): Promise<void> {
	const q = getDigestQueue();
	if (!q) return;
	const configs = await listEnabledDigestConfigs();
	const wanted = new Set(configs.map((c) => digestSchedulerId(c.orgId)));
	const existing = await q.getJobSchedulers(0, -1, true);
	for (const scheduler of existing) {
		if (scheduler.key.startsWith('digest:') && !wanted.has(scheduler.key)) {
			await q.removeJobScheduler(scheduler.key);
		}
	}
	for (const config of configs) await upsertDigestSchedule(config);
}
```

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `pnpm exec vitest run src/lib/server/queue/digest-schedule.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck.**

Run: `pnpm check`
Expected: no errors. (If `getJobSchedulers` typing differs, confirm the returned item exposes `key: string`; adjust the guard accordingly.)

- [ ] **Step 6: Commit.**

```bash
git add src/lib/server/queue/digest-schedule.ts src/lib/server/queue/digest-schedule.spec.ts
git commit -m "feat(queue): add per-team digest schedule lifecycle + reconcile"
```

---

## Task 9: Digest orchestrator (`digest.ts`)

**Files:**

- Create: `src/lib/server/integrations/digest.ts`

**Interfaces:**

- Consumes: `getDigestConfig`, `setDigestLastSentWeekKey` (`./digest-config`); `zonedWeekBounds`, `overlapsWeek` (`./digest-week`); `buildDigestMessage` (`./digest-message`); `digestPayloadFor` (`./formatters`); `deliverPayloadToConnection` (`./webhooks`); `removeDigestSchedule` (`$lib/server/queue/digest-schedule`).
- Produces: `sendTeamDigest(orgId: string, now?: Date): Promise<void>`.

- [ ] **Step 1: Implement `digest.ts`.** Create `src/lib/server/integrations/digest.ts`:

```ts
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { baseLocale, isLocale, type Locale } from '$lib/paraglide/runtime';
import { db } from '$lib/server/db';
import {
	calendarEvent,
	integrationConnection,
	member,
	organization,
	user
} from '$lib/server/db/schema';
import { removeDigestSchedule } from '$lib/server/queue/digest-schedule';
import { getDigestConfig, setDigestLastSentWeekKey } from './digest-config';
import { buildDigestMessage, type DigestSourceEvent } from './digest-message';
import { overlapsWeek, zonedWeekBounds } from './digest-week';
import { digestPayloadFor } from './formatters';
import { deliverPayloadToConnection } from './webhooks';

const resolveLocale = (value: string | null): Locale => (isLocale(value) ? value : baseLocale);

/**
 * Builds and posts one team's weekly digest. Self-heals (removes its scheduler) when the
 * config is gone/disabled. Idempotent per team-week via lastSentWeekKey. Best-effort:
 * per-connection failures are counted, never thrown.
 */
export async function sendTeamDigest(orgId: string, now: Date = new Date()): Promise<void> {
	const config = await getDigestConfig(orgId);
	if (!config || !config.enabled) {
		await removeDigestSchedule(orgId);
		return;
	}

	const [org] = await db
		.select({ name: organization.name, locale: organization.locale })
		.from(organization)
		.where(eq(organization.id, orgId));
	if (!org) {
		await removeDigestSchedule(orgId);
		return;
	}
	const locale = resolveLocale(org.locale);
	const { weekStart, weekEndExclusive, weekKey, weekLabel } = zonedWeekBounds(
		now,
		config.timezone,
		locale
	);
	if (config.lastSentWeekKey === weekKey) return; // already sent this week

	const memberRows = await db
		.select({ userId: member.userId })
		.from(member)
		.where(eq(member.organizationId, orgId));
	const memberIds = memberRows.map((row) => row.userId);

	const candidates =
		memberIds.length === 0
			? []
			: await db
					.select({
						userName: user.name,
						type: calendarEvent.type,
						title: calendarEvent.title,
						allDay: calendarEvent.allDay,
						start: calendarEvent.start,
						end: calendarEvent.end
					})
					.from(calendarEvent)
					.innerJoin(user, eq(calendarEvent.userId, user.id))
					.where(
						and(
							inArray(calendarEvent.userId, memberIds),
							lt(calendarEvent.start, weekEndExclusive),
							gte(calendarEvent.end, weekStart)
						)
					);
	const selected: DigestSourceEvent[] = candidates.filter((event) =>
		overlapsWeek(event, weekStart, weekEndExclusive)
	);

	const message = buildDigestMessage(org.name, weekLabel, selected, locale);
	if (message.entries.length === 0 && !config.postWhenEmpty) {
		await setDigestLastSentWeekKey(orgId, weekKey);
		return;
	}

	const connections = await db
		.select({
			id: integrationConnection.id,
			provider: integrationConnection.provider,
			webhookUrl: integrationConnection.webhookUrl
		})
		.from(integrationConnection)
		.where(
			and(
				eq(integrationConnection.orgId, orgId),
				eq(integrationConnection.kind, 'webhook'),
				eq(integrationConnection.notifyDigest, true)
			)
		);

	const results = await Promise.allSettled(
		connections.map((connection) => {
			const payload = digestPayloadFor(connection.provider, message);
			return payload === null
				? Promise.resolve(false)
				: deliverPayloadToConnection(connection, payload);
		})
	);
	for (const result of results) {
		if (result.status === 'rejected') console.error('[digest] delivery failed:', result.reason);
	}
	await setDigestLastSentWeekKey(orgId, weekKey);
}
```

- [ ] **Step 2: Typecheck.**

Run: `pnpm check`
Expected: no errors.

- [ ] **Step 3: Commit.**

```bash
git add src/lib/server/integrations/digest.ts
git commit -m "feat(integrations): add sendTeamDigest orchestrator"
```

---

## Task 10: Digest worker + boot wiring

**Files:**

- Create: `src/lib/server/queue/digest-worker.ts`
- Test: `src/lib/server/queue/digest-worker.spec.ts`
- Modify: `src/hooks.server.ts`

**Interfaces:**

- Consumes: `getRedisConnection` (`./connection`); `DIGEST_QUEUE_NAME`, `DigestJobData` (`./digest-cron`); `sendTeamDigest` (`$lib/server/integrations/digest`); `reconcileDigestSchedules` (`./digest-schedule`).
- Produces: `startDigestWorker(): void`.

- [ ] **Step 1: Write the failing test.** Create `src/lib/server/queue/digest-worker.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { startDigestWorker } from './digest-worker';

describe('startDigestWorker (no Redis configured)', () => {
	it('is a no-op that does not throw', () => {
		expect(() => startDigestWorker()).not.toThrow();
	});
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `pnpm exec vitest run src/lib/server/queue/digest-worker.spec.ts`
Expected: FAIL — cannot find module `./digest-worker`.

- [ ] **Step 3: Implement `digest-worker.ts`.** Create `src/lib/server/queue/digest-worker.ts`:

```ts
import { Worker, type Job } from 'bullmq';
import { sendTeamDigest } from '$lib/server/integrations/digest';
import { getRedisConnection } from './connection';
import { DIGEST_QUEUE_NAME, type DigestJobData } from './digest-cron';
import { reconcileDigestSchedules } from './digest-schedule';

const g = globalThis as unknown as { __oooDigestWorkerStarted?: boolean };

/**
 * Starts the in-process digest worker once per server process and reconciles the
 * per-team schedulers against the DB. No-op without Redis or when already started.
 */
export function startDigestWorker(): void {
	if (g.__oooDigestWorkerStarted) return;
	const connection = getRedisConnection();
	if (!connection) return;
	g.__oooDigestWorkerStarted = true;
	const worker = new Worker<DigestJobData>(
		DIGEST_QUEUE_NAME,
		async (job: Job<DigestJobData>) => {
			await sendTeamDigest(job.data.orgId);
		},
		{ connection, concurrency: 5 }
	);
	worker.on('failed', (job, err) => console.error('[digest] job failed:', job?.id, err));
	worker.on('error', (err) => console.error('[digest] worker error:', err));

	const shutdown = async () => {
		try {
			await worker.close();
		} catch (err) {
			console.error('[digest] worker shutdown error:', err);
		}
	};
	process.once('SIGTERM', shutdown);
	process.once('SIGINT', shutdown);

	reconcileDigestSchedules().catch((err) =>
		console.error('[digest] schedule reconcile failed:', err)
	);
}
```

- [ ] **Step 4: Wire into boot.** In `src/hooks.server.ts`, add the import and call. Change the import block to add:

```ts
import { startDigestWorker } from '$lib/server/queue/digest-worker';
```

and replace `if (!building) startNotificationWorker();` with:

```ts
if (!building) {
	startNotificationWorker();
	startDigestWorker();
}
```

- [ ] **Step 5: Run the worker test + typecheck.**

Run: `pnpm exec vitest run src/lib/server/queue/digest-worker.spec.ts && pnpm check`
Expected: PASS + no type errors.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/server/queue/digest-worker.ts src/lib/server/queue/digest-worker.spec.ts src/hooks.server.ts
git commit -m "feat(queue): start the digest worker and reconcile schedules on boot"
```

---

## Task 11: Digest form schemas (`schemas/integration.ts`)

**Files:**

- Modify: `src/lib/schemas/integration.ts`
- Test: `src/lib/schemas/integration.spec.ts` (append)

**Interfaces:**

- Produces:
  - `saveDigestSchema` — validates `{ enabled: boolean; weekday: 1–7 int; hour: 0–23 int; timezone: supported IANA; postWhenEmpty: boolean }`. Real types (no string transforms): the digest form is a client `superForm` in the app's default form mode — exactly like the settings notification-preferences form (`z.boolean()` + named `Switch`) — and superforms coerces the submitted select/switch fields back to these types.
  - `updateConnectionDigestSchema` — `{ id: string; notifyDigest: boolean }`. Keeps the `z.enum(['true','false']).transform(...)` shape of `updateConnectionNotifySchema`, because it backs an instant-submit toggle (hidden input), not a superForm store.

- [ ] **Step 1: Write the failing test.** Append to `src/lib/schemas/integration.spec.ts`:

```ts
import { saveDigestSchema, updateConnectionDigestSchema } from './integration';

describe('saveDigestSchema', () => {
	const valid = {
		enabled: true,
		weekday: 1,
		hour: 8,
		timezone: 'Europe/Riga',
		postWhenEmpty: false
	};

	it('accepts a valid config', () => {
		expect(saveDigestSchema.parse(valid)).toEqual(valid);
	});

	it('rejects an out-of-range weekday', () => {
		expect(saveDigestSchema.safeParse({ ...valid, weekday: 8 }).success).toBe(false);
	});

	it('rejects an out-of-range hour', () => {
		expect(saveDigestSchema.safeParse({ ...valid, hour: 24 }).success).toBe(false);
	});

	it('rejects an unknown timezone', () => {
		expect(saveDigestSchema.safeParse({ ...valid, timezone: 'Mars/Olympus' }).success).toBe(false);
	});
});

describe('updateConnectionDigestSchema', () => {
	it('coerces the notifyDigest flag', () => {
		expect(updateConnectionDigestSchema.parse({ id: 'c1', notifyDigest: 'false' })).toEqual({
			id: 'c1',
			notifyDigest: false
		});
	});
});
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `pnpm exec vitest run src/lib/schemas/integration.spec.ts`
Expected: FAIL — schemas not exported.

- [ ] **Step 3: Implement the schemas.** Append to `src/lib/schemas/integration.ts`:

```ts
const supportedTimeZones = new Set(Intl.supportedValuesOf('timeZone'));

export const saveDigestSchema = z.object({
	enabled: z.boolean(),
	weekday: z.number().int().min(1).max(7),
	hour: z.number().int().min(0).max(23),
	timezone: z.string().refine((value) => supportedTimeZones.has(value), {
		error: () => m.error_generic()
	}),
	postWhenEmpty: z.boolean()
});

export const updateConnectionDigestSchema = z.object({
	id: z.string().min(1, { error: () => m.error_generic() }),
	notifyDigest: z.enum(['true', 'false']).transform((value) => value === 'true')
});
```

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `pnpm exec vitest run src/lib/schemas/integration.spec.ts`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/schemas/integration.ts src/lib/schemas/integration.spec.ts
git commit -m "feat(integrations): add digest save + connection-digest form schemas"
```

---

## Task 12: Team-page actions + load

**Files:**

- Modify: `src/routes/app/teams/[id]/+page.server.ts`

**Interfaces:**

- Consumes: `saveDigestSchema`, `updateConnectionDigestSchema` (`$lib/schemas/integration`); `getDigestConfig`, `upsertDigestConfig` (`$lib/server/integrations/digest-config`); `upsertDigestSchedule`, `removeDigestSchedule` (`$lib/server/queue/digest-schedule`).
- Produces: `saveDigest`, `updateConnectionDigest` actions; `integrations.digestForm` (a `SuperValidated<Infer<typeof saveDigestSchema>>` seeded from the saved config or defaults) and per-connection `notifyDigest` in the page data.

- [ ] **Step 1: Add imports.** In `src/routes/app/teams/[id]/+page.server.ts`, extend the integration imports:

```ts
import {
	addConnectionSchema,
	connectionIdSchema,
	saveDigestSchema,
	updateConnectionDigestSchema,
	updateConnectionNotifySchema
} from '$lib/schemas/integration';
```

and add:

```ts
import { getDigestConfig, upsertDigestConfig } from '$lib/server/integrations/digest-config';
import { removeDigestSchedule, upsertDigestSchedule } from '$lib/server/queue/digest-schedule';
```

- [ ] **Step 2: Extend the `load` integrations block.** In `load`, inside `if (canManage)`, add `notifyDigest` to the connection select and load the digest config. Replace the `Promise.all([...])` that builds `[connections, feedToken, connectionForm]` with:

```ts
const [connections, feedToken, connectionForm, digestConfig] = await Promise.all([
	db
		.select({
			id: integrationConnection.id,
			provider: integrationConnection.provider,
			label: integrationConnection.label,
			notifyOoo: integrationConnection.notifyOoo,
			notifyDigest: integrationConnection.notifyDigest,
			consecutiveFailures: integrationConnection.consecutiveFailures,
			lastFailureAt: integrationConnection.lastFailureAt
		})
		.from(integrationConnection)
		.where(eq(integrationConnection.orgId, params.id))
		.orderBy(integrationConnection.createdAt),
	getOrCreateFeedToken({ type: 'org', id: params.id }),
	superValidate(zod4(addConnectionSchema), { id: 'connection' }),
	getDigestConfig(params.id)
]);
const digestForm = await superValidate(
	digestConfig
		? {
				enabled: digestConfig.enabled,
				weekday: digestConfig.weekday,
				hour: digestConfig.hour,
				timezone: digestConfig.timezone,
				postWhenEmpty: digestConfig.postWhenEmpty
			}
		: { enabled: false, weekday: 1, hour: 9, timezone: currentUser.timezone, postWhenEmpty: false },
	zod4(saveDigestSchema),
	{ id: 'digest' }
);
integrations = {
	connections,
	feedUrl: feedUrl(feedToken),
	connectionForm,
	teamLocale,
	digestForm
};
```

(`getDigestConfig` returns the full row or `null`; the seed reads only the five form fields. When null, `timezone` defaults to the acting user's `timezone`.)

- [ ] **Step 3: Add the `saveDigest` and `updateConnectionDigest` actions.** In the `actions` object, after `updateConnectionNotify`, add:

```ts
	saveDigest: async (event) => {
		const form = await superValidate(event.request, zod4(saveDigestSchema), { id: 'digest' });
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		requireManager(await requireMembership(currentUser.id, event.params.id));
		await upsertDigestConfig(event.params.id, form.data);
		if (form.data.enabled) {
			await upsertDigestSchedule({ orgId: event.params.id, ...form.data });
		} else {
			await removeDigestSchedule(event.params.id);
		}
		flash(event, { type: 'success', message: m.digest_saved() });
		return { form };
	},

	updateConnectionDigest: async (event) => {
		const form = await superValidate(event.request, zod4(updateConnectionDigestSchema), {
			id: 'connection-digest'
		});
		if (!form.valid) return fail(400, { form });
		const currentUser = requireUser(event.locals);
		requireManager(await requireMembership(currentUser.id, event.params.id));
		const updated = await db
			.update(integrationConnection)
			.set({ notifyDigest: form.data.notifyDigest })
			.where(
				and(
					eq(integrationConnection.id, form.data.id),
					eq(integrationConnection.orgId, event.params.id)
				)
			)
			.returning({ id: integrationConnection.id });
		if (updated.length === 0) error(404);
		flash(event, { type: 'success', message: m.integrations_prefs_saved() });
		return { form };
	},
```

- [ ] **Step 4: Typecheck.**

Run: `pnpm check`
Expected: no errors. (`m.digest_saved` resolves once Task 14 adds the key; if running this task standalone, add the `digest_saved` key from Task 14 Step 2 first.)

- [ ] **Step 5: Commit.**

```bash
git add src/routes/app/teams/[id]/+page.server.ts
git commit -m "feat(integrations): add saveDigest and updateConnectionDigest actions"
```

---

## Task 13: Per-connection settings dialog

**Files:**

- Create: `src/lib/components/integrations/connection-settings-dialog.svelte`
- Modify: `src/lib/components/integrations/integrations-card.svelte`
- Modify: `messages/en-GB.json`, `messages/en-US.json`, `messages/pl.json`, `messages/fr.json`

**Interfaces:**

- Consumes: page data connection rows (now including `notifyDigest`).
- Produces: a dialog component rendering per-connection toggles (`notifyOoo`, `notifyDigest`), the test action, and the remove action. `integrations-card.svelte` renders compact rows that open it.

- [ ] **Step 1: Add UI message keys.** Add to `messages/en-GB.json` and `messages/en-US.json`:

```json
	"integrations_notify_digest_label": "Weekly digest",
	"connection_settings_cta": "Settings",
	"connection_settings_title": "Connection settings"
```

To `messages/pl.json`:

```json
	"integrations_notify_digest_label": "Cotygodniowe podsumowanie",
	"connection_settings_cta": "Ustawienia",
	"connection_settings_title": "Ustawienia połączenia"
```

To `messages/fr.json`:

```json
	"integrations_notify_digest_label": "Résumé hebdomadaire",
	"connection_settings_cta": "Paramètres",
	"connection_settings_title": "Paramètres de la connexion"
```

- [ ] **Step 2: Create the dialog component.** Create `src/lib/components/integrations/connection-settings-dialog.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { m } from '$lib/paraglide/messages.js';

	type ConnectionRow = {
		id: string;
		notifyOoo: boolean;
		notifyDigest: boolean;
	};

	let { row }: { row: ConnectionRow } = $props();

	/** Submit a single-toggle form by writing the value into its hidden input. */
	function submitToggle(formId: string, inputName: string, value: boolean) {
		const form = document.getElementById(formId);
		if (!(form instanceof HTMLFormElement)) return;
		const input = form.querySelector(`input[name="${inputName}"]`);
		if (input instanceof HTMLInputElement) {
			input.value = String(value);
			form.requestSubmit();
		}
	}
</script>

<Dialog.Root>
	<Dialog.Trigger class={buttonVariants({ variant: 'outline', size: 'sm' })}>
		{m.connection_settings_cta()}
	</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.connection_settings_title()}</Dialog.Title>
		</Dialog.Header>
		<div class="grid gap-4">
			<form
				id="notify-form-{row.id}"
				method="POST"
				action="?/updateConnectionNotify"
				use:enhance
				class="flex items-center justify-between gap-2"
			>
				<input type="hidden" name="id" value={row.id} />
				<input type="hidden" name="notifyOoo" value={String(row.notifyOoo)} />
				<Label for="notify-{row.id}">{m.integrations_notify_ooo_label()}</Label>
				<Switch
					id="notify-{row.id}"
					checked={row.notifyOoo}
					onCheckedChange={(value) => submitToggle(`notify-form-${row.id}`, 'notifyOoo', value)}
				/>
			</form>

			<form
				id="digest-form-{row.id}"
				method="POST"
				action="?/updateConnectionDigest"
				use:enhance
				class="flex items-center justify-between gap-2"
			>
				<input type="hidden" name="id" value={row.id} />
				<input type="hidden" name="notifyDigest" value={String(row.notifyDigest)} />
				<Label for="digest-{row.id}">{m.integrations_notify_digest_label()}</Label>
				<Switch
					id="digest-{row.id}"
					checked={row.notifyDigest}
					onCheckedChange={(value) => submitToggle(`digest-form-${row.id}`, 'notifyDigest', value)}
				/>
			</form>
		</div>
		<Dialog.Footer class="justify-between">
			<form method="POST" action="?/testConnection" use:enhance>
				<input type="hidden" name="id" value={row.id} />
				<Button type="submit" variant="outline" size="sm">{m.integrations_test_cta()}</Button>
			</form>
			<form method="POST" action="?/removeConnection" use:enhance>
				<input type="hidden" name="id" value={row.id} />
				<Button type="submit" variant="ghost" size="sm">{m.integrations_remove_cta()}</Button>
			</form>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
```

- [ ] **Step 3: Run the Svelte autofixer on the new component.** Use the Svelte MCP `svelte-autofixer` tool on `connection-settings-dialog.svelte`; apply fixes and re-run until it returns no issues. (In particular confirm the `Dialog.Trigger` `child` snippet API matches the installed shadcn-svelte/bits-ui version — check via Svelte MCP docs or `src/lib/components/ui/dialog/` if it reports an issue.)

- [ ] **Step 4: Use the dialog in the card; make rows compact.** In `src/lib/components/integrations/integrations-card.svelte`:
  - Add the import: `import ConnectionSettingsDialog from './connection-settings-dialog.svelte';`
  - Add `notifyDigest: boolean;` to the `ConnectionRow` type.
  - Replace the entire `<Item.Actions>…</Item.Actions>` block (the inline notify form, test form, and remove form) with:

```svelte
<Item.Actions>
	<ConnectionSettingsDialog {row} />
</Item.Actions>
```

- [ ] **Step 5: Run the autofixer on the card.** Run `svelte-autofixer` on `integrations-card.svelte` until clean. Remove any now-unused imports it flags (e.g. `Switch`, `Label` if no longer used in the card).

- [ ] **Step 6: Typecheck.**

Run: `pnpm check`
Expected: no errors.

- [ ] **Step 7: Verify in the preview.** Start the dev server (preview_start), open a team page you manage, confirm each connection row shows a **Settings** button that opens a dialog with the two toggles, test, and remove; toggle `notifyDigest` and confirm the flash message. Capture a screenshot.

- [ ] **Step 8: Commit.**

```bash
git add src/lib/components/integrations/connection-settings-dialog.svelte src/lib/components/integrations/integrations-card.svelte messages/
git commit -m "feat(integrations): move per-connection settings into a dialog"
```

---

## Task 14: Weekly-digest settings subsection

**Files:**

- Create: `src/lib/components/integrations/digest-settings.svelte`
- Modify: `src/lib/components/integrations/integrations-card.svelte`
- Modify: `messages/en-GB.json`, `messages/en-US.json`, `messages/pl.json`, `messages/fr.json`

**Interfaces:**

- Consumes: `integrations.digestForm` (`SuperValidated<Infer<typeof saveDigestSchema>>`) from page data.
- Produces: the digest settings form — a client `superForm` in default form mode with `name`+`bind:checked` Switches and `name`ed Selects, posting to `?/saveDigest` — mirroring the settings notification-preferences form. Rendered inside the integrations card.

- [ ] **Step 1: Add UI message keys.** Add to `messages/en-GB.json` and `messages/en-US.json`:

```json
	"digest_section_title": "Weekly digest",
	"digest_section_description": "Post a weekly summary of who's off to your channels.",
	"digest_enable_label": "Enable weekly digest",
	"digest_weekday_label": "Day",
	"digest_hour_label": "Hour",
	"digest_timezone_label": "Timezone",
	"digest_post_when_empty_label": "Post even when nobody's off",
	"digest_save_cta": "Save digest settings",
	"digest_saved": "Digest settings saved."
```

To `messages/pl.json`:

```json
	"digest_section_title": "Cotygodniowe podsumowanie",
	"digest_section_description": "Publikuj cotygodniowe podsumowanie nieobecności na swoich kanałach.",
	"digest_enable_label": "Włącz cotygodniowe podsumowanie",
	"digest_weekday_label": "Dzień",
	"digest_hour_label": "Godzina",
	"digest_timezone_label": "Strefa czasowa",
	"digest_post_when_empty_label": "Publikuj, nawet gdy nikt nie jest nieobecny",
	"digest_save_cta": "Zapisz ustawienia podsumowania",
	"digest_saved": "Zapisano ustawienia podsumowania."
```

To `messages/fr.json`:

```json
	"digest_section_title": "Résumé hebdomadaire",
	"digest_section_description": "Publiez un résumé hebdomadaire des absences sur vos canaux.",
	"digest_enable_label": "Activer le résumé hebdomadaire",
	"digest_weekday_label": "Jour",
	"digest_hour_label": "Heure",
	"digest_timezone_label": "Fuseau horaire",
	"digest_post_when_empty_label": "Publier même si personne n'est absent",
	"digest_save_cta": "Enregistrer les paramètres",
	"digest_saved": "Paramètres du résumé enregistrés."
```

- [ ] **Step 2: Create the digest settings component.** A client `superForm` in default form mode (no `dataType`), so `Switch`/`Select` controls carry `name` attributes and submit as native form fields; superforms coerces them back to the schema's `boolean`/`number`/`string` types. This mirrors the settings notification-preferences form (`Switch name=… bind:checked=…`) and profile form (`Select name=…`). Create `src/lib/components/integrations/digest-settings.svelte`:

```svelte
<script lang="ts">
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Switch } from '$lib/components/ui/switch';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime';
	import { saveDigestSchema } from '$lib/schemas/integration';

	let { form }: { form: SuperValidated<Infer<typeof saveDigestSchema>> } = $props();

	// svelte-ignore state_referenced_locally
	const {
		form: data,
		submitting,
		enhance
	} = superForm(form, { id: 'digest', validators: zod4Client(saveDigestSchema) });

	const timezones = Intl.supportedValuesOf('timeZone');
	const hours = Array.from({ length: 24 }, (_, i) => i);
	const weekdays = [1, 2, 3, 4, 5, 6, 7];
	const pad2 = (n: number) => String(n).padStart(2, '0');
	// 2024-01-01 is a Monday, so Date.UTC(2024, 0, iso) maps ISO 1–7 to Mon–Sun.
	const weekdayName = (iso: number) =>
		new Intl.DateTimeFormat(getLocale(), { weekday: 'long' }).format(
			new Date(Date.UTC(2024, 0, iso))
		);
</script>

<form method="POST" action="?/saveDigest" use:enhance class="grid gap-4">
	<div>
		<h3 class="text-sm font-medium">{m.digest_section_title()}</h3>
		<p class="text-sm text-muted-foreground">{m.digest_section_description()}</p>
	</div>

	<div class="flex items-center justify-between gap-2">
		<Label for="digest-enabled">{m.digest_enable_label()}</Label>
		<Switch id="digest-enabled" name="enabled" bind:checked={$data.enabled} />
	</div>

	{#if $data.enabled}
		<Field.Field>
			<Field.Label for="digest-weekday">{m.digest_weekday_label()}</Field.Label>
			<Select.Root
				type="single"
				name="weekday"
				value={String($data.weekday)}
				onValueChange={(value) => value && ($data.weekday = Number(value))}
			>
				<Select.Trigger id="digest-weekday" class="w-full"
					>{weekdayName($data.weekday)}</Select.Trigger
				>
				<Select.Content>
					{#each weekdays as day (day)}
						<Select.Item value={String(day)}>{weekdayName(day)}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</Field.Field>

		<Field.Field>
			<Field.Label for="digest-hour">{m.digest_hour_label()}</Field.Label>
			<Select.Root
				type="single"
				name="hour"
				value={String($data.hour)}
				onValueChange={(value) =>
					value !== undefined && value !== '' && ($data.hour = Number(value))}
			>
				<Select.Trigger id="digest-hour" class="w-full">{pad2($data.hour)}:00</Select.Trigger>
				<Select.Content>
					{#each hours as h (h)}
						<Select.Item value={String(h)}>{pad2(h)}:00</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</Field.Field>

		<Field.Field>
			<Field.Label for="digest-timezone">{m.digest_timezone_label()}</Field.Label>
			<Select.Root type="single" name="timezone" bind:value={$data.timezone}>
				<Select.Trigger id="digest-timezone" class="w-full">{$data.timezone}</Select.Trigger>
				<Select.Content class="max-h-72">
					{#each timezones as tz (tz)}
						<Select.Item value={tz}>{tz}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</Field.Field>

		<div class="flex items-center justify-between gap-2">
			<Label for="digest-empty">{m.digest_post_when_empty_label()}</Label>
			<Switch id="digest-empty" name="postWhenEmpty" bind:checked={$data.postWhenEmpty} />
		</div>
	{/if}

	<div>
		<Button type="submit" disabled={$submitting}>
			{#if $submitting}<Spinner />{/if}
			{m.digest_save_cta()}
		</Button>
	</div>
</form>
```

- [ ] **Step 3: Run the autofixer on the component.** Run `svelte-autofixer` on `digest-settings.svelte` until it returns no issues. The `Switch name=… bind:checked` and `Select.Root name=…` usages mirror `src/routes/app/settings/+page.svelte` (notification-preferences + profile forms), so the API is already proven in this codebase.

- [ ] **Step 4: Render it in the card.** In `src/lib/components/integrations/integrations-card.svelte`:
  - Add the import: `import DigestSettings from './digest-settings.svelte';`
  - Add the schema import alongside the existing `addConnectionSchema` import: `import { addConnectionSchema, saveDigestSchema } from '$lib/schemas/integration';`
  - Add `digestForm` to the existing `let { … }: { … } = $props();` block, typed as `digestForm: SuperValidated<Infer<typeof saveDigestSchema>>;` (`Infer`/`SuperValidated` are already imported at the top of the file).
  - Add, just above the closing `<FeedUrlField … />`:

```svelte
<DigestSettings form={digestForm} />
```

- [ ] **Step 5: Pass the new prop from the page.** In `src/routes/app/teams/[id]/+page.svelte`, the `IntegrationsCard` is rendered at ~line 388. Add the `digestForm` prop:

```svelte
{#if data.integrations}
	<IntegrationsCard
		connections={data.integrations.connections}
		feedUrl={data.integrations.feedUrl}
		form={data.integrations.connectionForm}
		teamLocale={data.integrations.teamLocale}
		digestForm={data.integrations.digestForm}
	/>
{/if}
```

- [ ] **Step 6: Typecheck.**

Run: `pnpm check`
Expected: no errors.

- [ ] **Step 7: Verify in the preview.** On a managed team page: enable the digest, pick a weekday/hour/timezone, save, and confirm the "Digest settings saved" flash. Reload and confirm the values persist. Toggle the enable switch off, save, and confirm the schedule fields collapse. Capture a screenshot.

- [ ] **Step 8: Commit.**

```bash
git add src/lib/components/integrations/digest-settings.svelte src/lib/components/integrations/integrations-card.svelte src/routes/app/teams/[id]/+page.svelte messages/
git commit -m "feat(integrations): add weekly digest settings to the team page"
```

---

## Final verification

- [ ] **Full test suite.**

Run: `pnpm test`
Expected: all specs pass.

- [ ] **Types + lint.**

Run: `pnpm check && pnpm lint`
Expected: no errors.

- [ ] **End-to-end manual check (requires dev Postgres + Redis).**
  1. `pnpm db:start` (Postgres) and a local Redis (`REDIS_URL` set).
  2. On a team you manage, add a Slack or Discord webhook connection.
  3. Enable the weekly digest; set the weekday/hour to ~2 minutes out in your timezone.
  4. Create an all-day event for a member within the current week.
  5. Confirm the scheduled post arrives in the channel with the correct roster and week label.
  6. Toggle the connection's `notifyDigest` off (via its Settings dialog) and confirm the next run skips it.
  7. Disable the digest; confirm (via logs / no further posts) the scheduler is removed.

---

## Self-Review notes (for the implementer)

- **Spec coverage:** data model → Task 1; scheduler (per-team repeatable, reconcile, self-heal) → Tasks 5/8/9/10; digest building (window, overlap, message, empty-week, idempotency) → Tasks 2/3/9; formatters → Task 4; `notifyDigest` routing → Tasks 1/9/11/12/13; UI (dialog + subsection) → Tasks 13/14; Redis-optional posture → Tasks 8/10; testing → per-task specs + final manual.
- **Message-key ordering:** `digest_saved` is consumed in Task 12 but its key is added in Task 14. If executing strictly in order, add the `digest_saved` key (Task 14 Step 1's pl/fr and Step 1 en variants) when you first hit `pnpm check` in Task 12, or accept the transient check failure until Task 14. Executing Task 14's message steps early is harmless.
- **BullMQ API check:** `upsertJobScheduler` / `removeJobScheduler` / `getJobSchedulers` exist in 5.79.2. If `getJobSchedulers(0, -1, true)` typing complains, the returned entry's id field is `key` — adjust the reconcile guard to whatever the installed types expose.
