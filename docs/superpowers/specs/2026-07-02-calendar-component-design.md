# Calendar Component — Design

**Date:** 2026-07-02
**Status:** Approved

## Purpose

A generic, extensible, event-agnostic calendar component (`$lib/components/calendar`) with Month, Week, and Agenda views, styled to the existing shadcn-svelte **luma** conventions. It will later power the out-of-office feature (own + colleagues' annual leave and other absences), but this effort delivers only the reusable component plus a demo page — no database or server work.

Relationship to prior work: the full OOO app design (2026-07-01, since removed) remains directional background. This spec deliberately narrows to the calendar UI layer; domain concerns (entry types, sharing, visibility, notifications, timezone storage) arrive later as consumers of this component.

## Scope

**In scope**

- `$lib/components/calendar/` component library: Month, Week, Agenda views + shared header.
- Full drag & drop: drag-select to create ranges, drag to move events, drag edges to resize.
- Color-variant event rendering with optional snippet overrides.
- Demo page at `/app/calendar` fed by in-memory sample events, with a nav link.
- Vitest unit tests for all pure logic modules.

**Out of scope**

- Database schema, server modules, entry CRUD, sharing/visibility, notifications.
- Team timeline view (later, alongside teams).
- Component/E2E tests (per existing project convention).
- Touch-optimized drag gestures (pointer events work, but mobile relies on click/callback flows and the Agenda view).

## Event model

A discriminated union on `allDay`, generic over consumer data:

```ts
type CalendarEventBase<T> = {
	id: string;
	title: string;
	color?: EventColor; // default 'gray'
	editable?: boolean; // default true; gates drag/resize per event
	data?: T; // round-trips through every callback and snippet
};

type CalendarEvent<T = unknown> =
	| (CalendarEventBase<T> & { allDay: true; start: CalendarDate; end: CalendarDate })
	| (CalendarEventBase<T> & { allDay: false; start: CalendarDateTime; end: CalendarDateTime });
```

- Dates use `@internationalized/date` (already a dependency; same library as bits-ui).
- **All-day events**: `CalendarDate` pair, **end-inclusive** (a one-day event has `start.compare(end) === 0`). Never timezone-converted.
- **Timed events**: `CalendarDateTime` pair (floating local time), end-exclusive as usual for instants. **The component performs no timezone conversion** — consumers convert stored UTC instants to the viewer's zone before passing events in. This keeps the component pure and pushes policy to the caller, matching the prior spec's "display in viewer's timezone" rule.
- `EventColor = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'rose' | 'gray'` — a fixed semantic palette implemented as Tailwind class variants tuned for light and dark mode. Domain meaning (vacation = blue, sick = red, …) is assigned by consumers.
- Invalid events (end before start) are skipped in rendering with a dev-mode console warning; the component never throws on bad data.

## Component API

```svelte
<Calendar
	{events}
	bind:view={view}
	bind:date={date}
	locale={getLocale()}
	readonly={false}
	onEventClick={(event) => …}
	onDayClick={(date) => …}
	onRangeSelect={(range) => …}
	onEventChange={(event, change) => …}
	eventContent={eventSnippet}
	agendaItem={agendaSnippet}
	headerActions={actionsSnippet}
/>
```

- `events: CalendarEvent<T>[]` — display data. **Fully controlled**: the component never mutates it.
- `view: 'month' | 'week' | 'agenda'` — bindable; default `'month'`.
- `date: CalendarDate` — bindable focal date; default today. Prev/today/next and view logic derive everything from it.
- `locale: string` — defaults to the active Paraglide locale; drives `Intl.DateTimeFormat` names and week start.
- `readonly: boolean` — disables all drag interactions globally (per-event `editable: false` does the same per event).
- `onEventClick(event)` — chip/row activated (click or Enter).
- `onDayClick(date)` — a day cell (month) or all-day lane slot (week) activated.
- `onRangeSelect({ start, end, allDay })` — drag-created selection: all-day date range in month view / all-day lane, 15-minute-snapped `CalendarDateTime` range in the week time grid. This is the "create event" gesture; the consumer opens its dialog.
- `onEventChange(event, { start, end })` — proposed move or resize from drag. The component shows a live ghost preview during the drag, emits once on drop, and reverts the visual to the `events` prop; the consumer commits by updating `events` (and later persisting). No async/rollback machinery inside the component.
- Snippets (all optional, defaults provided): `eventContent(event)` replaces chip contents in month/week; `agendaItem(event)` replaces an agenda row; `headerActions()` renders trailing header content (e.g. an "Add leave" button later).

## Views

**Shared header** — localized period label ("July 2026"; "30 Jun – 6 Jul 2026"; agenda uses the month label), prev/today/next `Button`s (icon + tooltip), view switcher as a `ToggleGroup`, then `headerActions`.

**Month view** — always 6 rows of 7 (stable height across months), week starts per locale, weekday header row, muted outside-month day numbers, `today` highlighted with a primary ring. All-day/multi-day events render as horizontal chips spanning cells, packed into lanes (first-fit, longest-first ordering for stable layout); rows are laid out per week-row, chips clipped at row edges with continuation indicators. Timed events render as compact single-cell chips with start time. Each cell shows up to N lanes (N from a row-height measurement, minimum 2) then a "+N more" trigger opening a `Popover` listing that day's events. Interactions: click empty cell area → `onDayClick`; horizontal drag across cells → all-day `onRangeSelect` with live highlight; drag chip → move whole event by day delta; drag chip left/right edge handles → resize (all-day events only; timed events move but don't resize here); click/Enter chip → `onEventClick`.

**Week view** — top all-day lane (same lane-packing module as month view) with its own drag-select/move/resize by days; below, a 24-hour time grid: hour gutter labels (locale-formatted), horizontal hour lines, subtle vertical day separators, `today` column tinted, live current-time indicator line (viewer clock, minute-refreshed). Timed events are absolutely positioned blocks; overlaps resolve via interval-graph column layout (overlapping events share width side-by-side, non-overlapping reclaim full width). Interactions: vertical drag on empty grid → timed `onRangeSelect` snapped to 15 minutes (a plain click without dragging does nothing in the time grid — selection requires a drag); drag event body → move across time and days (15-minute snap); drag bottom edge → resize duration (minimum 15 minutes); ghost preview shows the proposed times while dragging. Events shorter than ~30 minutes render title-only at reduced size. The grid scrolls vertically inside a fixed-height container, initially scrolled to ~07:00.

**Agenda view** — chronological list of the focal month's events, grouped by day with sticky day headers; each row: color dot, title, time range or "all day" badge, consumer content via `agendaItem`. Days without events are omitted. Empty month renders the shadcn `empty` component with a localized message. No drag interactions; rows are focusable and clickable.

**Accessibility & responsive** — chips, rows, and day cells are keyboard-focusable; Enter/Space triggers the click callbacks. Drag & drop is pointer-only progressive enhancement — every mutation it enables is also reachable through click callbacks wired by the consumer. Month/week views get a min-width with horizontal scroll on narrow screens; Agenda is the mobile-friendly view.

## Architecture

Strict layering: pure TypeScript logic modules (no Svelte imports, fully unit-tested) under `core/`, thin Svelte 5 components on top using shadcn primitives (`Button`, `ToggleGroup`, `Popover`, `Tooltip`, `Badge`, `Empty`).

```
src/lib/components/calendar/
	index.ts                # public exports: Calendar + types
	calendar.svelte         # root: props, header, active-view dispatch, shared context
	calendar-header.svelte
	month-view.svelte
	week-view.svelte
	agenda-view.svelte
	event-chip.svelte       # default event rendering, color variants (tailwind-variants)
	core/
		types.ts              # CalendarEvent, EventColor, callback + snippet types
		month-grid.ts         # focal date → 6×7 CalendarDate grid, per-locale week start
		lanes.ts              # events → packed lanes for a day-range row (month + all-day lane)
		columns.ts            # timed events of one day → overlap columns {col, colCount}
		drag.ts               # pointer geometry: cell hit-testing, 15-min snapping, move/resize deltas
		format.ts             # Intl helpers: period labels, weekday/month names, time formatting, week-start lookup
		*.test.ts             # colocated vitest tests per module
```

- Views receive precomputed layout structures from `core/` functions via `$derived` — components stay declarative renderers plus pointer wiring.
- Drag state lives in the root component (one active drag at a time, shared ghost-preview state); `core/drag.ts` owns the math so it's testable without a DOM.
- Week start comes from `Intl.Locale(locale).getWeekInfo?.()` where available; otherwise a static fallback maps the app's locales (en, pl, fr → Monday), defaulting to Monday for unknown locales.

## i18n

- Internal UI strings — "Today", view names, "all day", "+{count} more", agenda empty state — are Paraglide messages added to `messages/en.json`, `pl.json`, `fr.json` with a `calendar_` prefix, following existing flat-key conventions.
- All date/time rendering goes through `core/format.ts` using `Intl.DateTimeFormat` with the component's `locale` prop — no hand-rolled month/day names.

## Demo page

`/app/calendar` (+page.svelte, +page.ts):

- ~15 in-memory sample events exercising every rendering path: multi-week span, overlapping timed events, >4 events on one day (overflow), every color, an `editable: false` event, short (<30 min) events.
- Sample events are generated relative to the current month so the page always demonstrates a populated view.
- `view` and `date` mirrored to query params (`?view=week&date=2026-07-02`) — linkable and SSR-rendered, the navigation pattern the prior spec approved.
- Callbacks wired to sonner toasts (`onRangeSelect` → "Selected 3–5 Jul", `onEventChange` applies the change to the local array and toasts) so every interaction is verifiable by hand.
- Nav link "Calendar" added to the app header next to "Home" (new `nav_calendar` message).

## Error handling

- Malformed events (end before start) are dropped from layout with a `console.warn` in dev; rendering never throws.
- Drag interactions clamp to valid ranges (resize can't invert an event; minimum 15-minute duration for timed events).
- The component treats `events` as untrusted display data — no assumptions about sort order or uniqueness beyond `id` as the render key.

## Testing

- Vitest unit tests colocated in `core/`: month-grid generation (week starts, month boundaries, leap years), lane packing (spans, ordering stability, overflow counts), overlap columns (transitive overlap groups), drag math (snapping, clamping, day-delta moves), format helpers (period labels per locale).
- `svelte-autofixer` MCP run on every `.svelte` file until clean (CLAUDE.md requirement).
- `pnpm check`, `pnpm lint`, `pnpm test` green.
- Manual visual verification on the demo page via browser preview: all three views, light + dark mode, drag-select/move/resize, overflow popover, locale switch.

## Future (explicitly deferred)

- OOO domain layer: entry types mapped to colors, busy-only rendering, other users' calendars (`editable: false` + custom snippets), team timeline view.
- Query-param ↔ calendar state helper if more pages need it.
- Touch-first drag gestures and week-view resize of all-day events.
