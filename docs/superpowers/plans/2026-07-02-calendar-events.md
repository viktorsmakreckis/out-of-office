# Calendar Events CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/app/calendar` page where users create, edit, delete, and drag-reschedule their own out-of-office events, persisted per-user in Postgres.

**Architecture:** The generic calendar component (`src/lib/components/calendar`) renders events and reports intent through callbacks; a new `$lib/events` domain module converts between DB rows (timestamptz instants) and the component's floating-time model using the user's profile timezone; a single SvelteKit route provides load + `save`/`delete`/`move` form actions via sveltekit-superforms (zod4 adapter), following the existing settings-page pattern.

**Tech Stack:** SvelteKit 2 (Svelte 5 runes), drizzle-orm (postgres), sveltekit-superforms + zod 4, sveltekit-flash-message, Paraglide i18n, shadcn-svelte (bits-ui) components, `@internationalized/date`, vitest.

**Spec:** `docs/superpowers/specs/2026-07-02-calendar-events-design.md` — read it before starting any task.

## Global Constraints

- Package manager is **pnpm**. Test command: `pnpm exec vitest run <path>`; full suite: `pnpm test`.
- Indent with **tabs** (repo prettier config). Run `pnpm format` before each commit if unsure.
- Commit messages: conventional-commit style (`feat:`, `docs:`, …). **Never add a `Co-Authored-By` trailer** (repo policy).
- Before finalizing any `.svelte` file, run the **svelte-autofixer MCP tool** on its full source and fix everything it reports, repeating until it returns no issues (CLAUDE.md requirement).
- Follow **karpathy-guidelines** (invoke the `andrej-karpathy-skills:karpathy-guidelines` skill before writing code): surgical changes, no speculative features, no unrelated refactors.
- All user-facing strings come from Paraglide messages (`m.…()`), never hardcoded. Locales: `en`, `fr`, `pl`.
- Timezone rules (from spec): DB stores instants (`timestamptz`). Timed events convert via the **user's profile timezone**; all-day events are pinned to **UTC midnight** and only their date part is meaningful (end-inclusive). The calendar component itself never converts timezones.
- `src/lib/server/**` must never be imported from client code; `src/lib/events/types.ts` must stay importable by `drizzle.config.ts` (no value imports of paraglide or `$lib`-aliased modules — see Task 2).

---

### Task 1: Paraglide messages for calendar events

**Files:**

- Modify: `messages/en.json`
- Modify: `messages/fr.json`
- Modify: `messages/pl.json`

**Interfaces:**

- Produces: message functions `m.nav_calendar()`, `m.calendar_event_*()`, `m.validation_event_*()` used by every later task.

- [ ] **Step 1: Add English messages**

In `messages/en.json`: add `"nav_calendar": "Calendar"` directly after `"nav_home"`; add the `calendar_event_*` block directly after `"calendar_empty_description"`; add the `validation_event_*` block after the last existing `validation_*` key.

```json
"nav_calendar": "Calendar",

"calendar_event_add": "Add event",
"calendar_event_edit": "Edit event",
"calendar_event_add_description": "Fill in the details for the new event.",
"calendar_event_edit_description": "Update or delete this event.",
"calendar_event_type_label": "Type",
"calendar_event_type_vacation": "Vacation",
"calendar_event_type_sick_leave": "Sick leave",
"calendar_event_type_business_trip": "Business trip",
"calendar_event_type_public_holiday": "Public holiday",
"calendar_event_type_remote_work": "Remote work",
"calendar_event_type_other": "Other",
"calendar_event_title_label": "Title",
"calendar_event_note_label": "Note (optional)",
"calendar_event_all_day_label": "All day",
"calendar_event_start_date_label": "Start date",
"calendar_event_end_date_label": "End date",
"calendar_event_start_time_label": "Start time",
"calendar_event_end_time_label": "End time",
"calendar_event_delete": "Delete",
"calendar_event_delete_confirm": "Confirm delete",
"calendar_event_created": "Event created",
"calendar_event_updated": "Event updated",
"calendar_event_deleted": "Event deleted",
"calendar_event_moved": "Event rescheduled",

"validation_event_type_invalid": "Choose an event type",
"validation_event_title_required": "A title is required for \"Other\" events",
"validation_event_date_invalid": "Enter a valid date",
"validation_event_time_invalid": "Enter a valid time",
"validation_event_end_before_start": "The end must be after the start"
```

- [ ] **Step 2: Add French messages**

Same placement rules in `messages/fr.json`:

```json
"nav_calendar": "Calendrier",

"calendar_event_add": "Ajouter un événement",
"calendar_event_edit": "Modifier l'événement",
"calendar_event_add_description": "Renseignez les détails du nouvel événement.",
"calendar_event_edit_description": "Modifiez ou supprimez cet événement.",
"calendar_event_type_label": "Type",
"calendar_event_type_vacation": "Congés",
"calendar_event_type_sick_leave": "Arrêt maladie",
"calendar_event_type_business_trip": "Déplacement professionnel",
"calendar_event_type_public_holiday": "Jour férié",
"calendar_event_type_remote_work": "Télétravail",
"calendar_event_type_other": "Autre",
"calendar_event_title_label": "Titre",
"calendar_event_note_label": "Note (facultatif)",
"calendar_event_all_day_label": "Journée entière",
"calendar_event_start_date_label": "Date de début",
"calendar_event_end_date_label": "Date de fin",
"calendar_event_start_time_label": "Heure de début",
"calendar_event_end_time_label": "Heure de fin",
"calendar_event_delete": "Supprimer",
"calendar_event_delete_confirm": "Confirmer la suppression",
"calendar_event_created": "Événement créé",
"calendar_event_updated": "Événement mis à jour",
"calendar_event_deleted": "Événement supprimé",
"calendar_event_moved": "Événement replanifié",

"validation_event_type_invalid": "Choisissez un type d'événement",
"validation_event_title_required": "Un titre est requis pour les événements « Autre »",
"validation_event_date_invalid": "Saisissez une date valide",
"validation_event_time_invalid": "Saisissez une heure valide",
"validation_event_end_before_start": "La fin doit être après le début"
```

- [ ] **Step 3: Add Polish messages**

Same placement rules in `messages/pl.json`:

```json
"nav_calendar": "Kalendarz",

"calendar_event_add": "Dodaj wydarzenie",
"calendar_event_edit": "Edytuj wydarzenie",
"calendar_event_add_description": "Uzupełnij szczegóły nowego wydarzenia.",
"calendar_event_edit_description": "Zmień lub usuń to wydarzenie.",
"calendar_event_type_label": "Typ",
"calendar_event_type_vacation": "Urlop",
"calendar_event_type_sick_leave": "Zwolnienie lekarskie",
"calendar_event_type_business_trip": "Podróż służbowa",
"calendar_event_type_public_holiday": "Dzień wolny od pracy",
"calendar_event_type_remote_work": "Praca zdalna",
"calendar_event_type_other": "Inne",
"calendar_event_title_label": "Tytuł",
"calendar_event_note_label": "Notatka (opcjonalnie)",
"calendar_event_all_day_label": "Cały dzień",
"calendar_event_start_date_label": "Data rozpoczęcia",
"calendar_event_end_date_label": "Data zakończenia",
"calendar_event_start_time_label": "Godzina rozpoczęcia",
"calendar_event_end_time_label": "Godzina zakończenia",
"calendar_event_delete": "Usuń",
"calendar_event_delete_confirm": "Potwierdź usunięcie",
"calendar_event_created": "Wydarzenie utworzone",
"calendar_event_updated": "Wydarzenie zaktualizowane",
"calendar_event_deleted": "Wydarzenie usunięte",
"calendar_event_moved": "Wydarzenie przeniesione",

"validation_event_type_invalid": "Wybierz typ wydarzenia",
"validation_event_title_required": "Tytuł jest wymagany dla wydarzeń „Inne”",
"validation_event_date_invalid": "Podaj prawidłową datę",
"validation_event_time_invalid": "Podaj prawidłową godzinę",
"validation_event_end_before_start": "Zakończenie musi być po rozpoczęciu"
```

- [ ] **Step 4: Verify compilation**

Run: `pnpm test`
Expected: paraglide recompiles and the existing suite passes (message JSON is valid).

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/fr.json messages/pl.json
git commit -m "feat(i18n): calendar event messages"
```

---

### Task 2: `$lib/events` domain module (TDD)

**Files:**

- Create: `src/lib/events/types.ts`
- Create: `src/lib/events/labels.ts`
- Create: `src/lib/events/mapping.ts`
- Create: `src/lib/events/index.ts`
- Test: `src/lib/events/mapping.test.ts`

**Interfaces:**

- Consumes: `m.calendar_event_type_*()` (Task 1); `CalendarEvent`, `EventColor` types from `$lib/components/calendar`.
- Produces (used by Tasks 3–6):
  - `eventTypes: readonly ['vacation','sick_leave','business_trip','public_holiday','remote_work','other']`, `type EventType`
  - `eventTypeColors: Record<EventType, EventColor>`
  - `type EventRecord = { id: string; type: EventType; title: string | null; allDay: boolean; start: Date; end: Date }`
  - `type EventFormValues = { id: string; type: EventType; title: string; allDay: boolean; startDate: string; endDate: string; startTime: string; endTime: string }`
  - `DEFAULT_START_TIME = '09:00'`, `DEFAULT_END_TIME = '17:00'`
  - `eventTypeLabel(type: EventType): string`
  - `toCalendarEvent(record: EventRecord, timezone: string): CalendarEvent<EventRecord>`
  - `toFormValues(record: EventRecord, timezone: string): EventFormValues`
  - `formValuesToRange(values: Pick<EventFormValues, 'allDay' | 'startDate' | 'endDate' | 'startTime' | 'endTime'>, timezone: string): { start: Date; end: Date }`
  - `changeRangeToInstants(change: { allDay: boolean; start: string; end: string }, timezone: string): { start: Date; end: Date }`
  - `formatTimeOfDay(value: { hour: number; minute: number }): string`

**Critical constraint:** `types.ts` will be imported (via relative path) by `src/lib/server/db/schema.ts`, which `drizzle.config.ts` loads through drizzle-kit's esbuild bundler. That bundler does not resolve the `$lib` alias for value imports. Therefore `types.ts` may use **only `import type`** for anything outside the file (type-only imports are erased) and must contain **no value imports** of paraglide or aliased modules. Label/mapping code (which needs paraglide) lives in separate files that drizzle-kit never sees.

- [ ] **Step 1: Write the failing test**

Create `src/lib/events/mapping.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { m } from '$lib/paraglide/messages.js';
import {
	changeRangeToInstants,
	eventTypeColors,
	eventTypeLabel,
	formValuesToRange,
	toCalendarEvent,
	toFormValues,
	type EventRecord
} from './index';

const RIGA = 'Europe/Riga'; // UTC+3 in July 2026

const allDayRecord: EventRecord = {
	id: 'evt-1',
	type: 'vacation',
	title: null,
	allDay: true,
	start: new Date('2026-07-02T00:00:00Z'),
	end: new Date('2026-07-04T00:00:00Z')
};

const timedRecord: EventRecord = {
	id: 'evt-2',
	type: 'other',
	title: 'Dentist',
	allDay: false,
	start: new Date('2026-07-02T06:00:00Z'),
	end: new Date('2026-07-02T07:30:00Z')
};

describe('toCalendarEvent', () => {
	it('reads all-day rows as UTC dates (end-inclusive)', () => {
		const event = toCalendarEvent(allDayRecord, RIGA);
		expect(event.allDay).toBe(true);
		expect(event.start.toString()).toBe('2026-07-02');
		expect(event.end.toString()).toBe('2026-07-04');
	});

	it('converts timed rows to the profile timezone', () => {
		const event = toCalendarEvent(timedRecord, RIGA);
		expect(event.allDay).toBe(false);
		expect(event.start.toString()).toBe('2026-07-02T09:00:00');
		expect(event.end.toString()).toBe('2026-07-02T10:30:00');
	});

	it('falls back to the localized type label when title is null', () => {
		const event = toCalendarEvent(allDayRecord, RIGA);
		expect(event.title).toBe(m.calendar_event_type_vacation());
	});

	it('keeps a custom title and derives color from type', () => {
		const event = toCalendarEvent(timedRecord, RIGA);
		expect(event.title).toBe('Dentist');
		expect(event.color).toBe(eventTypeColors.other);
		expect(event.data).toBe(timedRecord);
	});
});

describe('toFormValues', () => {
	it('splits a timed record into date and time strings in the profile timezone', () => {
		expect(toFormValues(timedRecord, RIGA)).toEqual({
			id: 'evt-2',
			type: 'other',
			title: 'Dentist',
			allDay: false,
			startDate: '2026-07-02',
			endDate: '2026-07-02',
			startTime: '09:00',
			endTime: '10:30'
		});
	});

	it('uses UTC date parts and default times for all-day records', () => {
		const values = toFormValues(allDayRecord, RIGA);
		expect(values.startDate).toBe('2026-07-02');
		expect(values.endDate).toBe('2026-07-04');
		expect(values.startTime).toBe('09:00');
		expect(values.endTime).toBe('17:00');
		expect(values.title).toBe('');
	});
});

describe('formValuesToRange', () => {
	it('pins all-day values to UTC midnight', () => {
		const range = formValuesToRange(
			{ allDay: true, startDate: '2026-07-02', endDate: '2026-07-04', startTime: '', endTime: '' },
			RIGA
		);
		expect(range.start.toISOString()).toBe('2026-07-02T00:00:00.000Z');
		expect(range.end.toISOString()).toBe('2026-07-04T00:00:00.000Z');
	});

	it('interprets timed values in the profile timezone', () => {
		const range = formValuesToRange(
			{
				allDay: false,
				startDate: '2026-07-02',
				endDate: '2026-07-02',
				startTime: '09:00',
				endTime: '10:30'
			},
			RIGA
		);
		expect(range.start.toISOString()).toBe('2026-07-02T06:00:00.000Z');
		expect(range.end.toISOString()).toBe('2026-07-02T07:30:00.000Z');
	});

	it('handles a DST-crossing range (America/New_York spring forward)', () => {
		const range = formValuesToRange(
			{
				allDay: false,
				startDate: '2026-03-08',
				endDate: '2026-03-08',
				startTime: '01:00',
				endTime: '04:00'
			},
			'America/New_York'
		);
		expect(range.start.toISOString()).toBe('2026-03-08T06:00:00.000Z'); // 01:00 EST
		expect(range.end.toISOString()).toBe('2026-03-08T08:00:00.000Z'); // 04:00 EDT
	});
});

describe('changeRangeToInstants', () => {
	it('converts all-day change strings to UTC midnight', () => {
		const range = changeRangeToInstants(
			{ allDay: true, start: '2026-07-06', end: '2026-07-08' },
			RIGA
		);
		expect(range.start.toISOString()).toBe('2026-07-06T00:00:00.000Z');
		expect(range.end.toISOString()).toBe('2026-07-08T00:00:00.000Z');
	});

	it('converts timed change strings via the profile timezone', () => {
		const range = changeRangeToInstants(
			{ allDay: false, start: '2026-07-02T09:00:00', end: '2026-07-02T10:30:00' },
			RIGA
		);
		expect(range.start.toISOString()).toBe('2026-07-02T06:00:00.000Z');
		expect(range.end.toISOString()).toBe('2026-07-02T07:30:00.000Z');
	});
});

describe('eventTypeLabel', () => {
	it('maps every type to its localized label', () => {
		expect(eventTypeLabel('sick_leave')).toBe(m.calendar_event_type_sick_leave());
		expect(eventTypeLabel('other')).toBe(m.calendar_event_type_other());
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/events/mapping.test.ts`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Implement the module**

Create `src/lib/events/types.ts`:

```ts
import type { EventColor } from '$lib/components/calendar';

// NOTE: this file is imported by src/lib/server/db/schema.ts, which drizzle-kit
// bundles without $lib alias resolution. Keep it free of value imports; type-only
// imports are erased at compile time.

export const eventTypes = [
	'vacation',
	'sick_leave',
	'business_trip',
	'public_holiday',
	'remote_work',
	'other'
] as const;
export type EventType = (typeof eventTypes)[number];

export const eventTypeColors: Record<EventType, EventColor> = {
	vacation: 'blue',
	sick_leave: 'red',
	business_trip: 'violet',
	public_holiday: 'green',
	remote_work: 'amber',
	other: 'gray'
};

export const DEFAULT_START_TIME = '09:00';
export const DEFAULT_END_TIME = '17:00';

/**
 * The subset of a calendar_event row the client works with.
 * start/end are instants; all-day rows hold UTC midnight and only their
 * date part is meaningful (end-inclusive).
 */
export type EventRecord = {
	id: string;
	type: EventType;
	title: string | null;
	allDay: boolean;
	start: Date;
	end: Date;
};

/** Flat field values of the event dialog form. Empty id means "create". */
export type EventFormValues = {
	id: string;
	type: EventType;
	title: string;
	allDay: boolean;
	startDate: string;
	endDate: string;
	startTime: string;
	endTime: string;
};
```

Create `src/lib/events/labels.ts`:

```ts
import { m } from '$lib/paraglide/messages.js';
import type { EventType } from './types';

export function eventTypeLabel(type: EventType): string {
	switch (type) {
		case 'vacation':
			return m.calendar_event_type_vacation();
		case 'sick_leave':
			return m.calendar_event_type_sick_leave();
		case 'business_trip':
			return m.calendar_event_type_business_trip();
		case 'public_holiday':
			return m.calendar_event_type_public_holiday();
		case 'remote_work':
			return m.calendar_event_type_remote_work();
		case 'other':
			return m.calendar_event_type_other();
	}
}
```

Create `src/lib/events/mapping.ts`:

```ts
import {
	fromDate,
	parseDate,
	parseDateTime,
	parseTime,
	toCalendarDate,
	toCalendarDateTime,
	toZoned
} from '@internationalized/date';
import type { CalendarEvent } from '$lib/components/calendar';
import { eventTypeLabel } from './labels';
import {
	DEFAULT_END_TIME,
	DEFAULT_START_TIME,
	eventTypeColors,
	type EventFormValues,
	type EventRecord
} from './types';

export function formatTimeOfDay(value: { hour: number; minute: number }): string {
	const pad = (part: number) => String(part).padStart(2, '0');
	return `${pad(value.hour)}:${pad(value.minute)}`;
}

export function toCalendarEvent(record: EventRecord, timezone: string): CalendarEvent<EventRecord> {
	const base = {
		id: record.id,
		title: record.title ?? eventTypeLabel(record.type),
		color: eventTypeColors[record.type],
		data: record
	};
	if (record.allDay) {
		return {
			...base,
			allDay: true,
			start: toCalendarDate(fromDate(record.start, 'UTC')),
			end: toCalendarDate(fromDate(record.end, 'UTC'))
		};
	}
	return {
		...base,
		allDay: false,
		start: toCalendarDateTime(fromDate(record.start, timezone)),
		end: toCalendarDateTime(fromDate(record.end, timezone))
	};
}

export function toFormValues(record: EventRecord, timezone: string): EventFormValues {
	const shared = { id: record.id, type: record.type, title: record.title ?? '' };
	if (record.allDay) {
		return {
			...shared,
			allDay: true,
			startDate: toCalendarDate(fromDate(record.start, 'UTC')).toString(),
			endDate: toCalendarDate(fromDate(record.end, 'UTC')).toString(),
			startTime: DEFAULT_START_TIME,
			endTime: DEFAULT_END_TIME
		};
	}
	const start = toCalendarDateTime(fromDate(record.start, timezone));
	const end = toCalendarDateTime(fromDate(record.end, timezone));
	return {
		...shared,
		allDay: false,
		startDate: toCalendarDate(start).toString(),
		endDate: toCalendarDate(end).toString(),
		startTime: formatTimeOfDay(start),
		endTime: formatTimeOfDay(end)
	};
}

export function formValuesToRange(
	values: Pick<EventFormValues, 'allDay' | 'startDate' | 'endDate' | 'startTime' | 'endTime'>,
	timezone: string
): { start: Date; end: Date } {
	if (values.allDay) {
		return {
			start: parseDate(values.startDate).toDate('UTC'),
			end: parseDate(values.endDate).toDate('UTC')
		};
	}
	const start = toCalendarDateTime(parseDate(values.startDate), parseTime(values.startTime));
	const end = toCalendarDateTime(parseDate(values.endDate), parseTime(values.endTime));
	return { start: toZoned(start, timezone).toDate(), end: toZoned(end, timezone).toDate() };
}

export function changeRangeToInstants(
	change: { allDay: boolean; start: string; end: string },
	timezone: string
): { start: Date; end: Date } {
	if (change.allDay) {
		return {
			start: parseDate(change.start).toDate('UTC'),
			end: parseDate(change.end).toDate('UTC')
		};
	}
	return {
		start: toZoned(parseDateTime(change.start), timezone).toDate(),
		end: toZoned(parseDateTime(change.end), timezone).toDate()
	};
}
```

Create `src/lib/events/index.ts`:

```ts
export { eventTypeLabel } from './labels';
export {
	changeRangeToInstants,
	formatTimeOfDay,
	formValuesToRange,
	toCalendarEvent,
	toFormValues
} from './mapping';
export {
	DEFAULT_END_TIME,
	DEFAULT_START_TIME,
	eventTypeColors,
	eventTypes,
	type EventFormValues,
	type EventRecord,
	type EventType
} from './types';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/events/mapping.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/events
git commit -m "feat(events): domain types and instant/floating-time mapping"
```

---

### Task 3: `calendar_event` table and migration

**Files:**

- Modify: `src/lib/server/db/schema.ts`
- Create (generated): `drizzle/0003_calendar-events.sql`

**Interfaces:**

- Consumes: `eventTypes` from `src/lib/events/types.ts` (relative import), `user` from `./auth.schema`.
- Produces: `calendarEvent` table and `eventTypeEnum` used by Task 5.

- [ ] **Step 1: Add the table to the drizzle schema**

In `src/lib/server/db/schema.ts`, extend the imports and append the enum + table:

```ts
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
```

(Keep the existing `authRateLimit` table and `export * from './auth.schema'` untouched — shown here only for placement context.)

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate --name calendar-events`
Expected: creates `drizzle/0003_calendar-events.sql` containing `CREATE TYPE "public"."event_type"`, `CREATE TABLE "calendar_event"` with the FK to `user` (`ON DELETE cascade`) and `CREATE INDEX "calendar_event_user_id_idx"`. Inspect the SQL to confirm. (Requires `DATABASE_URL` in the environment/.env; generation itself does not connect to the DB.)

- [ ] **Step 3: Type-check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/db/schema.ts drizzle
git commit -m "feat(db): calendar_event table and event_type enum"
```

---

### Task 4: Zod validation schemas (TDD)

**Files:**

- Create: `src/lib/schemas/event.ts`
- Test: `src/lib/schemas/event.spec.ts`

**Interfaces:**

- Consumes: `eventTypes` from `$lib/events`; `m.validation_event_*()` (Task 1).
- Produces (used by Tasks 5–6): `eventSchema`, `deleteEventSchema`, `moveEventSchema`. `eventSchema` parses `EventFormValues`-shaped input; `moveEventSchema` parses `{ id, allDay, start, end }` where `start`/`end` are serialized `CalendarDate` (`2026-07-02`) or `CalendarDateTime` (`2026-07-02T09:00:00`) strings.

- [ ] **Step 1: Write the failing test**

Create `src/lib/schemas/event.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { m } from '$lib/paraglide/messages.js';
import { deleteEventSchema, eventSchema, moveEventSchema } from './event';

const validCreate = {
	id: '',
	type: 'vacation',
	title: '',
	allDay: true,
	startDate: '2026-07-02',
	endDate: '2026-07-04',
	startTime: '09:00',
	endTime: '17:00'
};

describe('eventSchema', () => {
	it('accepts a valid all-day event', () => {
		const result = eventSchema.safeParse(validCreate);
		expect(result.success).toBe(true);
	});

	it('accepts a one-day all-day event (end-inclusive)', () => {
		const result = eventSchema.safeParse({ ...validCreate, endDate: '2026-07-02' });
		expect(result.success).toBe(true);
	});

	it('accepts a valid timed event', () => {
		const result = eventSchema.safeParse({ ...validCreate, allDay: false, endDate: '2026-07-02' });
		expect(result.success).toBe(true);
	});

	it('requires a title for "other" events', () => {
		const result = eventSchema.safeParse({ ...validCreate, type: 'other' });
		expect(result.success).toBe(false);
		const issue = result.error?.issues.find((candidate) => candidate.path[0] === 'title');
		expect(issue?.message).toBe(m.validation_event_title_required());
	});

	it('accepts "other" with a title and a non-other event without one', () => {
		expect(
			eventSchema.safeParse({ ...validCreate, type: 'other', title: 'Conference' }).success
		).toBe(true);
	});

	it('rejects an all-day event ending before it starts', () => {
		const result = eventSchema.safeParse({ ...validCreate, endDate: '2026-07-01' });
		expect(result.success).toBe(false);
		const issue = result.error?.issues.find((candidate) => candidate.path[0] === 'endDate');
		expect(issue?.message).toBe(m.validation_event_end_before_start());
	});

	it('rejects a timed event with zero duration (end-exclusive)', () => {
		const result = eventSchema.safeParse({
			...validCreate,
			allDay: false,
			endDate: '2026-07-02',
			endTime: '09:00'
		});
		expect(result.success).toBe(false);
	});

	it('rejects malformed dates and times', () => {
		expect(eventSchema.safeParse({ ...validCreate, startDate: 'not-a-date' }).success).toBe(false);
		expect(
			eventSchema.safeParse({ ...validCreate, allDay: false, startTime: '25:99' }).success
		).toBe(false);
	});

	it('rejects an unknown type', () => {
		expect(eventSchema.safeParse({ ...validCreate, type: 'party' }).success).toBe(false);
	});
});

describe('deleteEventSchema', () => {
	it('requires an id', () => {
		expect(deleteEventSchema.safeParse({ id: '' }).success).toBe(false);
		expect(deleteEventSchema.safeParse({ id: 'evt-1' }).success).toBe(true);
	});
});

describe('moveEventSchema', () => {
	it('accepts an all-day change', () => {
		const result = moveEventSchema.safeParse({
			id: 'evt-1',
			allDay: true,
			start: '2026-07-02',
			end: '2026-07-04'
		});
		expect(result.success).toBe(true);
	});

	it('accepts a timed change', () => {
		const result = moveEventSchema.safeParse({
			id: 'evt-1',
			allDay: false,
			start: '2026-07-02T09:00:00',
			end: '2026-07-02T10:30:00'
		});
		expect(result.success).toBe(true);
	});

	it('rejects a change ending before it starts', () => {
		const result = moveEventSchema.safeParse({
			id: 'evt-1',
			allDay: true,
			start: '2026-07-04',
			end: '2026-07-02'
		});
		expect(result.success).toBe(false);
	});

	it('rejects malformed values for the variant', () => {
		const result = moveEventSchema.safeParse({
			id: 'evt-1',
			allDay: false,
			start: '2026-07-02',
			end: '2026-07-04'
		});
		expect(result.success).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/schemas/event.spec.ts`
Expected: FAIL — cannot resolve `./event`.

- [ ] **Step 3: Implement the schemas**

Create `src/lib/schemas/event.ts`:

```ts
import {
	parseDate,
	parseDateTime,
	parseTime,
	toCalendarDateTime,
	type CalendarDate,
	type Time
} from '@internationalized/date';
import { z } from 'zod';
import { eventTypes } from '$lib/events';
import { m } from '$lib/paraglide/messages.js';

function tryParse<T>(parse: () => T): T | null {
	try {
		return parse();
	} catch {
		return null;
	}
}

const dateSchema = z.string().refine((value) => tryParse(() => parseDate(value)) !== null, {
	error: () => m.validation_event_date_invalid()
});

const timeSchema = z.string().refine((value) => tryParse(() => parseTime(value)) !== null, {
	error: () => m.validation_event_time_invalid()
});

export const eventSchema = z
	.object({
		id: z.string().default(''),
		type: z.enum(eventTypes, { error: () => m.validation_event_type_invalid() }),
		title: z.string().trim().max(200).default(''),
		allDay: z.boolean(),
		startDate: dateSchema,
		endDate: dateSchema,
		startTime: timeSchema.default('09:00'),
		endTime: timeSchema.default('17:00')
	})
	.check((ctx) => {
		const { type, title, allDay, startDate, endDate, startTime, endTime } = ctx.value;
		if (type === 'other' && title === '') {
			ctx.issues.push({
				code: 'custom',
				message: m.validation_event_title_required(),
				path: ['title'],
				input: title
			});
		}
		const start = tryParse(() => parseDate(startDate));
		const end = tryParse(() => parseDate(endDate));
		if (!start || !end) return; // field-level refinements already reported
		if (allDay) {
			// All-day ranges are end-inclusive: start == end is a one-day event.
			if (end.compare(start) < 0) {
				ctx.issues.push({
					code: 'custom',
					message: m.validation_event_end_before_start(),
					path: ['endDate'],
					input: endDate
				});
			}
			return;
		}
		const startTimeOfDay = tryParse(() => parseTime(startTime));
		const endTimeOfDay = tryParse(() => parseTime(endTime));
		if (!startTimeOfDay || !endTimeOfDay) return;
		if (!timedEndIsAfterStart(start, startTimeOfDay, end, endTimeOfDay)) {
			ctx.issues.push({
				code: 'custom',
				message: m.validation_event_end_before_start(),
				path: ['endTime'],
				input: endTime
			});
		}
	});

// Timed ranges are end-exclusive, so the end must be strictly after the start.
function timedEndIsAfterStart(
	startDate: CalendarDate,
	startTime: Time,
	endDate: CalendarDate,
	endTime: Time
): boolean {
	return toCalendarDateTime(endDate, endTime).compare(toCalendarDateTime(startDate, startTime)) > 0;
}

export const deleteEventSchema = z.object({
	id: z.string().min(1)
});

export const moveEventSchema = z
	.object({
		id: z.string().min(1),
		allDay: z.boolean(),
		start: z.string(),
		end: z.string()
	})
	.check((ctx) => {
		const { allDay, start, end } = ctx.value;
		const invalid = () =>
			ctx.issues.push({
				code: 'custom',
				message: m.validation_event_date_invalid(),
				path: ['start'],
				input: start
			});
		if (allDay) {
			const startDate = tryParse(() => parseDate(start));
			const endDate = tryParse(() => parseDate(end));
			if (!startDate || !endDate) return invalid();
			if (endDate.compare(startDate) < 0) {
				ctx.issues.push({
					code: 'custom',
					message: m.validation_event_end_before_start(),
					path: ['end'],
					input: end
				});
			}
			return;
		}
		const startDateTime = tryParse(() => parseDateTime(start));
		const endDateTime = tryParse(() => parseDateTime(end));
		if (!startDateTime || !endDateTime) return invalid();
		if (endDateTime.compare(startDateTime) <= 0) {
			ctx.issues.push({
				code: 'custom',
				message: m.validation_event_end_before_start(),
				path: ['end'],
				input: end
			});
		}
	});
```

Note: `parseDate('2026-07-02T09:00:00')` throws (it rejects datetime strings), so the timed-variant guard in `moveEventSchema` also catches an all-day string sent with `allDay: false` — that mismatch is covered by the last test.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/schemas/event.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas/event.ts src/lib/schemas/event.spec.ts
git commit -m "feat(events): zod schemas for create, delete, and move"
```

---

### Task 5: Server route — load and actions

**Files:**

- Create: `src/routes/app/calendar/+page.server.ts`

**Interfaces:**

- Consumes: `calendarEvent` table (Task 3), `eventSchema`/`deleteEventSchema`/`moveEventSchema` (Task 4), `formValuesToRange`/`changeRangeToInstants` (Task 2), `m.calendar_event_created/updated/deleted/moved()` (Task 1).
- Produces load data for Task 6: `{ view: CalendarView; date: string; records: EventRecord[]; eventForm; deleteForm; moveForm }` (superforms ids: `'event'`, `'delete'`, `'move'`). Actions: `?/save`, `?/delete`, `?/move` — each also reads `view`/`date` from the action URL's query string for the post-redirect location.

- [ ] **Step 1: Implement the route server file**

Create `src/routes/app/calendar/+page.server.ts`:

```ts
import { error, fail, redirect as kitRedirect } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { parseDate, today, type CalendarDate } from '@internationalized/date';
import { redirect } from 'sveltekit-flash-message/server';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { CalendarView } from '$lib/components/calendar';
import { changeRangeToInstants, formValuesToRange } from '$lib/events';
import { m } from '$lib/paraglide/messages.js';
import { deleteEventSchema, eventSchema, moveEventSchema } from '$lib/schemas/event';
import { db } from '$lib/server/db';
import { calendarEvent } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

const VIEWS: readonly CalendarView[] = ['month', 'week', 'agenda'];

/** view/date come from query params so calendar state survives the POST/redirect cycle. */
function calendarState(url: URL, timezone: string): { view: CalendarView; date: CalendarDate } {
	const viewParam = url.searchParams.get('view') as CalendarView | null;
	const view: CalendarView = viewParam && VIEWS.includes(viewParam) ? viewParam : 'month';
	let date: CalendarDate;
	try {
		date = parseDate(url.searchParams.get('date') ?? '');
	} catch {
		date = today(timezone);
	}
	return { view, date };
}

function calendarPath(url: URL, timezone: string): string {
	const { view, date } = calendarState(url, timezone);
	return `/app/calendar?view=${view}&date=${date.toString()}`;
}

function requireUser(locals: App.Locals) {
	if (!locals.user) kitRedirect(303, '/login');
	return locals.user;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals);
	const { view, date } = calendarState(url, user.timezone);
	const [records, eventForm, deleteForm, moveForm] = await Promise.all([
		db
			.select({
				id: calendarEvent.id,
				type: calendarEvent.type,
				title: calendarEvent.title,
				allDay: calendarEvent.allDay,
				start: calendarEvent.start,
				end: calendarEvent.end
			})
			.from(calendarEvent)
			.where(eq(calendarEvent.userId, user.id))
			.orderBy(asc(calendarEvent.start)),
		superValidate(zod4(eventSchema), { id: 'event' }),
		superValidate(zod4(deleteEventSchema), { id: 'delete' }),
		superValidate(zod4(moveEventSchema), { id: 'move' })
	]);
	return { view, date: date.toString(), records, eventForm, deleteForm, moveForm };
};

export const actions: Actions = {
	save: async (event) => {
		const form = await superValidate(event.request, zod4(eventSchema), { id: 'event' });
		if (!form.valid) return fail(400, { form });
		const user = requireUser(event.locals);

		const range = formValuesToRange(form.data, user.timezone);
		const values = {
			type: form.data.type,
			title: form.data.title === '' ? null : form.data.title,
			allDay: form.data.allDay,
			start: range.start,
			end: range.end
		};

		let message: string;
		if (form.data.id === '') {
			await db.insert(calendarEvent).values({ ...values, userId: user.id });
			message = m.calendar_event_created();
		} else {
			const updated = await db
				.update(calendarEvent)
				.set(values)
				.where(and(eq(calendarEvent.id, form.data.id), eq(calendarEvent.userId, user.id)))
				.returning({ id: calendarEvent.id });
			if (updated.length === 0) error(404);
			message = m.calendar_event_updated();
		}
		redirect(303, calendarPath(event.url, user.timezone), { type: 'success', message }, event);
	},
	delete: async (event) => {
		const form = await superValidate(event.request, zod4(deleteEventSchema), { id: 'delete' });
		if (!form.valid) return fail(400, { form });
		const user = requireUser(event.locals);

		const deleted = await db
			.delete(calendarEvent)
			.where(and(eq(calendarEvent.id, form.data.id), eq(calendarEvent.userId, user.id)))
			.returning({ id: calendarEvent.id });
		if (deleted.length === 0) error(404);

		redirect(
			303,
			calendarPath(event.url, user.timezone),
			{ type: 'success', message: m.calendar_event_deleted() },
			event
		);
	},
	move: async (event) => {
		const form = await superValidate(event.request, zod4(moveEventSchema), { id: 'move' });
		if (!form.valid) return fail(400, { form });
		const user = requireUser(event.locals);

		const range = changeRangeToInstants(form.data, user.timezone);
		const updated = await db
			.update(calendarEvent)
			.set({ allDay: form.data.allDay, start: range.start, end: range.end })
			.where(and(eq(calendarEvent.id, form.data.id), eq(calendarEvent.userId, user.id)))
			.returning({ id: calendarEvent.id });
		if (updated.length === 0) error(404);

		redirect(
			303,
			calendarPath(event.url, user.timezone),
			{ type: 'success', message: m.calendar_event_moved() },
			event
		);
	}
};
```

Note on `requireUser`: the `/app` layout already redirects anonymous visitors, but actions run without the layout guard, so each action re-checks. `kitRedirect` throws, so the non-null return is safe; if TypeScript still complains about `locals.user` being nullable after the call, change the body to `if (!locals.user) throw kitRedirect(303, '/login'); return locals.user;` (matching `settings/+page.server.ts`).

- [ ] **Step 2: Type-check and lint**

Run: `pnpm check && pnpm lint`
Expected: 0 errors (a not-yet-used-export warning is not expected; the file exports only SvelteKit entry points).

- [ ] **Step 3: Commit**

```bash
git add src/routes/app/calendar/+page.server.ts
git commit -m "feat(calendar): server load and save/delete/move actions"
```

---

### Task 6: Event dialog, calendar page, and nav link

**Files:**

- Create: `src/routes/app/calendar/event-dialog.svelte`
- Create: `src/routes/app/calendar/+page.svelte`
- Modify: `src/routes/app/+layout.svelte` (nav link)

**Interfaces:**

- Consumes: load data and actions from Task 5; `$lib/events` (Task 2); schemas (Task 4); shadcn-svelte `ui/dialog`, `ui/field`, `ui/select`, `ui/input`, `ui/switch`, `ui/button`, `ui/spinner`; `toFieldErrors` from `$lib/utils`.
- Produces: `EventDialog` component instance methods `openCreate(values?: Partial<EventFormValues>)` and `openEdit(record: EventRecord)` (accessed via `bind:this`).

- [ ] **Step 1: Create the event dialog component**

Create `src/routes/app/calendar/event-dialog.svelte`:

```svelte
<script lang="ts">
	import { getLocalTimeZone, today } from '@internationalized/date';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Switch } from '$lib/components/ui/switch';
	import {
		DEFAULT_END_TIME,
		DEFAULT_START_TIME,
		eventTypeLabel,
		eventTypes,
		toFormValues,
		type EventFormValues,
		type EventRecord,
		type EventType
	} from '$lib/events';
	import { m } from '$lib/paraglide/messages.js';
	import { deleteEventSchema, eventSchema } from '$lib/schemas/event';
	import { toFieldErrors } from '$lib/utils';

	let {
		eventForm,
		deleteForm,
		timezone,
		actionParams
	}: {
		eventForm: SuperValidated<Infer<typeof eventSchema>>;
		deleteForm: SuperValidated<Infer<typeof deleteEventSchema>>;
		timezone: string;
		/** `&view=…&date=…` — appended to action URLs so calendar state survives the redirect. */
		actionParams: string;
	} = $props();

	let open = $state(false);
	let confirmingDelete = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, constraints, submitting, enhance, reset } = superForm(eventForm, {
		id: 'event',
		validators: zod4Client(eventSchema),
		onResult({ result }) {
			if (result.type === 'redirect') open = false;
		}
	});

	// svelte-ignore state_referenced_locally
	const {
		form: delForm,
		submitting: delSubmitting,
		enhance: delEnhance
	} = superForm(deleteForm, {
		id: 'delete',
		validators: zod4Client(deleteEventSchema),
		onResult({ result }) {
			if (result.type === 'redirect') open = false;
		}
	});

	const isEdit = $derived($form.id !== '');

	function blankValues(): EventFormValues {
		const day = today(getLocalTimeZone()).toString();
		return {
			id: '',
			type: 'vacation',
			title: '',
			allDay: true,
			startDate: day,
			endDate: day,
			startTime: DEFAULT_START_TIME,
			endTime: DEFAULT_END_TIME
		};
	}

	export function openCreate(values: Partial<EventFormValues> = {}) {
		reset({ data: { ...blankValues(), ...values } });
		confirmingDelete = false;
		open = true;
	}

	export function openEdit(record: EventRecord) {
		reset({ data: toFormValues(record, timezone) });
		$delForm.id = record.id;
		confirmingDelete = false;
		open = true;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{isEdit ? m.calendar_event_edit() : m.calendar_event_add()}</Dialog.Title>
			<Dialog.Description>
				{isEdit ? m.calendar_event_edit_description() : m.calendar_event_add_description()}
			</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action={`?/save${actionParams}`} use:enhance>
			<input type="hidden" name="id" value={$form.id} />
			<Field.Group>
				<Field.Error errors={toFieldErrors($errors._errors)} />
				<Field.Field data-invalid={!!$errors.type || undefined}>
					<Field.Label for="event-type">{m.calendar_event_type_label()}</Field.Label>
					<Select.Root
						type="single"
						name="type"
						value={$form.type}
						onValueChange={(value) => ($form.type = value as EventType)}
					>
						<Select.Trigger id="event-type" class="w-full">
							{eventTypeLabel($form.type)}
						</Select.Trigger>
						<Select.Content>
							{#each eventTypes as type (type)}
								<Select.Item value={type}>{eventTypeLabel(type)}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<Field.Error errors={toFieldErrors($errors.type)} />
				</Field.Field>
				<Field.Field data-invalid={!!$errors.title || undefined}>
					<Field.Label for="event-title">
						{$form.type === 'other'
							? m.calendar_event_title_label()
							: m.calendar_event_note_label()}
					</Field.Label>
					<Input
						id="event-title"
						name="title"
						bind:value={$form.title}
						aria-invalid={$errors.title ? 'true' : undefined}
						{...$constraints.title}
					/>
					<Field.Error errors={toFieldErrors($errors.title)} />
				</Field.Field>
				<Field.Field orientation="horizontal">
					<Field.Label for="event-all-day">{m.calendar_event_all_day_label()}</Field.Label>
					<Switch id="event-all-day" name="allDay" bind:checked={$form.allDay} />
				</Field.Field>
				<div class="grid grid-cols-2 gap-4">
					<Field.Field data-invalid={!!$errors.startDate || undefined}>
						<Field.Label for="event-start-date">{m.calendar_event_start_date_label()}</Field.Label>
						<Input
							id="event-start-date"
							type="date"
							name="startDate"
							bind:value={$form.startDate}
							aria-invalid={$errors.startDate ? 'true' : undefined}
						/>
						<Field.Error errors={toFieldErrors($errors.startDate)} />
					</Field.Field>
					<Field.Field data-invalid={!!$errors.endDate || undefined}>
						<Field.Label for="event-end-date">{m.calendar_event_end_date_label()}</Field.Label>
						<Input
							id="event-end-date"
							type="date"
							name="endDate"
							bind:value={$form.endDate}
							aria-invalid={$errors.endDate ? 'true' : undefined}
						/>
						<Field.Error errors={toFieldErrors($errors.endDate)} />
					</Field.Field>
				</div>
				{#if !$form.allDay}
					<div class="grid grid-cols-2 gap-4">
						<Field.Field data-invalid={!!$errors.startTime || undefined}>
							<Field.Label for="event-start-time">
								{m.calendar_event_start_time_label()}
							</Field.Label>
							<Input
								id="event-start-time"
								type="time"
								name="startTime"
								bind:value={$form.startTime}
								aria-invalid={$errors.startTime ? 'true' : undefined}
							/>
							<Field.Error errors={toFieldErrors($errors.startTime)} />
						</Field.Field>
						<Field.Field data-invalid={!!$errors.endTime || undefined}>
							<Field.Label for="event-end-time">{m.calendar_event_end_time_label()}</Field.Label>
							<Input
								id="event-end-time"
								type="time"
								name="endTime"
								bind:value={$form.endTime}
								aria-invalid={$errors.endTime ? 'true' : undefined}
							/>
							<Field.Error errors={toFieldErrors($errors.endTime)} />
						</Field.Field>
					</div>
				{/if}
			</Field.Group>
			<Dialog.Footer class="mt-4">
				{#if isEdit}
					{#if confirmingDelete}
						<Button
							type="submit"
							form="event-delete-form"
							variant="destructive"
							disabled={$delSubmitting}
						>
							{#if $delSubmitting}<Spinner />{/if}
							{m.calendar_event_delete_confirm()}
						</Button>
					{:else}
						<Button type="button" variant="destructive" onclick={() => (confirmingDelete = true)}>
							{m.calendar_event_delete()}
						</Button>
					{/if}
				{/if}
				<Button type="submit" disabled={$submitting}>
					{#if $submitting}<Spinner />{/if}
					{m.save()}
				</Button>
			</Dialog.Footer>
		</form>
		{#if isEdit}
			<form
				id="event-delete-form"
				method="POST"
				action={`?/delete${actionParams}`}
				use:delEnhance
				class="hidden"
			>
				<input type="hidden" name="id" value={$delForm.id} />
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
```

Design notes baked into the markup:

- The delete form is a **sibling** of the save form (nested forms are invalid HTML); the delete button reaches it via `form="event-delete-form"`.
- Delete is two-step: first click flips `confirmingDelete`, second click submits. Reopening the dialog resets it.
- `startTime`/`endTime` inputs are unmounted when all-day, so they are absent from the POST and the schema defaults fill them.
- `allDay` uses `z.boolean()` **without** `.default(true)` (Task 4) precisely because an unchecked switch posts nothing — superforms coerces the absent field to `false`.

- [ ] **Step 2: Run svelte-autofixer on the dialog**

Run the `svelte-autofixer` MCP tool with the full source of `event-dialog.svelte`; apply fixes and repeat until it reports no issues.

- [ ] **Step 3: Create the calendar page**

Create `src/routes/app/calendar/+page.svelte`:

```svelte
<script lang="ts">
	import { parseDate, toCalendarDate, type CalendarDate } from '@internationalized/date';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import {
		Calendar,
		type CalendarEvent,
		type EventChange,
		type RangeSelection
	} from '$lib/components/calendar';
	import { formatTimeOfDay, toCalendarEvent, type EventRecord } from '$lib/events';
	import { m } from '$lib/paraglide/messages.js';
	import { moveEventSchema } from '$lib/schemas/event';
	import EventDialog from './event-dialog.svelte';

	let { data } = $props();
	let view = $state(data.view);
	let date = $state(parseDate(data.date));

	let dialog: ReturnType<typeof EventDialog> | undefined = $state();

	const events = $derived(
		data.records.map((record) => toCalendarEvent(record, data.user.timezone))
	);
	const actionParams = $derived(`&view=${view}&date=${date.toString()}`);

	// svelte-ignore state_referenced_locally
	const {
		form: moveForm,
		enhance: moveEnhance,
		submit: submitMove
	} = superForm(data.moveForm, {
		id: 'move',
		validators: zod4Client(moveEventSchema),
		onUpdated({ form }) {
			if (!form.valid) toast.error(m.error_generic());
		}
	});

	function handleDayClick(day: CalendarDate) {
		dialog?.openCreate({ allDay: true, startDate: day.toString(), endDate: day.toString() });
	}

	function handleRangeSelect(range: RangeSelection) {
		if (range.allDay) {
			dialog?.openCreate({
				allDay: true,
				startDate: range.start.toString(),
				endDate: range.end.toString()
			});
		} else {
			dialog?.openCreate({
				allDay: false,
				startDate: toCalendarDate(range.start).toString(),
				endDate: toCalendarDate(range.end).toString(),
				startTime: formatTimeOfDay(range.start),
				endTime: formatTimeOfDay(range.end)
			});
		}
	}

	function handleEventClick(event: CalendarEvent<EventRecord>) {
		if (event.data) dialog?.openEdit(event.data);
	}

	function handleEventChange(event: CalendarEvent<EventRecord>, change: EventChange) {
		$moveForm.id = event.id;
		$moveForm.allDay = change.allDay;
		$moveForm.start = change.start.toString();
		$moveForm.end = change.end.toString();
		submitMove();
	}

	$effect(() => {
		const params = new URLSearchParams({ view, date: date.toString() });
		// Query-only relative navigation has no resolve()-compatible form.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`?${params}`, { replaceState: true, keepFocus: true, noScroll: true });
	});
</script>

<svelte:head><title>{m.nav_calendar()} · {m.app_name()}</title></svelte:head>

<Calendar
	{events}
	bind:view
	bind:date
	onDayClick={handleDayClick}
	onEventClick={handleEventClick}
	onRangeSelect={handleRangeSelect}
	onEventChange={handleEventChange}
>
	{#snippet headerActions()}
		<Button onclick={() => dialog?.openCreate()}>{m.calendar_event_add()}</Button>
	{/snippet}
</Calendar>

<EventDialog
	bind:this={dialog}
	eventForm={data.eventForm}
	deleteForm={data.deleteForm}
	timezone={data.user.timezone}
	{actionParams}
/>

<form method="POST" action={`?/move${actionParams}`} use:moveEnhance class="hidden">
	<input type="hidden" name="id" value={$moveForm.id} />
	<input type="hidden" name="allDay" value={$moveForm.allDay} />
	<input type="hidden" name="start" value={$moveForm.start} />
	<input type="hidden" name="end" value={$moveForm.end} />
</form>
```

Notes:

- `data.user` comes from the `/app` layout load and includes `timezone`.
- A successful `move` redirects with flash; the page reloads its data, so the drag preview is replaced by the persisted event. A failed move leaves `events` untouched and the calendar reverts the preview.

- [ ] **Step 4: Run svelte-autofixer on the page**

Run the `svelte-autofixer` MCP tool with the full source of `+page.svelte`; apply fixes and repeat until it reports no issues.

- [ ] **Step 5: Add the nav link**

In `src/routes/app/+layout.svelte`, inside `<NavigationMenu.List>`, after the Home item add:

```svelte
<NavigationMenu.Item>
	<NavigationMenu.Link href={resolve('/app/calendar')}>
		{m.nav_calendar()}
	</NavigationMenu.Link>
</NavigationMenu.Item>
```

(If `pnpm check` complains that the route is not yet in `Pathname`, run `pnpm prepare` to re-sync generated types; as a last resort use `resolve('/app/calendar' as Pathname)` like the settings link does.)

- [ ] **Step 6: Type-check, lint, test**

Run: `pnpm check && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/routes/app/calendar src/routes/app/+layout.svelte
git commit -m "feat(calendar): event CRUD page with create/edit dialog"
```

---

### Task 7: Migration + end-to-end verification

**Files:**

- No new files; runs the app against the dev database.

**Interfaces:**

- Consumes: everything above.

- [ ] **Step 1: Apply the migration**

Ensure the dev database is running (`docker compose up -d`, uses `compose.yaml`), then:

Run: `pnpm db:migrate`
Expected: applies `0003_calendar-events.sql` without errors.

- [ ] **Step 2: Full static verification**

Run: `pnpm check && pnpm lint && pnpm test`
Expected: all pass, no warnings introduced by this feature.

- [ ] **Step 3: Manual verification in the browser preview**

Start the dev server with the preview tooling and, signed in as a test user, verify each flow (watch server logs and browser console for errors throughout):

1. `/app/calendar` renders with the nav link active; view switcher and prev/today/next update the URL query params.
2. **Add button** → dialog opens blank (today, all-day, type Vacation). Save → dialog closes, success toast, event chip appears with the type's color.
3. **Day click** in month view → dialog prefilled with that day.
4. **Drag range** in month view → dialog prefilled with the multi-day range; **drag in week time grid** → dialog prefilled timed with snapped times.
5. **Type "Other"** without a title → inline validation error; with a title → saves and the chip shows the custom title. Non-other types show the localized type label on the chip.
6. **All-day toggle off** → time fields appear; end ≤ start shows the end-before-start error.
7. **Event click** → edit dialog with persisted values (times shown in the profile timezone); change fields → Save → chip updates.
8. **Delete** → first click shows "Confirm delete", second click deletes, toast shows, chip disappears.
9. **Drag move / resize** an event → success toast and the event stays at its new position after reload.
10. Reload the page — all events persist; switch locale and confirm dialog strings and type labels translate.

- [ ] **Step 4: Final commit (if fixes were needed)**

Commit any fixes discovered during verification with focused messages, then re-run Step 2.
