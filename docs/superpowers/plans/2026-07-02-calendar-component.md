# Calendar Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A generic, event-agnostic calendar component at `$lib/components/calendar` with Month, Week, and Agenda views, full drag & drop, luma-styled, plus a demo page at `/app/calendar`.

**Architecture:** Pure TypeScript layout/date logic in `src/lib/components/calendar/core/` (unit-tested, no Svelte imports), thin Svelte 5 view components on top using existing shadcn-svelte primitives. Fully controlled: the component never mutates the `events` prop; drag interactions emit proposals via callbacks.

**Tech Stack:** Svelte 5 (runes), SvelteKit, Tailwind v4, shadcn-svelte (luma), `@internationalized/date`, `tailwind-variants`, Paraglide i18n, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-02-calendar-component-design.md`. Two implementation refinements vs. the spec text (same intent, simpler mechanism):

1. Week start comes from `@internationalized/date`'s `startOfWeek(date, locale)`, which bundles CLDR week data and works in Node/SSR — no `Intl.Locale.getWeekInfo` probing or fallback table needed. Consequence: `en` starts weeks on Sunday (CLDR), `pl`/`fr` on Monday.
2. Drag state lives in each view component (month/week) rather than the root. Only one view renders at a time, so "one active drag at a time" holds trivially, and the root stays free of prop-drilled drag plumbing. The shared math lives in `core/drag.ts` either way.

## Global Constraints

- Package manager: `pnpm`. No new dependencies — everything needed is already installed.
- Svelte 5 runes syntax only (`$props`, `$state`, `$derived`, `$effect`, snippets). No legacy `export let` / `on:` directives.
- Formatting: repo Prettier config (tabs, single quotes). Run `pnpm format` before every commit.
- Imports of local TS modules use the `.js` extension (`./core/types.js`), matching repo convention (`$lib/utils.js`).
- All user-visible strings in components come from Paraglide (`import { m } from '$lib/paraglide/messages.js'`). Demo-page *sample event titles and toast text* are intentionally plain English (fake data, not UI chrome).
- After writing or editing any `.svelte` file, run the `mcp__svelte__svelte-autofixer` MCP tool on its contents and apply fixes until it reports no issues (CLAUDE.md requirement). Exception: drag-surface `onpointerdown` handlers on non-interactive elements are pointer-only progressive enhancement (keyboard equivalents exist via click callbacks); if flagged, silence with `<!-- svelte-ignore a11y_no_static_element_interactions -->` rather than restructuring.
- Commit messages: conventional commits (`feat:`, `test:`, `docs:`). **Never add a `Co-Authored-By` trailer.**
- Test commands: `pnpm test:unit --run <file>` for one file, `pnpm test` for the whole suite. Type checks: `pnpm check`. Lint: `pnpm lint`.

---

### Task 1: Paraglide messages

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/pl.json`
- Modify: `messages/fr.json`

**Interfaces:**
- Produces: message functions `m.nav_calendar()`, `m.calendar_today()`, `m.calendar_view_month()`, `m.calendar_view_week()`, `m.calendar_view_agenda()`, `m.calendar_all_day()`, `m.calendar_more({ count: number })`, `m.calendar_previous()`, `m.calendar_next()`, `m.calendar_empty_title()`, `m.calendar_empty_description()` — used by every component task.

- [ ] **Step 1: Add messages to `messages/en.json`**

Insert `nav_calendar` directly after the existing `"nav_home"` line, and the `calendar_*` block after it:

```json
	"nav_home": "Home",
	"nav_calendar": "Calendar",
	"calendar_today": "Today",
	"calendar_view_month": "Month",
	"calendar_view_week": "Week",
	"calendar_view_agenda": "Agenda",
	"calendar_all_day": "All day",
	"calendar_more": "+{count} more",
	"calendar_previous": "Previous",
	"calendar_next": "Next",
	"calendar_empty_title": "No events",
	"calendar_empty_description": "There are no events this month.",
```

- [ ] **Step 2: Add messages to `messages/pl.json`** (same position relative to `nav_home`)

```json
	"nav_calendar": "Kalendarz",
	"calendar_today": "Dzisiaj",
	"calendar_view_month": "Miesiąc",
	"calendar_view_week": "Tydzień",
	"calendar_view_agenda": "Agenda",
	"calendar_all_day": "Cały dzień",
	"calendar_more": "+{count} więcej",
	"calendar_previous": "Poprzedni",
	"calendar_next": "Następny",
	"calendar_empty_title": "Brak wydarzeń",
	"calendar_empty_description": "W tym miesiącu nie ma żadnych wydarzeń.",
```

- [ ] **Step 3: Add messages to `messages/fr.json`** (same position relative to `nav_home`)

```json
	"nav_calendar": "Calendrier",
	"calendar_today": "Aujourd'hui",
	"calendar_view_month": "Mois",
	"calendar_view_week": "Semaine",
	"calendar_view_agenda": "Agenda",
	"calendar_all_day": "Toute la journée",
	"calendar_more": "+{count} de plus",
	"calendar_previous": "Précédent",
	"calendar_next": "Suivant",
	"calendar_empty_title": "Aucun événement",
	"calendar_empty_description": "Il n'y a aucun événement ce mois-ci.",
```

- [ ] **Step 4: Verify the messages compile**

Run: `pnpm check`
Expected: paraglide compiles without errors (0 errors; pre-existing warnings, if any, are unrelated).

- [ ] **Step 5: Commit**

```bash
pnpm format
git add messages/
git commit -m "feat(i18n): add calendar messages"
```

---

### Task 2: `core/types.ts` — event model and date helpers

**Files:**
- Create: `src/lib/components/calendar/core/types.ts`
- Test: `src/lib/components/calendar/core/types.test.ts`

**Interfaces:**
- Consumes: `CalendarDate`, `CalendarDateTime`, `toCalendarDate` from `@internationalized/date`.
- Produces (used by every later task):
  - `EVENT_COLORS: readonly ['blue','green','amber','red','violet','rose','gray']`, `type EventColor`
  - `type CalendarView = 'month' | 'week' | 'agenda'`
  - `const MINUTES_IN_DAY = 1440`
  - `type AllDayEvent<T = unknown>` — `{ id: string; title: string; color?: EventColor; editable?: boolean; data?: T; allDay: true; start: CalendarDate; end: CalendarDate }` (end **inclusive**)
  - `type TimedEvent<T = unknown>` — same base with `allDay: false; start: CalendarDateTime; end: CalendarDateTime` (end **exclusive**)
  - `type CalendarEvent<T = unknown> = AllDayEvent<T> | TimedEvent<T>`
  - `type RangeSelection = { allDay: true; start: CalendarDate; end: CalendarDate } | { allDay: false; start: CalendarDateTime; end: CalendarDateTime }`
  - `type EventChange = { start: CalendarDate; end: CalendarDate } | { start: CalendarDateTime; end: CalendarDateTime }`
  - `isValidEvent(event: CalendarEvent<unknown>): boolean`
  - `validEvents<T>(events: CalendarEvent<T>[]): CalendarEvent<T>[]` — filters invalid with dev-mode `console.warn`
  - `eventDateSpan(event: CalendarEvent<unknown>): { start: CalendarDate; end: CalendarDate }` — inclusive dates covered
  - `daysBetween(from: CalendarDate, to: CalendarDate): number`
  - `eventsOnDay<T>(events: CalendarEvent<T>[], day: CalendarDate): CalendarEvent<T>[]` — sorted with `compareEvents`
  - `compareEvents(a: CalendarEvent<unknown>, b: CalendarEvent<unknown>): number` — earlier start first, longer span first, all-day before timed, then start time, then id

- [ ] **Step 1: Write the failing test**

Create `src/lib/components/calendar/core/types.test.ts`:

```ts
import { CalendarDate, CalendarDateTime } from '@internationalized/date';
import { describe, expect, it } from 'vitest';
import {
	compareEvents,
	daysBetween,
	eventDateSpan,
	eventsOnDay,
	isValidEvent,
	validEvents,
	type AllDayEvent,
	type TimedEvent
} from './types';

function allDay(id: string, start: CalendarDate, end: CalendarDate): AllDayEvent {
	return { id, title: id, allDay: true, start, end };
}

function timed(id: string, start: CalendarDateTime, end: CalendarDateTime): TimedEvent {
	return { id, title: id, allDay: false, start, end };
}

const d = (day: number) => new CalendarDate(2026, 7, day);
const t = (day: number, hour: number, minute = 0) => new CalendarDateTime(2026, 7, day, hour, minute);

describe('isValidEvent', () => {
	it('accepts a one-day all-day event (start equals end)', () => {
		expect(isValidEvent(allDay('a', d(1), d(1)))).toBe(true);
	});

	it('rejects an all-day event ending before it starts', () => {
		expect(isValidEvent(allDay('a', d(2), d(1)))).toBe(false);
	});

	it('rejects a timed event with zero duration', () => {
		expect(isValidEvent(timed('a', t(1, 9), t(1, 9)))).toBe(false);
	});

	it('accepts a timed event with positive duration', () => {
		expect(isValidEvent(timed('a', t(1, 9), t(1, 10)))).toBe(true);
	});
});

describe('validEvents', () => {
	it('filters out invalid events', () => {
		const events = [allDay('good', d(1), d(2)), allDay('bad', d(3), d(1))];
		expect(validEvents(events).map((e) => e.id)).toEqual(['good']);
	});
});

describe('eventDateSpan', () => {
	it('returns the all-day range unchanged', () => {
		expect(eventDateSpan(allDay('a', d(2), d(6)))).toEqual({ start: d(2), end: d(6) });
	});

	it('covers each calendar date a timed event touches', () => {
		const span = eventDateSpan(timed('a', t(26, 22), t(27, 6)));
		expect(span).toEqual({ start: d(26), end: d(27) });
	});

	it('does not include the next day when a timed event ends exactly at midnight', () => {
		const span = eventDateSpan(timed('a', t(1, 20), t(2, 0)));
		expect(span).toEqual({ start: d(1), end: d(1) });
	});
});

describe('daysBetween', () => {
	it('is positive going forward and negative going back', () => {
		expect(daysBetween(d(1), d(8))).toBe(7);
		expect(daysBetween(d(8), d(1))).toBe(-7);
		expect(daysBetween(d(4), d(4))).toBe(0);
	});

	it('crosses month boundaries', () => {
		expect(daysBetween(new CalendarDate(2026, 6, 29), d(1))).toBe(2);
	});
});

describe('eventsOnDay', () => {
	it('includes events covering the day and excludes others', () => {
		const events = [
			allDay('covers', d(2), d(6)),
			allDay('before', d(1), d(1)),
			timed('on-day', t(4, 9), t(4, 10))
		];
		expect(eventsOnDay(events, d(4)).map((e) => e.id)).toEqual(['covers', 'on-day']);
	});
});

describe('compareEvents', () => {
	it('orders earlier start first, longer span first, all-day before timed', () => {
		const long = allDay('long', d(1), d(5));
		const short = allDay('short', d(1), d(2));
		const meeting = timed('meeting', t(1, 9), t(1, 10));
		const sameDayAllDay = allDay('same', d(1), d(1));
		const sorted = [meeting, sameDayAllDay, short, long].sort(compareEvents);
		expect(sorted.map((e) => e.id)).toEqual(['long', 'short', 'same', 'meeting']);
	});

	it('breaks timed ties by start time then id', () => {
		const a = timed('a', t(1, 9), t(1, 10));
		const b = timed('b', t(1, 8), t(1, 9));
		expect([a, b].sort(compareEvents).map((e) => e.id)).toEqual(['b', 'a']);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit --run src/lib/components/calendar/core/types.test.ts`
Expected: FAIL — cannot resolve `./types`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/components/calendar/core/types.ts`:

```ts
import { toCalendarDate, type CalendarDate, type CalendarDateTime } from '@internationalized/date';

export const EVENT_COLORS = ['blue', 'green', 'amber', 'red', 'violet', 'rose', 'gray'] as const;
export type EventColor = (typeof EVENT_COLORS)[number];

export type CalendarView = 'month' | 'week' | 'agenda';

export const MINUTES_IN_DAY = 1440;

type CalendarEventBase<T> = {
	id: string;
	title: string;
	/** Semantic color variant; defaults to 'gray'. */
	color?: EventColor;
	/** When false, the event cannot be moved or resized. Defaults to true. */
	editable?: boolean;
	/** Consumer data, passed back through callbacks and snippets. */
	data?: T;
};

export type AllDayEvent<T = unknown> = CalendarEventBase<T> & {
	allDay: true;
	start: CalendarDate;
	/** Inclusive: a one-day event has start equal to end. */
	end: CalendarDate;
};

export type TimedEvent<T = unknown> = CalendarEventBase<T> & {
	allDay: false;
	start: CalendarDateTime;
	/** Exclusive. */
	end: CalendarDateTime;
};

export type CalendarEvent<T = unknown> = AllDayEvent<T> | TimedEvent<T>;

export type RangeSelection =
	| { allDay: true; start: CalendarDate; end: CalendarDate }
	| { allDay: false; start: CalendarDateTime; end: CalendarDateTime };

export type EventChange =
	| { start: CalendarDate; end: CalendarDate }
	| { start: CalendarDateTime; end: CalendarDateTime };

export function isValidEvent(event: CalendarEvent<unknown>): boolean {
	return event.allDay ? event.start.compare(event.end) <= 0 : event.start.compare(event.end) < 0;
}

export function validEvents<T>(events: CalendarEvent<T>[]): CalendarEvent<T>[] {
	return events.filter((event) => {
		if (isValidEvent(event)) return true;
		if (import.meta.env.DEV) {
			console.warn(`calendar: skipping event "${event.id}" — end is before start`);
		}
		return false;
	});
}

/** Inclusive range of calendar dates the event covers. */
export function eventDateSpan(event: CalendarEvent<unknown>): {
	start: CalendarDate;
	end: CalendarDate;
} {
	if (event.allDay) return { start: event.start, end: event.end };
	const start = toCalendarDate(event.start);
	let end = toCalendarDate(event.end);
	// The end is exclusive: an event ending exactly at midnight does not touch the next day.
	if (end.compare(start) > 0 && event.end.hour === 0 && event.end.minute === 0) {
		end = end.subtract({ days: 1 });
	}
	return { start, end };
}

export function daysBetween(from: CalendarDate, to: CalendarDate): number {
	return Math.round((to.toDate('UTC').getTime() - from.toDate('UTC').getTime()) / 86_400_000);
}

export function eventsOnDay<T>(events: CalendarEvent<T>[], day: CalendarDate): CalendarEvent<T>[] {
	return events
		.filter((event) => {
			const span = eventDateSpan(event);
			return span.start.compare(day) <= 0 && span.end.compare(day) >= 0;
		})
		.sort(compareEvents);
}

/** Earlier start first, longer span first, all-day before timed, then start time, then id. */
export function compareEvents(a: CalendarEvent<unknown>, b: CalendarEvent<unknown>): number {
	const spanA = eventDateSpan(a);
	const spanB = eventDateSpan(b);
	const byStart = spanA.start.compare(spanB.start);
	if (byStart !== 0) return byStart < 0 ? -1 : 1;
	const byLength = daysBetween(spanB.start, spanB.end) - daysBetween(spanA.start, spanA.end);
	if (byLength !== 0) return byLength;
	if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
	if (!a.allDay && !b.allDay) {
		const byTime = a.start.compare(b.start);
		if (byTime !== 0) return byTime < 0 ? -1 : 1;
	}
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit --run src/lib/components/calendar/core/types.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/lib/components/calendar/core/types.ts src/lib/components/calendar/core/types.test.ts
git commit -m "feat(calendar): add event model and date helpers"
```

---

### Task 3: `core/format.ts` — Intl formatting helpers

**Files:**
- Create: `src/lib/components/calendar/core/format.ts`
- Test: `src/lib/components/calendar/core/format.test.ts`

**Interfaces:**
- Consumes: `CalendarDate`, `CalendarDateTime` from `@internationalized/date`.
- Produces:
  - `formatMonthLabel(date: CalendarDate, locale: string): string` — "July 2026"
  - `formatWeekLabel(start: CalendarDate, end: CalendarDate, locale: string): string` — range label with day+month+year
  - `formatWeekdayName(date: CalendarDate, locale: string, width?: 'short' | 'long'): string`
  - `formatDayHeading(date: CalendarDate, locale: string): string` — "Wednesday 2 July" style (locale-ordered)
  - `formatTime(time: CalendarDateTime, locale: string): string`
  - `formatTimeRange(start: CalendarDateTime, end: CalendarDateTime, locale: string): string`
  - `formatHourLabel(hour: number, locale: string): string` — gutter labels in the week view

All formatting uses `Intl.DateTimeFormat` with `timeZone: 'UTC'` because `CalendarDate.toDate('UTC')` produces a UTC-midnight instant — formatting it in any other zone would shift the date.

- [ ] **Step 1: Write the failing test**

Create `src/lib/components/calendar/core/format.test.ts`. Assertions use regexes/`toContain` where ICU output has version-variant whitespace (`\s` matches the narrow no-break space newer ICU emits before AM/PM):

```ts
import { CalendarDate, CalendarDateTime } from '@internationalized/date';
import { describe, expect, it } from 'vitest';
import {
	formatDayHeading,
	formatHourLabel,
	formatMonthLabel,
	formatTime,
	formatTimeRange,
	formatWeekLabel,
	formatWeekdayName
} from './format';

const jul2 = new CalendarDate(2026, 7, 2);

describe('formatMonthLabel', () => {
	it('formats month and year per locale', () => {
		expect(formatMonthLabel(jul2, 'en')).toBe('July 2026');
		expect(formatMonthLabel(jul2, 'pl')).toBe('lipiec 2026');
		expect(formatMonthLabel(jul2, 'fr')).toBe('juillet 2026');
	});
});

describe('formatWeekLabel', () => {
	it('includes both endpoints and the year', () => {
		const label = formatWeekLabel(new CalendarDate(2026, 6, 29), new CalendarDate(2026, 7, 5), 'en');
		expect(label).toContain('29');
		expect(label).toContain('5');
		expect(label).toContain('2026');
	});
});

describe('formatWeekdayName', () => {
	it('formats short and long weekday names', () => {
		expect(formatWeekdayName(jul2, 'en')).toMatch(/^Thu/);
		expect(formatWeekdayName(jul2, 'en', 'long')).toBe('Thursday');
		expect(formatWeekdayName(jul2, 'pl', 'long')).toBe('czwartek');
	});
});

describe('formatDayHeading', () => {
	it('includes weekday, day and month', () => {
		const heading = formatDayHeading(jul2, 'en');
		expect(heading).toContain('Thursday');
		expect(heading).toContain('2');
		expect(heading).toContain('July');
	});
});

describe('formatTime', () => {
	it('formats a time per locale', () => {
		expect(formatTime(new CalendarDateTime(2026, 7, 2, 9, 0), 'en')).toMatch(/9:00\sAM/);
		expect(formatTime(new CalendarDateTime(2026, 7, 2, 15, 30), 'pl')).toBe('15:30');
	});
});

describe('formatTimeRange', () => {
	it('joins start and end', () => {
		const range = formatTimeRange(
			new CalendarDateTime(2026, 7, 2, 9, 0),
			new CalendarDateTime(2026, 7, 2, 10, 30),
			'pl'
		);
		expect(range).toContain('09:00');
		expect(range).toContain('10:30');
	});
});

describe('formatHourLabel', () => {
	it('formats a bare hour', () => {
		expect(formatHourLabel(9, 'en')).toMatch(/9\sAM/);
		expect(formatHourLabel(15, 'fr')).toContain('15');
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit --run src/lib/components/calendar/core/format.test.ts`
Expected: FAIL — cannot resolve `./format`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/components/calendar/core/format.ts`:

```ts
import type { CalendarDate, CalendarDateTime } from '@internationalized/date';

// CalendarDate.toDate('UTC') is a UTC-midnight instant; formatting must stay in UTC
// or the rendered date would shift in western timezones.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	const key = `${locale}|${JSON.stringify(options)}`;
	let cached = formatterCache.get(key);
	if (!cached) {
		cached = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
		formatterCache.set(key, cached);
	}
	return cached;
}

export function formatMonthLabel(date: CalendarDate, locale: string): string {
	return formatter(locale, { month: 'long', year: 'numeric' }).format(date.toDate('UTC'));
}

export function formatWeekLabel(start: CalendarDate, end: CalendarDate, locale: string): string {
	return formatter(locale, { day: 'numeric', month: 'short', year: 'numeric' }).formatRange(
		start.toDate('UTC'),
		end.toDate('UTC')
	);
}

export function formatWeekdayName(
	date: CalendarDate,
	locale: string,
	width: 'short' | 'long' = 'short'
): string {
	return formatter(locale, { weekday: width }).format(date.toDate('UTC'));
}

export function formatDayHeading(date: CalendarDate, locale: string): string {
	return formatter(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(
		date.toDate('UTC')
	);
}

export function formatTime(time: CalendarDateTime, locale: string): string {
	return formatter(locale, { hour: 'numeric', minute: '2-digit' }).format(time.toDate('UTC'));
}

export function formatTimeRange(
	start: CalendarDateTime,
	end: CalendarDateTime,
	locale: string
): string {
	return formatter(locale, { hour: 'numeric', minute: '2-digit' }).formatRange(
		start.toDate('UTC'),
		end.toDate('UTC')
	);
}

export function formatHourLabel(hour: number, locale: string): string {
	return formatter(locale, { hour: 'numeric' }).format(Date.UTC(2000, 0, 1, hour));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit --run src/lib/components/calendar/core/format.test.ts`
Expected: PASS. If `formatMonthLabel` for `pl`/`fr` fails on exact strings, the local Node lacks full ICU — extremely unlikely on Node ≥ 16; report rather than loosening the test.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/lib/components/calendar/core/format.ts src/lib/components/calendar/core/format.test.ts
git commit -m "feat(calendar): add Intl formatting helpers"
```

---

### Task 4: `core/month-grid.ts` — grid generation

**Files:**
- Create: `src/lib/components/calendar/core/month-grid.ts`
- Test: `src/lib/components/calendar/core/month-grid.test.ts`

**Interfaces:**
- Consumes: `startOfMonth`, `startOfWeek` from `@internationalized/date`.
- Produces:
  - `const WEEKS_IN_GRID = 6`, `const DAYS_IN_WEEK = 7`
  - `monthGrid(focal: CalendarDate, locale: string): CalendarDate[][]` — 6 rows × 7 days covering the focal month, week start per locale
  - `weekDays(focal: CalendarDate, locale: string): CalendarDate[]` — the 7 days of the focal date's week

- [ ] **Step 1: Write the failing test**

Create `src/lib/components/calendar/core/month-grid.test.ts`:

```ts
import { CalendarDate } from '@internationalized/date';
import { describe, expect, it } from 'vitest';
import { monthGrid, weekDays, DAYS_IN_WEEK, WEEKS_IN_GRID } from './month-grid';

const jul2026 = new CalendarDate(2026, 7, 15);

describe('monthGrid', () => {
	it('always returns 6 weeks of 7 days', () => {
		const grid = monthGrid(jul2026, 'pl');
		expect(grid).toHaveLength(WEEKS_IN_GRID);
		for (const week of grid) expect(week).toHaveLength(DAYS_IN_WEEK);
	});

	it('starts on Monday for pl and Sunday for en', () => {
		// 2026-07-01 is a Wednesday.
		expect(monthGrid(jul2026, 'pl')[0][0]).toEqual(new CalendarDate(2026, 6, 29));
		expect(monthGrid(jul2026, 'en')[0][0]).toEqual(new CalendarDate(2026, 6, 28));
	});

	it('produces 42 consecutive days', () => {
		const days = monthGrid(jul2026, 'pl').flat();
		for (let i = 1; i < days.length; i++) {
			expect(days[i].compare(days[i - 1].add({ days: 1 }))).toBe(0);
		}
	});

	it('covers every day of the focal month', () => {
		const days = monthGrid(jul2026, 'en').flat();
		for (let day = 1; day <= 31; day++) {
			expect(days.some((d) => d.compare(new CalendarDate(2026, 7, day)) === 0)).toBe(true);
		}
	});

	it('handles February of a leap year', () => {
		const feb = monthGrid(new CalendarDate(2028, 2, 10), 'pl');
		const days = feb.flat();
		expect(days.some((d) => d.compare(new CalendarDate(2028, 2, 29)) === 0)).toBe(true);
	});
});

describe('weekDays', () => {
	it('returns the 7 days of the focal week starting per locale', () => {
		const days = weekDays(new CalendarDate(2026, 7, 2), 'pl');
		expect(days).toHaveLength(7);
		expect(days[0]).toEqual(new CalendarDate(2026, 6, 29));
		expect(days[6]).toEqual(new CalendarDate(2026, 7, 5));
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit --run src/lib/components/calendar/core/month-grid.test.ts`
Expected: FAIL — cannot resolve `./month-grid`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/components/calendar/core/month-grid.ts`:

```ts
import { startOfMonth, startOfWeek, type CalendarDate } from '@internationalized/date';

export const WEEKS_IN_GRID = 6;
export const DAYS_IN_WEEK = 7;

/** 6 rows × 7 days covering the focal month; a fixed 6 rows keeps the layout height stable. */
export function monthGrid(focal: CalendarDate, locale: string): CalendarDate[][] {
	const first = startOfWeek(startOfMonth(focal), locale);
	return Array.from({ length: WEEKS_IN_GRID }, (_, week) =>
		Array.from({ length: DAYS_IN_WEEK }, (_, day) => first.add({ days: week * DAYS_IN_WEEK + day }))
	);
}

/** The 7 days of the focal date's week, starting per locale. */
export function weekDays(focal: CalendarDate, locale: string): CalendarDate[] {
	const first = startOfWeek(focal, locale);
	return Array.from({ length: DAYS_IN_WEEK }, (_, day) => first.add({ days: day }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit --run src/lib/components/calendar/core/month-grid.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/lib/components/calendar/core/month-grid.ts src/lib/components/calendar/core/month-grid.test.ts
git commit -m "feat(calendar): add month grid generation"
```

---

### Task 5: `core/lanes.ts` — multi-day chip lane packing

**Files:**
- Create: `src/lib/components/calendar/core/lanes.ts`
- Test: `src/lib/components/calendar/core/lanes.test.ts`

**Interfaces:**
- Consumes: `compareEvents`, `daysBetween`, `eventDateSpan`, `CalendarEvent` from `./types.js`.
- Produces:
  - `type LaneSegment<T = unknown> = { event: CalendarEvent<T>; lane: number; startCol: number; span: number; continuesLeft: boolean; continuesRight: boolean }`
  - `packLanes<T>(events: CalendarEvent<T>[], rowStart: CalendarDate, days: number): LaneSegment<T>[]` — first-fit packing, `compareEvents` order (earlier/longer first)
  - `overflowCounts(segments: LaneSegment<unknown>[], days: number, maxLanes: number): number[]` — per-column count of events on lanes ≥ `maxLanes`

- [ ] **Step 1: Write the failing test**

Create `src/lib/components/calendar/core/lanes.test.ts`:

```ts
import { CalendarDate, CalendarDateTime } from '@internationalized/date';
import { describe, expect, it } from 'vitest';
import { overflowCounts, packLanes } from './lanes';
import type { AllDayEvent, TimedEvent } from './types';

const d = (day: number) => new CalendarDate(2026, 7, day);
const rowStart = d(6); // Monday 2026-07-06

function allDay(id: string, start: number, end: number): AllDayEvent {
	return { id, title: id, allDay: true, start: d(start), end: d(end) };
}

describe('packLanes', () => {
	it('places non-overlapping events on the same lane', () => {
		const segments = packLanes([allDay('a', 6, 7), allDay('b', 9, 10)], rowStart, 7);
		expect(segments.every((s) => s.lane === 0)).toBe(true);
	});

	it('stacks overlapping events on separate lanes, longest first', () => {
		const long = allDay('long', 6, 10);
		const short = allDay('short', 7, 8);
		const segments = packLanes([short, long], rowStart, 7);
		const byId = Object.fromEntries(segments.map((s) => [s.event.id, s]));
		expect(byId.long.lane).toBe(0);
		expect(byId.short.lane).toBe(1);
	});

	it('clips segments to the row and flags continuation', () => {
		const segments = packLanes([allDay('span', 3, 15)], rowStart, 7);
		expect(segments).toHaveLength(1);
		expect(segments[0]).toMatchObject({
			startCol: 0,
			span: 7,
			continuesLeft: true,
			continuesRight: true
		});
	});

	it('computes startCol and span inside the row', () => {
		const segments = packLanes([allDay('mid', 8, 9)], rowStart, 7);
		expect(segments[0]).toMatchObject({
			startCol: 2,
			span: 2,
			continuesLeft: false,
			continuesRight: false
		});
	});

	it('excludes events outside the row', () => {
		expect(packLanes([allDay('before', 1, 5), allDay('after', 13, 20)], rowStart, 7)).toHaveLength(1);
	});

	it('includes timed events as single-column segments via their date span', () => {
		const meeting: TimedEvent = {
			id: 'meeting',
			title: 'meeting',
			allDay: false,
			start: new CalendarDateTime(2026, 7, 8, 9, 0),
			end: new CalendarDateTime(2026, 7, 8, 10, 0)
		};
		const segments = packLanes([meeting], rowStart, 7);
		expect(segments[0]).toMatchObject({ startCol: 2, span: 1 });
	});

	it('reuses freed lanes (first fit)', () => {
		const a = allDay('a', 6, 7);
		const b = allDay('b', 6, 12); // occupies lane 1 after a takes lane 0... or lane 0 if sorted longer-first
		const c = allDay('c', 9, 10); // fits back on the lane a freed
		const segments = packLanes([a, b, c], rowStart, 7);
		const byId = Object.fromEntries(segments.map((s) => [s.event.id, s]));
		// b is longest → lane 0; a takes lane 1; c fits lane 1 after a ends.
		expect(byId.b.lane).toBe(0);
		expect(byId.a.lane).toBe(1);
		expect(byId.c.lane).toBe(1);
	});
});

describe('overflowCounts', () => {
	it('counts hidden events per column', () => {
		const events = [allDay('a', 6, 12), allDay('b', 6, 12), allDay('c', 6, 7), allDay('d', 6, 6)];
		const segments = packLanes(events, rowStart, 7);
		const counts = overflowCounts(segments, 7, 2);
		// Lanes 0..1 visible; lane 2 (c: cols 0-1) and lane 3 (d: col 0) hidden.
		expect(counts).toEqual([2, 1, 0, 0, 0, 0, 0]);
	});

	it('is all zeros when everything fits', () => {
		const segments = packLanes([allDay('a', 6, 7)], rowStart, 7);
		expect(overflowCounts(segments, 7, 2)).toEqual([0, 0, 0, 0, 0, 0, 0]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit --run src/lib/components/calendar/core/lanes.test.ts`
Expected: FAIL — cannot resolve `./lanes`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/components/calendar/core/lanes.ts`:

```ts
import type { CalendarDate } from '@internationalized/date';
import { compareEvents, daysBetween, eventDateSpan, type CalendarEvent } from './types.js';

export type LaneSegment<T = unknown> = {
	event: CalendarEvent<T>;
	lane: number;
	/** 0-based column within the row. */
	startCol: number;
	/** Columns covered (≥ 1). */
	span: number;
	continuesLeft: boolean;
	continuesRight: boolean;
};

/**
 * Packs the events overlapping a row of `days` consecutive dates starting at `rowStart`
 * into horizontal lanes. First-fit in compareEvents order (earlier, then longer, first),
 * which keeps multi-day chips on stable upper lanes.
 */
export function packLanes<T>(
	events: CalendarEvent<T>[],
	rowStart: CalendarDate,
	days: number
): LaneSegment<T>[] {
	const rowEnd = rowStart.add({ days: days - 1 });
	const occupancy: boolean[][] = [];
	const segments: LaneSegment<T>[] = [];

	for (const event of [...events].sort(compareEvents)) {
		const span = eventDateSpan(event);
		if (span.start.compare(rowEnd) > 0 || span.end.compare(rowStart) < 0) continue;
		const startCol = Math.max(0, daysBetween(rowStart, span.start));
		const endCol = Math.min(days - 1, daysBetween(rowStart, span.end));

		let lane = 0;
		while (isOccupied(occupancy, lane, startCol, endCol)) lane++;
		markOccupied(occupancy, lane, startCol, endCol);

		segments.push({
			event,
			lane,
			startCol,
			span: endCol - startCol + 1,
			continuesLeft: span.start.compare(rowStart) < 0,
			continuesRight: span.end.compare(rowEnd) > 0
		});
	}
	return segments;
}

/** Per-column count of events hidden when only `maxLanes` lanes are rendered. */
export function overflowCounts(
	segments: LaneSegment<unknown>[],
	days: number,
	maxLanes: number
): number[] {
	const counts = new Array<number>(days).fill(0);
	for (const segment of segments) {
		if (segment.lane < maxLanes) continue;
		for (let col = segment.startCol; col < segment.startCol + segment.span; col++) counts[col]++;
	}
	return counts;
}

function isOccupied(occupancy: boolean[][], lane: number, startCol: number, endCol: number): boolean {
	const row = occupancy[lane];
	if (!row) return false;
	for (let col = startCol; col <= endCol; col++) if (row[col]) return true;
	return false;
}

function markOccupied(occupancy: boolean[][], lane: number, startCol: number, endCol: number): void {
	const row = (occupancy[lane] ??= []);
	for (let col = startCol; col <= endCol; col++) row[col] = true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit --run src/lib/components/calendar/core/lanes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/lib/components/calendar/core/lanes.ts src/lib/components/calendar/core/lanes.test.ts
git commit -m "feat(calendar): add lane packing for multi-day chips"
```

---

### Task 6: `core/columns.ts` — week-view overlap columns

**Files:**
- Create: `src/lib/components/calendar/core/columns.ts`
- Test: `src/lib/components/calendar/core/columns.test.ts`

**Interfaces:**
- Consumes: `toCalendarDateTime` from `@internationalized/date`; `MINUTES_IN_DAY`, `TimedEvent` from `./types.js`.
- Produces:
  - `type ColumnPlacement<T = unknown> = { event: TimedEvent<T>; startMinute: number; endMinute: number; col: number; colCount: number }` — minutes are clipped to `[0, 1440]` for the given day
  - `layoutDayColumns<T>(events: TimedEvent<T>[], day: CalendarDate): ColumnPlacement<T>[]` — transitive overlap groups share `colCount`; greedy column assignment

- [ ] **Step 1: Write the failing test**

Create `src/lib/components/calendar/core/columns.test.ts`:

```ts
import { CalendarDate, CalendarDateTime } from '@internationalized/date';
import { describe, expect, it } from 'vitest';
import { layoutDayColumns } from './columns';
import type { TimedEvent } from './types';

const day = new CalendarDate(2026, 7, 9);
const t = (dayOfMonth: number, hour: number, minute = 0) =>
	new CalendarDateTime(2026, 7, dayOfMonth, hour, minute);

function timed(id: string, start: CalendarDateTime, end: CalendarDateTime): TimedEvent {
	return { id, title: id, allDay: false, start, end };
}

describe('layoutDayColumns', () => {
	it('gives non-overlapping events full width', () => {
		const placements = layoutDayColumns(
			[timed('a', t(9, 9), t(9, 10)), timed('b', t(9, 11), t(9, 12))],
			day
		);
		expect(placements.every((p) => p.col === 0 && p.colCount === 1)).toBe(true);
	});

	it('splits two overlapping events into two columns', () => {
		const placements = layoutDayColumns(
			[timed('a', t(9, 10), t(9, 11)), timed('b', t(9, 10, 30), t(9, 11, 30))],
			day
		);
		const byId = Object.fromEntries(placements.map((p) => [p.event.id, p]));
		expect(byId.a).toMatchObject({ col: 0, colCount: 2 });
		expect(byId.b).toMatchObject({ col: 1, colCount: 2 });
	});

	it('shares colCount across a transitive overlap chain', () => {
		// a overlaps b, b overlaps c, but a does not overlap c — still one group.
		const placements = layoutDayColumns(
			[
				timed('a', t(9, 9), t(9, 10, 30)),
				timed('b', t(9, 10), t(9, 12)),
				timed('c', t(9, 11), t(9, 13))
			],
			day
		);
		const byId = Object.fromEntries(placements.map((p) => [p.event.id, p]));
		expect(byId.a.colCount).toBe(2);
		expect(byId.b.colCount).toBe(2);
		expect(byId.c.colCount).toBe(2);
		expect(byId.c.col).toBe(0); // reuses the column a freed
	});

	it('computes minutes from midnight', () => {
		const [p] = layoutDayColumns([timed('a', t(9, 9, 15), t(9, 10, 45))], day);
		expect(p.startMinute).toBe(555);
		expect(p.endMinute).toBe(645);
	});

	it('clips events crossing midnight to the day', () => {
		const [p] = layoutDayColumns([timed('a', t(8, 22), t(9, 6))], day);
		expect(p.startMinute).toBe(0);
		expect(p.endMinute).toBe(360);
	});

	it('excludes events not touching the day', () => {
		expect(layoutDayColumns([timed('a', t(8, 9), t(8, 10))], day)).toHaveLength(0);
	});

	it('excludes an event ending exactly at the day start', () => {
		expect(layoutDayColumns([timed('a', t(8, 22), t(9, 0))], day)).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit --run src/lib/components/calendar/core/columns.test.ts`
Expected: FAIL — cannot resolve `./columns`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/components/calendar/core/columns.ts`:

```ts
import { toCalendarDateTime, type CalendarDate, type CalendarDateTime } from '@internationalized/date';
import { MINUTES_IN_DAY, type TimedEvent } from './types.js';

export type ColumnPlacement<T = unknown> = {
	event: TimedEvent<T>;
	/** Minutes from the day's midnight, clipped to [0, 1440]. */
	startMinute: number;
	endMinute: number;
	col: number;
	colCount: number;
};

/**
 * Lays out one day's timed events into side-by-side columns. Events in the same
 * transitive overlap group share colCount; columns are assigned greedily so a
 * freed column is reused by the next non-overlapping event.
 */
export function layoutDayColumns<T>(events: TimedEvent<T>[], day: CalendarDate): ColumnPlacement<T>[] {
	const dayStart = toCalendarDateTime(day);
	const dayEnd = toCalendarDateTime(day.add({ days: 1 }));

	const clipped = events
		.filter((event) => event.start.compare(dayEnd) < 0 && event.end.compare(dayStart) > 0)
		.map((event) => ({
			event,
			startMinute: event.start.compare(dayStart) <= 0 ? 0 : minutesFromMidnight(event.start),
			endMinute: event.end.compare(dayEnd) >= 0 ? MINUTES_IN_DAY : minutesFromMidnight(event.end),
			col: 0,
			colCount: 0
		}))
		.sort(
			(a, b) =>
				a.startMinute - b.startMinute ||
				b.endMinute - a.endMinute ||
				(a.event.id < b.event.id ? -1 : 1)
		);

	let group: ColumnPlacement<T>[] = [];
	let columnEnds: number[] = [];
	let groupEnd = 0;

	const closeGroup = () => {
		for (const placement of group) placement.colCount = columnEnds.length;
		group = [];
		columnEnds = [];
		groupEnd = 0;
	};

	for (const placement of clipped) {
		if (group.length > 0 && placement.startMinute >= groupEnd) closeGroup();
		let col = columnEnds.findIndex((end) => end <= placement.startMinute);
		if (col === -1) col = columnEnds.length;
		placement.col = col;
		columnEnds[col] = placement.endMinute;
		group.push(placement);
		groupEnd = Math.max(groupEnd, placement.endMinute);
	}
	closeGroup();

	return clipped;
}

function minutesFromMidnight(time: CalendarDateTime): number {
	return time.hour * 60 + time.minute;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit --run src/lib/components/calendar/core/columns.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/lib/components/calendar/core/columns.ts src/lib/components/calendar/core/columns.test.ts
git commit -m "feat(calendar): add overlap column layout for the week view"
```

---

### Task 7: `core/drag.ts` — drag geometry and snapping

**Files:**
- Create: `src/lib/components/calendar/core/drag.ts`
- Test: `src/lib/components/calendar/core/drag.test.ts`

**Interfaces:**
- Consumes: `toCalendarDateTime` from `@internationalized/date`; `MINUTES_IN_DAY` from `./types.js`.
- Produces:
  - `const SNAP_MINUTES = 15`, `const MIN_EVENT_MINUTES = 15`
  - `snapMinute(minute: number): number`
  - `cellAtPoint(x: number, y: number, width: number, height: number, cols: number, rows: number): { col: number; row: number }` — clamped to grid bounds
  - `minuteAtPoint(y: number, height: number): number` — snapped, clamped to `[0, 1440]`
  - `timeOn(day: CalendarDate, minute: number): CalendarDateTime`
  - `dateRangeBetween(anchor: CalendarDate, target: CalendarDate): { start: CalendarDate; end: CalendarDate }` — ordered
  - `timeRangeBetween(day: CalendarDate, anchorMinute: number, targetMinute: number): { start: CalendarDateTime; end: CalendarDateTime }` — snapped, ordered, ≥ 15 min
  - `movedAllDay(start: CalendarDate, end: CalendarDate, dayDelta: number): { start: CalendarDate; end: CalendarDate }`
  - `resizedAllDay(start: CalendarDate, end: CalendarDate, edge: 'start' | 'end', target: CalendarDate): { start: CalendarDate; end: CalendarDate }` — never inverts
  - `movedTimed(start: CalendarDateTime, end: CalendarDateTime, dayDelta: number, minuteDelta: number): { start: CalendarDateTime; end: CalendarDateTime }` — minute delta snapped
  - `resizedTimed(start: CalendarDateTime, day: CalendarDate, minute: number): { start: CalendarDateTime; end: CalendarDateTime }` — end ≥ start + 15 min

- [ ] **Step 1: Write the failing test**

Create `src/lib/components/calendar/core/drag.test.ts`:

```ts
import { CalendarDate, CalendarDateTime } from '@internationalized/date';
import { describe, expect, it } from 'vitest';
import {
	cellAtPoint,
	dateRangeBetween,
	minuteAtPoint,
	movedAllDay,
	movedTimed,
	resizedAllDay,
	resizedTimed,
	snapMinute,
	timeOn,
	timeRangeBetween
} from './drag';

const d = (day: number) => new CalendarDate(2026, 7, day);
const t = (day: number, hour: number, minute = 0) => new CalendarDateTime(2026, 7, day, hour, minute);

describe('snapMinute', () => {
	it('rounds to the nearest 15 minutes', () => {
		expect(snapMinute(0)).toBe(0);
		expect(snapMinute(7)).toBe(0);
		expect(snapMinute(8)).toBe(15);
		expect(snapMinute(52)).toBe(45);
		expect(snapMinute(53)).toBe(60);
	});
});

describe('cellAtPoint', () => {
	it('maps a point to its cell', () => {
		expect(cellAtPoint(150, 50, 700, 600, 7, 6)).toEqual({ col: 1, row: 0 });
		expect(cellAtPoint(650, 550, 700, 600, 7, 6)).toEqual({ col: 6, row: 5 });
	});

	it('clamps points outside the grid', () => {
		expect(cellAtPoint(-10, -10, 700, 600, 7, 6)).toEqual({ col: 0, row: 0 });
		expect(cellAtPoint(900, 900, 700, 600, 7, 6)).toEqual({ col: 6, row: 5 });
	});
});

describe('minuteAtPoint', () => {
	it('maps y to a snapped minute of day', () => {
		expect(minuteAtPoint(0, 1152)).toBe(0);
		expect(minuteAtPoint(576, 1152)).toBe(720); // halfway → noon
		expect(minuteAtPoint(1152, 1152)).toBe(1440);
	});

	it('clamps outside the column', () => {
		expect(minuteAtPoint(-50, 1152)).toBe(0);
		expect(minuteAtPoint(5000, 1152)).toBe(1440);
	});
});

describe('timeOn', () => {
	it('builds a CalendarDateTime at a minute of the day', () => {
		expect(timeOn(d(2), 570).compare(t(2, 9, 30))).toBe(0);
	});
});

describe('dateRangeBetween', () => {
	it('orders the endpoints', () => {
		expect(dateRangeBetween(d(5), d(2))).toEqual({ start: d(2), end: d(5) });
		expect(dateRangeBetween(d(2), d(5))).toEqual({ start: d(2), end: d(5) });
	});
});

describe('timeRangeBetween', () => {
	it('orders and snaps the endpoints', () => {
		const range = timeRangeBetween(d(2), 655, 590);
		expect(range.start.compare(t(2, 9, 45))).toBe(0);
		expect(range.end.compare(t(2, 11, 0))).toBe(0);
	});

	it('enforces the minimum duration', () => {
		const range = timeRangeBetween(d(2), 600, 600);
		expect(range.end.compare(range.start.add({ minutes: 15 }))).toBe(0);
	});

	it('keeps the minimum duration at the end of the day', () => {
		const range = timeRangeBetween(d(2), 1440, 1440);
		expect(range.start.compare(t(2, 23, 45))).toBe(0);
		expect(range.end.compare(t(3, 0, 0))).toBe(0);
	});
});

describe('movedAllDay', () => {
	it('shifts both ends by whole days', () => {
		expect(movedAllDay(d(2), d(4), 3)).toEqual({ start: d(5), end: d(7) });
		expect(movedAllDay(d(2), d(4), -1)).toEqual({ start: d(1), end: d(3) });
	});
});

describe('resizedAllDay', () => {
	it('moves one edge to the target', () => {
		expect(resizedAllDay(d(2), d(4), 'end', d(8))).toEqual({ start: d(2), end: d(8) });
		expect(resizedAllDay(d(2), d(4), 'start', d(1))).toEqual({ start: d(1), end: d(4) });
	});

	it('never inverts the range', () => {
		expect(resizedAllDay(d(2), d(4), 'end', d(1))).toEqual({ start: d(2), end: d(2) });
		expect(resizedAllDay(d(2), d(4), 'start', d(9))).toEqual({ start: d(4), end: d(4) });
	});
});

describe('movedTimed', () => {
	it('shifts by days and snapped minutes', () => {
		const moved = movedTimed(t(2, 9), t(2, 10), 1, 37);
		expect(moved.start.compare(t(3, 9, 30))).toBe(0);
		expect(moved.end.compare(t(3, 10, 30))).toBe(0);
	});
});

describe('resizedTimed', () => {
	it('sets the end to the snapped target minute', () => {
		const resized = resizedTimed(t(2, 9), d(2), 640);
		expect(resized.end.compare(t(2, 10, 45))).toBe(0);
	});

	it('enforces the minimum duration', () => {
		const resized = resizedTimed(t(2, 9), d(2), 300);
		expect(resized.end.compare(t(2, 9, 15))).toBe(0);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit --run src/lib/components/calendar/core/drag.test.ts`
Expected: FAIL — cannot resolve `./drag`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/components/calendar/core/drag.ts`:

```ts
import { toCalendarDateTime, type CalendarDate, type CalendarDateTime } from '@internationalized/date';
import { MINUTES_IN_DAY } from './types.js';

export const SNAP_MINUTES = 15;
export const MIN_EVENT_MINUTES = 15;

export function snapMinute(minute: number): number {
	return Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES;
}

/** Maps grid-relative coordinates to a cell, clamped to the grid. */
export function cellAtPoint(
	x: number,
	y: number,
	width: number,
	height: number,
	cols: number,
	rows: number
): { col: number; row: number } {
	return {
		col: clamp(Math.floor((x / width) * cols), 0, cols - 1),
		row: clamp(Math.floor((y / height) * rows), 0, rows - 1)
	};
}

/** Maps a column-relative y to a snapped minute of the day. */
export function minuteAtPoint(y: number, height: number): number {
	return clamp(snapMinute((y / height) * MINUTES_IN_DAY), 0, MINUTES_IN_DAY);
}

export function timeOn(day: CalendarDate, minute: number): CalendarDateTime {
	return toCalendarDateTime(day).add({ minutes: minute });
}

/** Ordered inclusive all-day range between a drag anchor and target. */
export function dateRangeBetween(
	anchor: CalendarDate,
	target: CalendarDate
): { start: CalendarDate; end: CalendarDate } {
	return anchor.compare(target) <= 0 ? { start: anchor, end: target } : { start: target, end: anchor };
}

/** Ordered, snapped timed range on `day`; at least MIN_EVENT_MINUTES long. */
export function timeRangeBetween(
	day: CalendarDate,
	anchorMinute: number,
	targetMinute: number
): { start: CalendarDateTime; end: CalendarDateTime } {
	let start = clamp(snapMinute(anchorMinute), 0, MINUTES_IN_DAY);
	let end = clamp(snapMinute(targetMinute), 0, MINUTES_IN_DAY);
	if (end < start) [start, end] = [end, start];
	if (end - start < MIN_EVENT_MINUTES) end = start + MIN_EVENT_MINUTES;
	if (end > MINUTES_IN_DAY) {
		end = MINUTES_IN_DAY;
		start = MINUTES_IN_DAY - MIN_EVENT_MINUTES;
	}
	return { start: timeOn(day, start), end: timeOn(day, end) };
}

export function movedAllDay(
	start: CalendarDate,
	end: CalendarDate,
	dayDelta: number
): { start: CalendarDate; end: CalendarDate } {
	return { start: start.add({ days: dayDelta }), end: end.add({ days: dayDelta }) };
}

/** Drags one edge of an all-day event to `target`; collapses to one day rather than inverting. */
export function resizedAllDay(
	start: CalendarDate,
	end: CalendarDate,
	edge: 'start' | 'end',
	target: CalendarDate
): { start: CalendarDate; end: CalendarDate } {
	if (edge === 'start') return { start: target.compare(end) > 0 ? end : target, end };
	return { start, end: target.compare(start) < 0 ? start : target };
}

export function movedTimed(
	start: CalendarDateTime,
	end: CalendarDateTime,
	dayDelta: number,
	minuteDelta: number
): { start: CalendarDateTime; end: CalendarDateTime } {
	const snapped = snapMinute(minuteDelta);
	return {
		start: start.add({ days: dayDelta, minutes: snapped }),
		end: end.add({ days: dayDelta, minutes: snapped })
	};
}

/** Drags a timed event's end to a minute on `day`; keeps end ≥ start + MIN_EVENT_MINUTES. */
export function resizedTimed(
	start: CalendarDateTime,
	day: CalendarDate,
	minute: number
): { start: CalendarDateTime; end: CalendarDateTime } {
	const minimumEnd = start.add({ minutes: MIN_EVENT_MINUTES });
	let end = timeOn(day, clamp(snapMinute(minute), 0, MINUTES_IN_DAY));
	if (end.compare(minimumEnd) < 0) end = minimumEnd;
	return { start, end };
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit --run src/lib/components/calendar/core/drag.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/lib/components/calendar/core/drag.ts src/lib/components/calendar/core/drag.test.ts
git commit -m "feat(calendar): add drag geometry and snapping math"
```

---

### Task 8: `event-chip.svelte` — default event rendering + color variants

**Files:**
- Create: `src/lib/components/calendar/event-chip.svelte`

**Interfaces:**
- Consumes: `formatTime` (Task 3), `CalendarEvent` (Task 2), `cn` from `$lib/utils.js`, `tv` from `tailwind-variants`.
- Produces (module exports used by month/week/agenda views):
  - `chipVariants({ color, continuesLeft, continuesRight })` — horizontal chip classes (month grid + all-day lanes)
  - `blockVariants({ color })` — week-view time-grid block classes
  - `dotVariants({ color })` — agenda color dot classes
  - Default-exported `EventChip` component: props `{ event: CalendarEvent<T>; locale: string; continuesLeft?: boolean; continuesRight?: boolean; eventContent?: Snippet<[CalendarEvent<T>]>; class?: string } & HTMLButtonAttributes` — renders a `<button type="button">`; forwards rest props (`onpointerdown`, `onclick`, `aria-*`).

- [ ] **Step 1: Create the component**

Create `src/lib/components/calendar/event-chip.svelte`:

```svelte
<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	export const chipVariants = tv({
		base: 'flex h-5 w-full min-w-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-left text-xs font-medium select-none focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px]',
		variants: {
			color: {
				blue: 'bg-blue-500/15 text-blue-800 hover:bg-blue-500/25 dark:text-blue-200',
				green: 'bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25 dark:text-emerald-200',
				amber: 'bg-amber-500/20 text-amber-800 hover:bg-amber-500/30 dark:text-amber-200',
				red: 'bg-red-500/15 text-red-800 hover:bg-red-500/25 dark:text-red-200',
				violet: 'bg-violet-500/15 text-violet-800 hover:bg-violet-500/25 dark:text-violet-200',
				rose: 'bg-rose-500/15 text-rose-800 hover:bg-rose-500/25 dark:text-rose-200',
				gray: 'bg-muted-foreground/15 text-foreground hover:bg-muted-foreground/25'
			},
			continuesLeft: { true: 'rounded-l-none' },
			continuesRight: { true: 'rounded-r-none' }
		},
		defaultVariants: { color: 'gray' }
	});

	export const blockVariants = tv({
		base: 'flex h-full w-full cursor-pointer flex-col items-start overflow-hidden rounded-md border-l-2 px-1.5 py-0.5 text-left text-xs select-none focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px]',
		variants: {
			color: {
				blue: 'border-blue-600 bg-blue-500/15 text-blue-800 hover:bg-blue-500/25 dark:text-blue-200',
				green: 'border-emerald-600 bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25 dark:text-emerald-200',
				amber: 'border-amber-600 bg-amber-500/20 text-amber-800 hover:bg-amber-500/30 dark:text-amber-200',
				red: 'border-red-600 bg-red-500/15 text-red-800 hover:bg-red-500/25 dark:text-red-200',
				violet: 'border-violet-600 bg-violet-500/15 text-violet-800 hover:bg-violet-500/25 dark:text-violet-200',
				rose: 'border-rose-600 bg-rose-500/15 text-rose-800 hover:bg-rose-500/25 dark:text-rose-200',
				gray: 'border-muted-foreground bg-muted-foreground/15 text-foreground hover:bg-muted-foreground/25'
			}
		},
		defaultVariants: { color: 'gray' }
	});

	export const dotVariants = tv({
		base: 'size-2 shrink-0 rounded-full',
		variants: {
			color: {
				blue: 'bg-blue-500',
				green: 'bg-emerald-500',
				amber: 'bg-amber-500',
				red: 'bg-red-500',
				violet: 'bg-violet-500',
				rose: 'bg-rose-500',
				gray: 'bg-muted-foreground'
			}
		},
		defaultVariants: { color: 'gray' }
	});
</script>

<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { formatTime } from './core/format.js';
	import type { CalendarEvent } from './core/types.js';

	let {
		event,
		locale,
		continuesLeft = false,
		continuesRight = false,
		eventContent,
		class: className,
		...restProps
	}: {
		event: CalendarEvent<T>;
		locale: string;
		continuesLeft?: boolean;
		continuesRight?: boolean;
		eventContent?: Snippet<[CalendarEvent<T>]>;
	} & HTMLButtonAttributes = $props();
</script>

<button
	type="button"
	data-slot="calendar-event-chip"
	class={cn(chipVariants({ color: event.color, continuesLeft, continuesRight }), className)}
	{...restProps}
>
	{#if eventContent}
		{@render eventContent(event)}
	{:else}
		{#if !event.allDay}
			<span class="shrink-0 opacity-70">{formatTime(event.start, locale)}</span>
		{/if}
		<span class="truncate">{event.title}</span>
	{/if}
</button>
```

- [ ] **Step 2: Run svelte-autofixer until clean**

Run the `mcp__svelte__svelte-autofixer` MCP tool on the file contents; apply fixes and re-run until no issues.

- [ ] **Step 3: Type-check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add src/lib/components/calendar/event-chip.svelte
git commit -m "feat(calendar): add event chip with color variants"
```

---

### Task 9: `calendar-header.svelte`

**Files:**
- Create: `src/lib/components/calendar/calendar-header.svelte`

**Interfaces:**
- Consumes: `Button` from `$lib/components/ui/button`, `ToggleGroup` from `$lib/components/ui/toggle-group`, `Tooltip` from `$lib/components/ui/tooltip`, `m` messages (Task 1), `CalendarView` (Task 2), lucide icons.
- Produces: `CalendarHeader` component with props
  `{ view: CalendarView; label: string; onViewChange: (view: CalendarView) => void; onNavigate: (target: 'previous' | 'today' | 'next') => void; headerActions?: Snippet }`.

- [ ] **Step 1: Create the component**

Create `src/lib/components/calendar/calendar-header.svelte`:

```svelte
<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages.js';
	import type { CalendarView } from './core/types.js';

	let {
		view,
		label,
		onViewChange,
		onNavigate,
		headerActions
	}: {
		view: CalendarView;
		label: string;
		onViewChange: (view: CalendarView) => void;
		onNavigate: (target: 'previous' | 'today' | 'next') => void;
		headerActions?: Snippet;
	} = $props();
</script>

<div class="flex flex-wrap items-center gap-2">
	<div class="flex items-center gap-1">
		<Tooltip.Provider delayDuration={300}>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon"
							aria-label={m.calendar_previous()}
							onclick={() => onNavigate('previous')}
						>
							<ChevronLeftIcon />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>{m.calendar_previous()}</Tooltip.Content>
			</Tooltip.Root>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon"
							aria-label={m.calendar_next()}
							onclick={() => onNavigate('next')}
						>
							<ChevronRightIcon />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>{m.calendar_next()}</Tooltip.Content>
			</Tooltip.Root>
		</Tooltip.Provider>
		<Button variant="outline" size="sm" onclick={() => onNavigate('today')}>
			{m.calendar_today()}
		</Button>
	</div>
	<h2 class="min-w-0 flex-1 truncate text-lg font-semibold">{label}</h2>
	<ToggleGroup.Root
		type="single"
		variant="outline"
		value={view}
		onValueChange={(value) => {
			if (value) onViewChange(value as CalendarView);
		}}
	>
		<ToggleGroup.Item value="month">{m.calendar_view_month()}</ToggleGroup.Item>
		<ToggleGroup.Item value="week">{m.calendar_view_week()}</ToggleGroup.Item>
		<ToggleGroup.Item value="agenda">{m.calendar_view_agenda()}</ToggleGroup.Item>
	</ToggleGroup.Root>
	{#if headerActions}
		{@render headerActions()}
	{/if}
</div>
```

- [ ] **Step 2: Run svelte-autofixer until clean**

Run the `mcp__svelte__svelte-autofixer` MCP tool on the file contents; apply fixes and re-run until no issues.

- [ ] **Step 3: Type-check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add src/lib/components/calendar/calendar-header.svelte
git commit -m "feat(calendar): add calendar header"
```

---

### Task 10: `agenda-view.svelte`

**Files:**
- Create: `src/lib/components/calendar/agenda-view.svelte`

**Interfaces:**
- Consumes: `dotVariants` (Task 8), `formatDayHeading`, `formatTimeRange` (Task 3), `eventsOnDay`, `CalendarEvent` (Task 2), `Empty` components, `m` messages, `startOfMonth`, `endOfMonth`, `isToday`, `getLocalTimeZone` from `@internationalized/date`.
- Produces: `AgendaView` component with props
  `{ events: CalendarEvent<T>[]; focal: CalendarDate; locale: string; onEventClick?: (event: CalendarEvent<T>) => void; agendaItem?: Snippet<[CalendarEvent<T>]> }`.

- [ ] **Step 1: Create the component**

Create `src/lib/components/calendar/agenda-view.svelte`:

```svelte
<script lang="ts" generics="T">
	import {
		endOfMonth,
		getLocalTimeZone,
		isToday,
		startOfMonth,
		type CalendarDate
	} from '@internationalized/date';
	import type { Snippet } from 'svelte';
	import * as Empty from '$lib/components/ui/empty';
	import { m } from '$lib/paraglide/messages.js';
	import { cn } from '$lib/utils.js';
	import { dotVariants } from './event-chip.svelte';
	import { formatDayHeading, formatTimeRange } from './core/format.js';
	import { eventsOnDay, type CalendarEvent } from './core/types.js';

	let {
		events,
		focal,
		locale,
		onEventClick,
		agendaItem
	}: {
		events: CalendarEvent<T>[];
		focal: CalendarDate;
		locale: string;
		onEventClick?: (event: CalendarEvent<T>) => void;
		agendaItem?: Snippet<[CalendarEvent<T>]>;
	} = $props();

	const groups = $derived.by(() => {
		const first = startOfMonth(focal);
		const dayCount = endOfMonth(focal).day;
		return Array.from({ length: dayCount }, (_, i) => first.add({ days: i }))
			.map((day) => ({ day, events: eventsOnDay(events, day) }))
			.filter((group) => group.events.length > 0);
	});
</script>

{#if groups.length === 0}
	<Empty.Root class="rounded-lg border">
		<Empty.Header>
			<Empty.Title>{m.calendar_empty_title()}</Empty.Title>
			<Empty.Description>{m.calendar_empty_description()}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<div class="flex flex-col rounded-lg border">
		{#each groups as group (group.day.toString())}
			<section>
				<h3
					class={cn(
						'bg-background sticky top-0 z-10 border-b px-3 py-2 text-sm font-medium',
						isToday(group.day, getLocalTimeZone()) && 'text-primary'
					)}
				>
					{formatDayHeading(group.day, locale)}
				</h3>
				<ul class="flex flex-col gap-px p-1">
					{#each group.events as event (event.id)}
						<li>
							<button
								type="button"
								class="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm focus-visible:ring-[3px] focus-visible:outline-none"
								onclick={() => onEventClick?.(event)}
							>
								{#if agendaItem}
									{@render agendaItem(event)}
								{:else}
									<span class={dotVariants({ color: event.color })}></span>
									<span class="text-muted-foreground w-36 shrink-0 truncate">
										{event.allDay
											? m.calendar_all_day()
											: formatTimeRange(event.start, event.end, locale)}
									</span>
									<span class="truncate font-medium">{event.title}</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
{/if}
```

- [ ] **Step 2: Run svelte-autofixer until clean**

Run the `mcp__svelte__svelte-autofixer` MCP tool on the file contents; apply fixes and re-run until no issues.

- [ ] **Step 3: Type-check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add src/lib/components/calendar/agenda-view.svelte
git commit -m "feat(calendar): add agenda view"
```

---

### Task 11: `month-view.svelte` — rendering + drag & drop

**Files:**
- Create: `src/lib/components/calendar/month-view.svelte`

**Interfaces:**
- Consumes: `EventChip` + `chipVariants` (Task 8), `monthGrid`/`WEEKS_IN_GRID`/`DAYS_IN_WEEK` (Task 4), `packLanes`/`overflowCounts` (Task 5), drag math (Task 7), `Popover` from `$lib/components/ui/popover`, types/helpers (Task 2), `formatWeekdayName` (Task 3).
- Produces: `MonthView` component with props
  `{ events: CalendarEvent<T>[]; focal: CalendarDate; locale: string; readonly?: boolean; onDayClick?: (date: CalendarDate) => void; onEventClick?: (event: CalendarEvent<T>) => void; onRangeSelect?: (range: RangeSelection) => void; onEventChange?: (event: CalendarEvent<T>, change: EventChange) => void; eventContent?: Snippet<[CalendarEvent<T>]> }`.

Interaction model (shared by Task 12): `pointerdown` on a surface records a drag intent in local state; `svelte:window` `pointermove`/`pointerup` track and finish it. A drag that never left its anchor is a click. `suppressClick` (a plain variable, reset on every `pointerdown`) stops the browser `click` that follows a completed drag from double-firing `onEventClick`. During a move/resize drag, `previewEvents` swaps the dragged event's dates so the ordinary layout pipeline renders the ghost preview; the real `events` prop is never touched.

- [ ] **Step 1: Create the component**

Create `src/lib/components/calendar/month-view.svelte`:

```svelte
<script lang="ts" generics="T">
	import {
		getLocalTimeZone,
		isSameMonth,
		isToday,
		type CalendarDate
	} from '@internationalized/date';
	import type { Snippet } from 'svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { m } from '$lib/paraglide/messages.js';
	import { cn } from '$lib/utils.js';
	import EventChip from './event-chip.svelte';
	import {
		cellAtPoint,
		dateRangeBetween,
		movedAllDay,
		movedTimed,
		resizedAllDay
	} from './core/drag.js';
	import { formatWeekdayName } from './core/format.js';
	import { overflowCounts, packLanes } from './core/lanes.js';
	import { DAYS_IN_WEEK, WEEKS_IN_GRID, monthGrid } from './core/month-grid.js';
	import {
		daysBetween,
		eventsOnDay,
		type AllDayEvent,
		type CalendarEvent,
		type EventChange,
		type RangeSelection
	} from './core/types.js';

	let {
		events,
		focal,
		locale,
		readonly = false,
		onDayClick,
		onEventClick,
		onRangeSelect,
		onEventChange,
		eventContent
	}: {
		events: CalendarEvent<T>[];
		focal: CalendarDate;
		locale: string;
		readonly?: boolean;
		onDayClick?: (date: CalendarDate) => void;
		onEventClick?: (event: CalendarEvent<T>) => void;
		onRangeSelect?: (range: RangeSelection) => void;
		onEventChange?: (event: CalendarEvent<T>, change: EventChange) => void;
		eventContent?: Snippet<[CalendarEvent<T>]>;
	} = $props();

	const timeZone = getLocalTimeZone();
	const weeks = $derived(monthGrid(focal, locale));

	type Drag =
		| { kind: 'select'; anchor: CalendarDate; target: CalendarDate }
		| { kind: 'move'; event: CalendarEvent<T>; anchor: CalendarDate; target: CalendarDate }
		| { kind: 'resize'; event: AllDayEvent<T>; edge: 'start' | 'end'; target: CalendarDate };

	let drag = $state<Drag | null>(null);
	let dragMoved = $state(false);
	let suppressClick = false;
	let gridEl = $state<HTMLElement>();
	let rowHeights = $state<number[]>([]);

	// Day-number strip ≈ 32px, one lane = 24px, "+N more" strip ≈ 20px.
	const maxLanes = $derived(Math.max(2, Math.floor(((rowHeights[0] ?? 0) - 32 - 20) / 24)));

	function canEdit(event: CalendarEvent<T>): boolean {
		return !readonly && event.editable !== false && onEventChange !== undefined;
	}

	function draggedChange(active: Drag): EventChange | null {
		if (active.kind === 'move') {
			const delta = daysBetween(active.anchor, active.target);
			if (delta === 0) return null;
			return active.event.allDay
				? movedAllDay(active.event.start, active.event.end, delta)
				: movedTimed(active.event.start, active.event.end, delta, 0);
		}
		if (active.kind === 'resize') {
			return resizedAllDay(active.event.start, active.event.end, active.edge, active.target);
		}
		return null;
	}

	const previewEvents = $derived.by(() => {
		if (!drag || drag.kind === 'select' || !dragMoved) return events;
		const change = draggedChange(drag);
		if (!change) return events;
		const dragged = drag.event;
		return events.map((event) =>
			event.id === dragged.id ? ({ ...event, ...change } as CalendarEvent<T>) : event
		);
	});

	const selection = $derived(
		drag?.kind === 'select' && dragMoved ? dateRangeBetween(drag.anchor, drag.target) : null
	);

	const rows = $derived(
		weeks.map((week) => {
			const segments = packLanes(previewEvents, week[0], DAYS_IN_WEEK);
			return { week, segments, overflow: overflowCounts(segments, DAYS_IN_WEEK, maxLanes) };
		})
	);

	function inSelection(day: CalendarDate): boolean {
		return selection !== null && selection.start.compare(day) <= 0 && selection.end.compare(day) >= 0;
	}

	function dayAtPointer(e: PointerEvent): CalendarDate | null {
		if (!gridEl) return null;
		const rect = gridEl.getBoundingClientRect();
		const { col, row } = cellAtPoint(
			e.clientX - rect.left,
			e.clientY - rect.top,
			rect.width,
			rect.height,
			DAYS_IN_WEEK,
			WEEKS_IN_GRID
		);
		return weeks[row][col];
	}

	function startSelect(e: PointerEvent, day: CalendarDate) {
		if (e.button !== 0) return;
		suppressClick = false;
		drag = { kind: 'select', anchor: day, target: day };
		dragMoved = false;
	}

	function startMove(e: PointerEvent, event: CalendarEvent<T>) {
		if (e.button !== 0 || !canEdit(event)) return;
		suppressClick = false;
		const day = dayAtPointer(e);
		if (!day) return;
		drag = { kind: 'move', event, anchor: day, target: day };
		dragMoved = false;
	}

	function startResize(e: PointerEvent, event: CalendarEvent<T>, edge: 'start' | 'end') {
		if (e.button !== 0 || !event.allDay || !canEdit(event)) return;
		suppressClick = false;
		const day = dayAtPointer(e);
		if (!day) return;
		drag = { kind: 'resize', event, edge, target: day };
		dragMoved = false;
	}

	function trackPointer(e: PointerEvent) {
		if (!drag) return;
		const day = dayAtPointer(e);
		if (!day) return;
		if (drag.kind === 'select' && (readonly || !onRangeSelect)) return;
		const reference = drag.kind === 'resize' ? drag.target : drag.anchor;
		if (day.compare(reference) !== 0) dragMoved = true;
		drag = { ...drag, target: day };
	}

	function finishDrag() {
		const active = drag;
		drag = null;
		if (!active) return;
		if (active.kind === 'select') {
			if (dragMoved) {
				suppressClick = true;
				onRangeSelect?.({ allDay: true, ...dateRangeBetween(active.anchor, active.target) });
			} else {
				onDayClick?.(active.anchor);
			}
			return;
		}
		if (!dragMoved) return; // a plain click on a chip is handled by its onclick
		suppressClick = true;
		const change = draggedChange(active);
		if (change) onEventChange?.(active.event, change);
	}

	function chipClick(event: CalendarEvent<T>) {
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		onEventClick?.(event);
	}
</script>

<svelte:window
	onpointermove={trackPointer}
	onpointerup={finishDrag}
	onpointercancel={() => (drag = null)}
/>

<div class="overflow-x-auto rounded-lg border">
	<div class="flex h-[44rem] min-w-[640px] flex-col">
		<div class="grid grid-cols-7 border-b">
			{#each weeks[0] as day (day.toString())}
				<div class="text-muted-foreground px-2 py-1.5 text-center text-xs font-medium">
					{formatWeekdayName(day, locale)}
				</div>
			{/each}
		</div>
		<div class="grid flex-1 grid-rows-6" bind:this={gridEl}>
			{#each rows as { week, segments, overflow }, w (week[0].toString())}
				<div class="relative border-b last:border-b-0" bind:clientHeight={rowHeights[w]}>
					<div class="grid h-full grid-cols-7">
						{#each week as day, c (day.toString())}
							<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
							<div
								role="gridcell"
								tabindex="0"
								class={cn(
									'focus-visible:ring-ring/50 relative border-r p-1 last:border-r-0 focus-visible:ring-[3px] focus-visible:outline-none',
									!isSameMonth(day, focal) && 'bg-muted/30 text-muted-foreground',
									inSelection(day) && 'bg-accent'
								)}
								onpointerdown={(e) => startSelect(e, day)}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										onDayClick?.(day);
									}
								}}
							>
								<span
									class={cn(
										'inline-flex size-6 items-center justify-center rounded-full text-sm',
										isToday(day, timeZone) && 'bg-primary text-primary-foreground font-medium'
									)}
								>
									{day.day}
								</span>
								{#if overflow[c] > 0}
									<Popover.Root>
										<Popover.Trigger
											class="text-muted-foreground absolute bottom-0.5 left-1.5 text-xs hover:underline"
											onpointerdown={(e: PointerEvent) => e.stopPropagation()}
										>
											{m.calendar_more({ count: overflow[c] })}
										</Popover.Trigger>
										<Popover.Content class="w-72 p-2">
											<div class="flex flex-col gap-1">
												{#each eventsOnDay(previewEvents, day) as event (event.id)}
													<EventChip
														{event}
														{locale}
														{eventContent}
														onclick={() => onEventClick?.(event)}
													/>
												{/each}
											</div>
										</Popover.Content>
									</Popover.Root>
								{/if}
							</div>
						{/each}
					</div>
					<div class="pointer-events-none absolute inset-x-0 top-8">
						{#each segments.filter((s) => s.lane < maxLanes) as segment (segment.event.id)}
							<div
								class="pointer-events-auto absolute px-1"
								style="left: {(segment.startCol / 7) * 100}%; width: {(segment.span / 7) *
									100}%; top: {segment.lane * 24}px;"
							>
								<EventChip
									event={segment.event}
									{locale}
									continuesLeft={segment.continuesLeft}
									continuesRight={segment.continuesRight}
									{eventContent}
									class={cn(canEdit(segment.event) && 'cursor-grab')}
									onpointerdown={(e: PointerEvent) => startMove(e, segment.event)}
									onclick={() => chipClick(segment.event)}
								/>
								{#if segment.event.allDay && canEdit(segment.event)}
									{#if !segment.continuesLeft}
										<div
											aria-hidden="true"
											class="absolute inset-y-0 left-1 w-1.5 cursor-ew-resize"
											onpointerdown={(e) => startResize(e, segment.event, 'start')}
										></div>
									{/if}
									{#if !segment.continuesRight}
										<div
											aria-hidden="true"
											class="absolute inset-y-0 right-1 w-1.5 cursor-ew-resize"
											onpointerdown={(e) => startResize(e, segment.event, 'end')}
										></div>
									{/if}
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
```

- [ ] **Step 2: Run svelte-autofixer until clean**

Run the `mcp__svelte__svelte-autofixer` MCP tool on the file contents; apply fixes and re-run until no issues (see Global Constraints for the drag-surface a11y exception).

- [ ] **Step 3: Type-check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add src/lib/components/calendar/month-view.svelte
git commit -m "feat(calendar): add month view with drag interactions"
```

---

### Task 12: `week-view.svelte` — all-day lane, time grid, drag & drop

**Files:**
- Create: `src/lib/components/calendar/week-view.svelte`

**Interfaces:**
- Consumes: `EventChip` + `blockVariants` (Task 8), `weekDays`/`DAYS_IN_WEEK` (Task 4), `packLanes` (Task 5), `layoutDayColumns` (Task 6), drag math (Task 7), format helpers (Task 3), types (Task 2).
- Produces: `WeekView` component with the same props shape as `MonthView` (Task 11).

Same interaction model as Task 11. The time grid is 1152px tall (48px/hour); positions are percentages of `MINUTES_IN_DAY`. Selection in the time grid stays in its anchor day's column. `pointerdown` handlers on event blocks/chips call `e.stopPropagation()` because they sit inside the column/lane surfaces that start selection drags.

- [ ] **Step 1: Create the component**

Create `src/lib/components/calendar/week-view.svelte`:

```svelte
<script lang="ts" generics="T">
	import { getLocalTimeZone, isToday, type CalendarDate } from '@internationalized/date';
	import type { Snippet } from 'svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { cn } from '$lib/utils.js';
	import EventChip, { blockVariants } from './event-chip.svelte';
	import { layoutDayColumns } from './core/columns.js';
	import {
		cellAtPoint,
		dateRangeBetween,
		minuteAtPoint,
		movedAllDay,
		movedTimed,
		resizedAllDay,
		resizedTimed,
		timeRangeBetween
	} from './core/drag.js';
	import {
		formatHourLabel,
		formatTimeRange,
		formatWeekdayName
	} from './core/format.js';
	import { packLanes } from './core/lanes.js';
	import { DAYS_IN_WEEK, weekDays } from './core/month-grid.js';
	import {
		MINUTES_IN_DAY,
		daysBetween,
		type AllDayEvent,
		type CalendarEvent,
		type EventChange,
		type RangeSelection,
		type TimedEvent
	} from './core/types.js';

	let {
		events,
		focal,
		locale,
		readonly = false,
		onDayClick,
		onEventClick,
		onRangeSelect,
		onEventChange,
		eventContent
	}: {
		events: CalendarEvent<T>[];
		focal: CalendarDate;
		locale: string;
		readonly?: boolean;
		onDayClick?: (date: CalendarDate) => void;
		onEventClick?: (event: CalendarEvent<T>) => void;
		onRangeSelect?: (range: RangeSelection) => void;
		onEventChange?: (event: CalendarEvent<T>, change: EventChange) => void;
		eventContent?: Snippet<[CalendarEvent<T>]>;
	} = $props();

	const timeZone = getLocalTimeZone();
	const days = $derived(weekDays(focal, locale));
	const todayIndex = $derived(days.findIndex((day) => isToday(day, timeZone)));
	const hours = Array.from({ length: 24 }, (_, hour) => hour);

	type Drag =
		| { kind: 'grid-select'; dayIndex: number; anchorMinute: number; targetMinute: number }
		| {
				kind: 'grid-move';
				event: TimedEvent<T>;
				anchorDay: number;
				anchorMinute: number;
				targetDay: number;
				targetMinute: number;
		  }
		| { kind: 'grid-resize'; event: TimedEvent<T>; targetDay: number; targetMinute: number }
		| { kind: 'lane-select'; anchor: CalendarDate; target: CalendarDate }
		| { kind: 'lane-move'; event: AllDayEvent<T>; anchor: CalendarDate; target: CalendarDate }
		| { kind: 'lane-resize'; event: AllDayEvent<T>; edge: 'start' | 'end'; target: CalendarDate };

	let drag = $state<Drag | null>(null);
	let dragMoved = $state(false);
	let suppressClick = false;
	let columnsEl = $state<HTMLElement>();
	let laneEl = $state<HTMLElement>();
	let scrollEl = $state<HTMLElement>();

	let nowMinute = $state(currentMinute());

	function currentMinute(): number {
		const now = new Date();
		return now.getHours() * 60 + now.getMinutes();
	}

	$effect(() => {
		const id = setInterval(() => (nowMinute = currentMinute()), 60_000);
		return () => clearInterval(id);
	});

	// Initial scroll to 07:00.
	$effect(() => {
		if (scrollEl) scrollEl.scrollTop = (7 / 24) * scrollEl.scrollHeight;
	});

	function canEdit(event: CalendarEvent<T>): boolean {
		return !readonly && event.editable !== false && onEventChange !== undefined;
	}

	function draggedChange(active: Drag): EventChange | null {
		switch (active.kind) {
			case 'grid-move': {
				const dayDelta = active.targetDay - active.anchorDay;
				const minuteDelta = active.targetMinute - active.anchorMinute;
				if (dayDelta === 0 && minuteDelta === 0) return null;
				return movedTimed(active.event.start, active.event.end, dayDelta, minuteDelta);
			}
			case 'grid-resize':
				return resizedTimed(active.event.start, days[active.targetDay], active.targetMinute);
			case 'lane-move': {
				const delta = daysBetween(active.anchor, active.target);
				if (delta === 0) return null;
				return movedAllDay(active.event.start, active.event.end, delta);
			}
			case 'lane-resize':
				return resizedAllDay(active.event.start, active.event.end, active.edge, active.target);
			default:
				return null;
		}
	}

	const previewEvents = $derived.by(() => {
		if (!drag || !dragMoved) return events;
		if (drag.kind === 'grid-select' || drag.kind === 'lane-select') return events;
		const change = draggedChange(drag);
		if (!change) return events;
		const dragged = drag.event;
		return events.map((event) =>
			event.id === dragged.id ? ({ ...event, ...change } as CalendarEvent<T>) : event
		);
	});

	const allDayEvents = $derived(
		previewEvents.filter((event): event is AllDayEvent<T> => event.allDay)
	);
	const timedEvents = $derived(
		previewEvents.filter((event): event is TimedEvent<T> => !event.allDay)
	);
	const laneSegments = $derived(packLanes<T>(allDayEvents, days[0], DAYS_IN_WEEK));
	const laneCount = $derived(laneSegments.reduce((max, s) => Math.max(max, s.lane + 1), 1));

	const laneSelection = $derived(
		drag?.kind === 'lane-select' && dragMoved ? dateRangeBetween(drag.anchor, drag.target) : null
	);

	const gridSelection = $derived.by(() => {
		if (drag?.kind !== 'grid-select' || !dragMoved) return null;
		const range = timeRangeBetween(days[drag.dayIndex], drag.anchorMinute, drag.targetMinute);
		const startMinute = range.start.hour * 60 + range.start.minute;
		const rawEnd = range.end.hour * 60 + range.end.minute;
		return {
			dayIndex: drag.dayIndex,
			startMinute,
			endMinute: rawEnd === 0 ? MINUTES_IN_DAY : rawEnd,
			range
		};
	});

	function gridPosition(e: PointerEvent): { dayIndex: number; minute: number } | null {
		if (!columnsEl) return null;
		const rect = columnsEl.getBoundingClientRect();
		const { col } = cellAtPoint(e.clientX - rect.left, 0, rect.width, 1, DAYS_IN_WEEK, 1);
		return { dayIndex: col, minute: minuteAtPoint(e.clientY - rect.top, rect.height) };
	}

	function laneDayAtPointer(e: PointerEvent): CalendarDate | null {
		if (!laneEl) return null;
		const rect = laneEl.getBoundingClientRect();
		const { col } = cellAtPoint(e.clientX - rect.left, 0, rect.width, 1, DAYS_IN_WEEK, 1);
		return days[col];
	}

	function startGridSelect(e: PointerEvent, dayIndex: number) {
		if (e.button !== 0 || readonly || !onRangeSelect) return;
		suppressClick = false;
		const position = gridPosition(e);
		if (!position) return;
		drag = {
			kind: 'grid-select',
			dayIndex,
			anchorMinute: position.minute,
			targetMinute: position.minute
		};
		dragMoved = false;
	}

	function startGridMove(e: PointerEvent, event: TimedEvent<T>) {
		if (e.button !== 0 || !canEdit(event)) return;
		e.stopPropagation();
		suppressClick = false;
		const position = gridPosition(e);
		if (!position) return;
		drag = {
			kind: 'grid-move',
			event,
			anchorDay: position.dayIndex,
			anchorMinute: position.minute,
			targetDay: position.dayIndex,
			targetMinute: position.minute
		};
		dragMoved = false;
	}

	function startGridResize(e: PointerEvent, event: TimedEvent<T>) {
		if (e.button !== 0 || !canEdit(event)) return;
		e.stopPropagation();
		suppressClick = false;
		const position = gridPosition(e);
		if (!position) return;
		drag = { kind: 'grid-resize', event, targetDay: position.dayIndex, targetMinute: position.minute };
		dragMoved = false;
	}

	function startLaneSelect(e: PointerEvent) {
		if (e.button !== 0) return;
		suppressClick = false;
		const day = laneDayAtPointer(e);
		if (!day) return;
		drag = { kind: 'lane-select', anchor: day, target: day };
		dragMoved = false;
	}

	function startLaneMove(e: PointerEvent, event: CalendarEvent<T>) {
		if (e.button !== 0 || !event.allDay || !canEdit(event)) return;
		e.stopPropagation();
		suppressClick = false;
		const day = laneDayAtPointer(e);
		if (!day) return;
		drag = { kind: 'lane-move', event, anchor: day, target: day };
		dragMoved = false;
	}

	function startLaneResize(e: PointerEvent, event: CalendarEvent<T>, edge: 'start' | 'end') {
		if (e.button !== 0 || !event.allDay || !canEdit(event)) return;
		e.stopPropagation();
		suppressClick = false;
		const day = laneDayAtPointer(e);
		if (!day) return;
		drag = { kind: 'lane-resize', event, edge, target: day };
		dragMoved = false;
	}

	function trackPointer(e: PointerEvent) {
		if (!drag) return;
		switch (drag.kind) {
			case 'grid-select': {
				const position = gridPosition(e);
				if (!position) return;
				if (position.minute !== drag.anchorMinute) dragMoved = true;
				drag = { ...drag, targetMinute: position.minute };
				return;
			}
			case 'grid-move': {
				const position = gridPosition(e);
				if (!position) return;
				if (position.dayIndex !== drag.anchorDay || position.minute !== drag.anchorMinute) {
					dragMoved = true;
				}
				drag = { ...drag, targetDay: position.dayIndex, targetMinute: position.minute };
				return;
			}
			case 'grid-resize': {
				const position = gridPosition(e);
				if (!position) return;
				if (position.dayIndex !== drag.targetDay || position.minute !== drag.targetMinute) {
					dragMoved = true;
				}
				drag = { ...drag, targetDay: position.dayIndex, targetMinute: position.minute };
				return;
			}
			case 'lane-select':
			case 'lane-move':
			case 'lane-resize': {
				if (drag.kind === 'lane-select' && (readonly || !onRangeSelect)) return;
				const day = laneDayAtPointer(e);
				if (!day) return;
				const reference = drag.kind === 'lane-resize' ? drag.target : drag.anchor;
				if (day.compare(reference) !== 0) dragMoved = true;
				drag = { ...drag, target: day };
				return;
			}
		}
	}

	function finishDrag() {
		const active = drag;
		drag = null;
		if (!active) return;
		switch (active.kind) {
			case 'grid-select':
				if (dragMoved) {
					suppressClick = true;
					onRangeSelect?.({
						allDay: false,
						...timeRangeBetween(days[active.dayIndex], active.anchorMinute, active.targetMinute)
					});
				}
				return;
			case 'lane-select':
				if (dragMoved) {
					suppressClick = true;
					onRangeSelect?.({ allDay: true, ...dateRangeBetween(active.anchor, active.target) });
				} else {
					onDayClick?.(active.anchor);
				}
				return;
			default: {
				if (!dragMoved) return;
				suppressClick = true;
				const change = draggedChange(active);
				if (change) onEventChange?.(active.event, change);
			}
		}
	}

	function eventClick(event: CalendarEvent<T>) {
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		onEventClick?.(event);
	}
</script>

<svelte:window
	onpointermove={trackPointer}
	onpointerup={finishDrag}
	onpointercancel={() => (drag = null)}
/>

<div class="overflow-x-auto rounded-lg border">
	<div class="flex h-[40rem] min-w-[640px] flex-col">
		<div class="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b">
			<div></div>
			{#each days as day, i (day.toString())}
				<div class="flex items-baseline gap-1 border-l px-2 py-1.5 text-sm">
					<span class="text-muted-foreground text-xs">{formatWeekdayName(day, locale)}</span>
					<span class={cn('font-medium', i === todayIndex && 'text-primary')}>{day.day}</span>
				</div>
			{/each}
		</div>
		<div class="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b">
			<div class="text-muted-foreground px-2 py-1 text-[10px]">{m.calendar_all_day()}</div>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="relative col-span-7"
				style="height: {laneCount * 24 + 8}px"
				bind:this={laneEl}
				onpointerdown={startLaneSelect}
			>
				<div class="absolute inset-0 grid grid-cols-7">
					{#each days as day (day.toString())}
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<div
							role="gridcell"
							tabindex="0"
							class={cn(
								'focus-visible:ring-ring/50 border-l focus-visible:ring-[3px] focus-visible:outline-none',
								laneSelection &&
									laneSelection.start.compare(day) <= 0 &&
									laneSelection.end.compare(day) >= 0 &&
									'bg-accent'
							)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									onDayClick?.(day);
								}
							}}
						></div>
					{/each}
				</div>
				{#each laneSegments as segment (segment.event.id)}
					<div
						class="absolute px-1"
						style="left: {(segment.startCol / 7) * 100}%; width: {(segment.span / 7) *
							100}%; top: {segment.lane * 24 + 4}px;"
					>
						<EventChip
							event={segment.event}
							{locale}
							continuesLeft={segment.continuesLeft}
							continuesRight={segment.continuesRight}
							{eventContent}
							class={cn(canEdit(segment.event) && 'cursor-grab')}
							onpointerdown={(e: PointerEvent) => startLaneMove(e, segment.event)}
							onclick={() => eventClick(segment.event)}
						/>
						{#if canEdit(segment.event)}
							{#if !segment.continuesLeft}
								<div
									aria-hidden="true"
									class="absolute inset-y-0 left-1 w-1.5 cursor-ew-resize"
									onpointerdown={(e) => startLaneResize(e, segment.event, 'start')}
								></div>
							{/if}
							{#if !segment.continuesRight}
								<div
									aria-hidden="true"
									class="absolute inset-y-0 right-1 w-1.5 cursor-ew-resize"
									onpointerdown={(e) => startLaneResize(e, segment.event, 'end')}
								></div>
							{/if}
						{/if}
					</div>
				{/each}
			</div>
		</div>
		<div class="flex-1 overflow-y-auto" bind:this={scrollEl}>
			<div class="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]" style="height: 1152px">
				<div class="relative">
					{#each hours as hour (hour)}
						{#if hour > 0}
							<span
								class="text-muted-foreground absolute right-2 -translate-y-1/2 text-[10px]"
								style="top: {(hour / 24) * 100}%"
							>
								{formatHourLabel(hour, locale)}
							</span>
						{/if}
					{/each}
				</div>
				<div class="relative col-span-7" bind:this={columnsEl}>
					{#each hours as hour (hour)}
						{#if hour > 0}
							<div class="absolute inset-x-0 border-t" style="top: {(hour / 24) * 100}%"></div>
						{/if}
					{/each}
					<div class="absolute inset-0 grid grid-cols-7">
						{#each days as day, dayIndex (day.toString())}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class={cn('relative border-l', dayIndex === todayIndex && 'bg-primary/5')}
								onpointerdown={(e) => startGridSelect(e, dayIndex)}
							>
								{#each layoutDayColumns(timedEvents, day) as placement (`${placement.event.id}:${dayIndex}`)}
									<div
										class="absolute p-px"
										style="top: {(placement.startMinute / MINUTES_IN_DAY) *
											100}%; height: {((placement.endMinute - placement.startMinute) /
											MINUTES_IN_DAY) *
											100}%; left: {(placement.col / placement.colCount) *
											100}%; width: {(1 / placement.colCount) * 100}%;"
									>
										<button
											type="button"
											class={cn(
												blockVariants({ color: placement.event.color }),
												canEdit(placement.event) && 'cursor-grab'
											)}
											onpointerdown={(e) => startGridMove(e, placement.event)}
											onclick={() => eventClick(placement.event)}
										>
											{#if eventContent}
												{@render eventContent(placement.event)}
											{:else}
												<span class="w-full truncate font-medium">{placement.event.title}</span>
												{#if placement.endMinute - placement.startMinute >= 30}
													<span class="w-full truncate opacity-70">
														{formatTimeRange(placement.event.start, placement.event.end, locale)}
													</span>
												{/if}
											{/if}
										</button>
										{#if canEdit(placement.event)}
											<div
												aria-hidden="true"
												class="absolute inset-x-1 bottom-0 h-1.5 cursor-ns-resize"
												onpointerdown={(e) => startGridResize(e, placement.event)}
											></div>
										{/if}
									</div>
								{/each}
								{#if gridSelection && gridSelection.dayIndex === dayIndex}
									<div
										class="border-primary bg-primary/10 text-primary pointer-events-none absolute inset-x-0.5 z-10 rounded-md border px-1.5 py-0.5 text-xs"
										style="top: {(gridSelection.startMinute / MINUTES_IN_DAY) *
											100}%; height: {((gridSelection.endMinute - gridSelection.startMinute) /
											MINUTES_IN_DAY) *
											100}%;"
									>
										{formatTimeRange(gridSelection.range.start, gridSelection.range.end, locale)}
									</div>
								{/if}
								{#if dayIndex === todayIndex}
									<div
										class="bg-destructive pointer-events-none absolute inset-x-0 z-20 h-0.5"
										style="top: {(nowMinute / MINUTES_IN_DAY) * 100}%"
									></div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
```

- [ ] **Step 2: Run svelte-autofixer until clean**

Run the `mcp__svelte__svelte-autofixer` MCP tool on the file contents; apply fixes and re-run until no issues (see Global Constraints for the drag-surface a11y exception).

- [ ] **Step 3: Type-check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add src/lib/components/calendar/week-view.svelte
git commit -m "feat(calendar): add week view with drag interactions"
```

---

### Task 13: `calendar.svelte` root + `index.ts` public exports

**Files:**
- Create: `src/lib/components/calendar/calendar.svelte`
- Create: `src/lib/components/calendar/index.ts`

**Interfaces:**
- Consumes: `CalendarHeader` (Task 9), `MonthView` (Task 11), `WeekView` (Task 12), `AgendaView` (Task 10), `validEvents` (Task 2), `formatMonthLabel`/`formatWeekLabel` (Task 3), `weekDays` (Task 4), `getLocale` from `$lib/paraglide/runtime`.
- Produces (the public API):
  - `Calendar` component: props `{ events?: CalendarEvent<T>[]; view?: CalendarView (bindable, default 'month'); date?: CalendarDate (bindable, default today); locale?: string (default active Paraglide locale); readonly?: boolean; onEventClick?; onDayClick?; onRangeSelect?; onEventChange?; eventContent?; agendaItem?; headerActions? }`
  - `index.ts` exports: `Calendar`, `EVENT_COLORS`, and types `AllDayEvent`, `CalendarEvent`, `CalendarView`, `EventChange`, `EventColor`, `RangeSelection`, `TimedEvent`

- [ ] **Step 1: Create the root component**

Create `src/lib/components/calendar/calendar.svelte`:

```svelte
<script lang="ts" generics="T">
	import { getLocalTimeZone, today, type CalendarDate } from '@internationalized/date';
	import type { Snippet } from 'svelte';
	import { getLocale } from '$lib/paraglide/runtime';
	import AgendaView from './agenda-view.svelte';
	import CalendarHeader from './calendar-header.svelte';
	import MonthView from './month-view.svelte';
	import WeekView from './week-view.svelte';
	import { formatMonthLabel, formatWeekLabel } from './core/format.js';
	import { weekDays } from './core/month-grid.js';
	import {
		validEvents,
		type CalendarEvent,
		type CalendarView,
		type EventChange,
		type RangeSelection
	} from './core/types.js';

	let {
		events = [],
		view = $bindable('month'),
		date = $bindable(today(getLocalTimeZone())),
		locale = getLocale(),
		readonly = false,
		onEventClick,
		onDayClick,
		onRangeSelect,
		onEventChange,
		eventContent,
		agendaItem,
		headerActions
	}: {
		events?: CalendarEvent<T>[];
		view?: CalendarView;
		date?: CalendarDate;
		locale?: string;
		readonly?: boolean;
		onEventClick?: (event: CalendarEvent<T>) => void;
		onDayClick?: (date: CalendarDate) => void;
		onRangeSelect?: (range: RangeSelection) => void;
		onEventChange?: (event: CalendarEvent<T>, change: EventChange) => void;
		eventContent?: Snippet<[CalendarEvent<T>]>;
		agendaItem?: Snippet<[CalendarEvent<T>]>;
		headerActions?: Snippet;
	} = $props();

	const safeEvents = $derived(validEvents(events));

	const label = $derived.by(() => {
		if (view === 'week') {
			const days = weekDays(date, locale);
			return formatWeekLabel(days[0], days[6], locale);
		}
		return formatMonthLabel(date, locale);
	});

	function navigate(target: 'previous' | 'today' | 'next') {
		if (target === 'today') {
			date = today(getLocalTimeZone());
			return;
		}
		const delta = target === 'next' ? 1 : -1;
		date = view === 'week' ? date.add({ weeks: delta }) : date.add({ months: delta });
	}
</script>

<div class="flex flex-col gap-4" data-slot="calendar">
	<CalendarHeader {view} {label} onViewChange={(next) => (view = next)} onNavigate={navigate} {headerActions} />
	{#if view === 'month'}
		<MonthView
			events={safeEvents}
			focal={date}
			{locale}
			{readonly}
			{onDayClick}
			{onEventClick}
			{onRangeSelect}
			{onEventChange}
			{eventContent}
		/>
	{:else if view === 'week'}
		<WeekView
			events={safeEvents}
			focal={date}
			{locale}
			{readonly}
			{onDayClick}
			{onEventClick}
			{onRangeSelect}
			{onEventChange}
			{eventContent}
		/>
	{:else}
		<AgendaView events={safeEvents} focal={date} {locale} {onEventClick} {agendaItem} />
	{/if}
</div>
```

- [ ] **Step 2: Create the public exports**

Create `src/lib/components/calendar/index.ts`:

```ts
export { default as Calendar } from './calendar.svelte';
export { EVENT_COLORS } from './core/types.js';
export type {
	AllDayEvent,
	CalendarEvent,
	CalendarView,
	EventChange,
	EventColor,
	RangeSelection,
	TimedEvent
} from './core/types.js';
```

- [ ] **Step 3: Run svelte-autofixer until clean**

Run the `mcp__svelte__svelte-autofixer` MCP tool on `calendar.svelte`; apply fixes and re-run until no issues.

- [ ] **Step 4: Type-check and run the full test suite**

Run: `pnpm check && pnpm test`
Expected: 0 errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add src/lib/components/calendar/calendar.svelte src/lib/components/calendar/index.ts
git commit -m "feat(calendar): add calendar root component and public exports"
```

---

### Task 14: Demo page `/app/calendar` + nav link

**Files:**
- Create: `src/routes/app/calendar/+page.ts`
- Create: `src/routes/app/calendar/+page.svelte`
- Modify: `src/routes/app/+layout.svelte` (add nav link inside `NavigationMenu.List`, after the Home item)

**Interfaces:**
- Consumes: `Calendar`, `CalendarEvent`, `CalendarView` from `$lib/components/calendar` (Task 13), `m.nav_calendar()` (Task 1), `toast` from `svelte-sonner` (Toaster already mounted in the root layout).
- Produces: a linkable demo page; `view`/`date` round-trip through query params.

- [ ] **Step 1: Create the load function**

Create `src/routes/app/calendar/+page.ts`:

```ts
import { getLocalTimeZone, parseDate, today, type CalendarDate } from '@internationalized/date';
import type { CalendarView } from '$lib/components/calendar';
import type { PageLoad } from './$types';

const VIEWS: readonly CalendarView[] = ['month', 'week', 'agenda'];

export const load: PageLoad = ({ url }) => {
	const viewParam = url.searchParams.get('view') as CalendarView | null;
	const view: CalendarView = viewParam && VIEWS.includes(viewParam) ? viewParam : 'month';
	let date: CalendarDate;
	try {
		date = parseDate(url.searchParams.get('date') ?? '');
	} catch {
		date = today(getLocalTimeZone());
	}
	return { view, date };
};
```

- [ ] **Step 2: Create the page**

Create `src/routes/app/calendar/+page.svelte`. Sample data covers every rendering path: every color, a multi-week span, an overflow day (day 4 carries 5 events), overlapping timed events (day 9), a sub-30-minute event, a midnight-crossing event, and two non-editable events. Titles/toasts are intentionally plain-English sample data.

```svelte
<script lang="ts">
	import { getLocalTimeZone, startOfMonth, toCalendarDateTime, today } from '@internationalized/date';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { Calendar, type CalendarEvent } from '$lib/components/calendar';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();
	let view = $state(data.view);
	let date = $state(data.date);

	const base = startOfMonth(today(getLocalTimeZone()));
	const day = (n: number) => base.add({ days: n - 1 });
	const at = (n: number, hour: number, minute = 0) =>
		toCalendarDateTime(day(n)).add({ hours: hour, minutes: minute });

	let events = $state<CalendarEvent[]>([
		{ id: 'leave-1', title: 'Annual leave — Viktors', allDay: true, color: 'blue', start: day(2), end: day(6) },
		{ id: 'leave-2', title: 'Annual leave — Marta', allDay: true, color: 'violet', start: day(4), end: day(11) },
		{ id: 'sick-1', title: 'Sick — Tom', allDay: true, color: 'red', start: day(4), end: day(4) },
		{ id: 'offsite', title: 'Company offsite', allDay: true, color: 'amber', start: day(16), end: day(18) },
		{ id: 'holiday', title: 'Public holiday', allDay: true, color: 'green', editable: false, start: day(14), end: day(14) },
		{ id: 'busy-1', title: 'Busy', allDay: true, color: 'gray', editable: false, start: day(20), end: day(21) },
		{ id: 'apt-1', title: 'Dentist', allDay: false, color: 'rose', start: at(4, 9), end: at(4, 10) },
		{ id: 'apt-2', title: 'School run', allDay: false, color: 'gray', start: at(4, 15), end: at(4, 15, 30) },
		{ id: 'meet-1', title: 'Team sync', allDay: false, color: 'blue', start: at(9, 10), end: at(9, 11) },
		{ id: 'meet-2', title: '1:1', allDay: false, color: 'green', start: at(9, 10, 30), end: at(9, 11, 30) },
		{ id: 'meet-3', title: 'Interview', allDay: false, color: 'violet', start: at(9, 10, 45), end: at(9, 12) },
		{ id: 'focus', title: 'Focus block', allDay: false, color: 'amber', start: at(10, 13), end: at(10, 17) },
		{ id: 'standup', title: 'Standup', allDay: false, color: 'blue', start: at(10, 9, 15), end: at(10, 9, 30) },
		{ id: 'half-day', title: 'Half day — Ana', allDay: false, color: 'rose', start: at(24, 13), end: at(24, 17, 30) },
		{ id: 'on-call', title: 'On-call', allDay: false, color: 'red', start: at(26, 22), end: at(27, 6) }
	]);

	$effect(() => {
		const params = new URLSearchParams({ view, date: date.toString() });
		goto(`?${params}`, { replaceState: true, keepFocus: true, noScroll: true });
	});
</script>

<svelte:head><title>{m.nav_calendar()} · {m.app_name()}</title></svelte:head>

<Calendar
	{events}
	bind:view
	bind:date
	onDayClick={(clicked) => toast.info(`Day clicked: ${clicked.toString()}`)}
	onEventClick={(event) => toast.info(`Event: ${event.title}`)}
	onRangeSelect={(range) =>
		toast.success(`Selected ${range.start.toString()} → ${range.end.toString()}`)}
	onEventChange={(event, change) => {
		events = events.map((existing) =>
			existing.id === event.id ? ({ ...existing, ...change } as CalendarEvent) : existing
		);
		toast.success(`Updated "${event.title}"`);
	}}
/>
```

- [ ] **Step 3: Add the nav link**

In `src/routes/app/+layout.svelte`, inside `<NavigationMenu.List>`, after the existing Home item, add:

```svelte
<NavigationMenu.Item>
	<NavigationMenu.Link href={resolve('/app/calendar' as Pathname)}>
		{m.nav_calendar()}
	</NavigationMenu.Link>
</NavigationMenu.Item>
```

- [ ] **Step 4: Run svelte-autofixer until clean**

Run the `mcp__svelte__svelte-autofixer` MCP tool on `+page.svelte` and the modified `+layout.svelte`; apply fixes and re-run until no issues.

- [ ] **Step 5: Type-check and lint**

Run: `pnpm check && pnpm lint`
Expected: 0 errors.

- [ ] **Step 6: Verify in the browser**

Start the dev server (preview tooling or `pnpm dev`) and confirm at `/app/calendar` (signed in):

1. Month view: chips render with colors; `leave-2` spans two week rows with continuation edges; day 4 shows "+N more" and its popover lists 5 events; today has a filled day number.
2. Week view (`?view=week&date=` a date in the sample month, e.g. day 9's week): all-day lane packs chips; `meet-1/2/3` render side-by-side; `standup` renders small; the grid is initially scrolled to ~07:00; today's column shows the red now-line.
3. Agenda view: events grouped by day; switching to an empty month shows the empty state.
4. Interactions (toasts confirm each): drag across month cells → range toast; drag a chip → "Updated" toast and the chip moves; resize a chip edge; in week view drag empty grid → timed range toast; drag and resize a block; `Public holiday` and `Busy` refuse to drag.
5. `view`/`date` appear in the URL; reloading the URL restores the state; prev/today/next update `date`.
6. Toggle dark mode: chips/blocks remain legible.

Expected: all of the above behave as described; no console errors.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add src/routes/app/calendar/ src/routes/app/+layout.svelte
git commit -m "feat(calendar): add demo page and nav link"
```

---

### Task 15: Final verification sweep

**Files:** none created — verification only.

- [ ] **Step 1: Full quality gates**

Run: `pnpm check && pnpm lint && pnpm test`
Expected: all pass with 0 errors.

- [ ] **Step 2: Visual sweep**

With the dev server running, re-verify the Task 14 Step 6 checklist in **light and dark mode**, plus:
- Switch app language (avatar menu) to pl and fr: header labels, weekday/month names, and week start change accordingly (en: Sunday start; pl/fr: Monday start).
- Narrow viewport (~375px): month/week views scroll horizontally; agenda remains usable.

- [ ] **Step 3: Fix anything found, then re-run Step 1**

Any defect found: fix, re-run gates, and amend/commit with a `fix(calendar):` message.

Expected: clean final state on `main`-ready branch history.
