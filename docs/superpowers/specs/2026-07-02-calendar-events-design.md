# Calendar Events — Design

Full CRUD for personal out-of-office events on a new `/app/calendar` page, built on the
existing generic calendar component (`src/lib/components/calendar`, API in
`docs/calendar.md`). Events are private per-user and persisted in Postgres.

## Decisions (from brainstorming)

- **Persistence**: full DB persistence (drizzle + Postgres), per-user.
- **Visibility**: private — each user sees and manages only their own events.
- **Scope**: full CRUD — create (Add button, day click, drag range-select), edit/delete
  (event click), and drag move/resize persistence.
- **Event types**: `vacation`, `sick_leave`, `business_trip`, `public_holiday`,
  `remote_work`, `other`.
- **Form shape**: title auto-derives from the type's localized label; a free-text title is
  required only for `other` (optional note for the rest). All-day toggle switches between
  a date range and a date+time range. Color is fixed per type, never user-picked.
- **Transport**: SvelteKit form actions + sveltekit-superforms (zod4 adapter), matching
  the settings/auth pages. No JSON endpoints.

## Data model

New pg enum and table in `src/lib/server/db/schema.ts`:

```ts
export const eventTypes = [
	'vacation',
	'sick_leave',
	'business_trip',
	'public_holiday',
	'remote_work',
	'other'
] as const;
export const eventTypeEnum = pgEnum('event_type', eventTypes);

export const calendarEvent = pgTable(
	'calendar_event',
	{
		id: text('id').primaryKey(), // crypto.randomUUID() via $defaultFn
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		type: eventTypeEnum('type').notNull(),
		title: text('title'), // required for 'other', optional note otherwise
		allDay: boolean('all_day').notNull(),
		start: timestamp('start', { mode: 'string' }).notNull(),
		end: timestamp('end', { mode: 'string' }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('calendar_event_user_id_idx').on(table.userId)]
);
```

Timestamp semantics — the interpretation rule is owned by mapping helpers, nowhere else:

- Columns are `timestamp` **without time zone**, read in `mode: 'string'` so values stay
  floating local times. They are never coerced through a JS `Date` (an instant), which
  would apply timezone shifts the calendar component explicitly avoids (see
  `docs/calendar.md`, Timezone handling).
- Timed events (`allDay = false`): exact datetimes, `end` exclusive.
- All-day events (`allDay = true`): midnight timestamps; only the date part is
  meaningful. `end` is end-inclusive: a one-day event has `start = end` = that day at
  00:00, mirroring the component's `CalendarDate` model.
- Postgres returns `mode: 'string'` timestamps as `YYYY-MM-DD HH:MM:SS` (space
  separator); the mapping helpers normalize to the `T`-separated ISO form that
  `parseDateTime` expects, and serialize back when writing.

## Type → color mapping

A constant in `$lib` (importable by both the page and future consumers):

| type             | color  |
| ---------------- | ------ |
| `vacation`       | blue   |
| `sick_leave`     | red    |
| `business_trip`  | violet |
| `public_holiday` | green  |
| `remote_work`    | amber  |
| `other`          | gray   |

Color is derived from `type` at render time and never stored.

## Validation schemas

`src/lib/schemas/event.ts`, zod4 with localized `error: () => m.…()` callbacks like
`src/lib/schemas/auth.ts`:

- `eventSchema` — the dialog form (create and update share it):
  - `id`: optional string; present ⇒ update, absent ⇒ create.
  - `type`: `z.enum(eventTypes)`.
  - `title`: trimmed string, max 200, may be empty — refinement requires non-empty when
    `type === 'other'`.
  - `allDay`: boolean, default `true`.
  - `startDate`, `endDate`: `YYYY-MM-DD` strings (validated by parsing with
    `parseDate`).
  - `startTime`, `endTime`: `HH:mm` strings, only meaningful when `allDay` is false.
  - Cross-field refinements: all-day requires `endDate ≥ startDate` (end-inclusive);
    timed requires `end datetime > start datetime` (end-exclusive).
- `deleteEventSchema` — `{ id: string }`.
- `moveEventSchema` — `{ id, allDay, start, end }` for drag move/resize; start/end are
  serialized `CalendarDate`/`CalendarDateTime` strings validated by parsing, with the
  same ordering refinements.

Flat scalar fields (separate date and time strings) keep superforms bindings simple and
map directly onto native `<input type="date">` / `<input type="time">`.

## Route: `/app/calendar`

Linked in the app header navigation (`src/routes/app/+layout.svelte`) next to Home.
Auth is already enforced by the `/app` layout; actions still re-check `event.locals.user`.

### `+page.server.ts`

- `load`:
  - Parse `view` / `date` from query params exactly like the docs example (fall back to
    `month` / today).
  - Fetch the user's events (`where userId = user.id`, ordered by `start`).
  - Prepare superforms: `event` form (id `event`), `delete` form, `move` form.
- Actions (all: `superValidate` → `fail(400, { form })` on invalid → ownership check →
  drizzle write → `redirect` with flash toast, following `settings/+page.server.ts`):
  - `save` — insert when `form.data.id` is absent; update when present. Update and
    delete verify the row belongs to `locals.user.id` (`where id = ? and userId = ?`);
    zero rows affected ⇒ 404.
  - `delete` — delete by id + userId.
  - `move` — update `allDay`/`start`/`end` by id + userId (used by drag move/resize).

### `+page.svelte`

- Maps DB rows → `CalendarEvent<EventRow>` via the mapping helpers: parse timestamps,
  derive `color` from type, `title` falls back to the localized type label when the row's
  title is empty; the raw row rides along in `data`.
- `view` / `date` are `$state` seeded from load data and synced back to query params via
  `goto(…, { replaceState: true, keepFocus: true, noScroll: true })` (docs example).
- Wiring:
  - `headerActions` snippet → "Add event" button, opens the dialog blank (today
    prefilled, all-day).
  - `onDayClick(date)` → create dialog prefilled with that day, all-day.
  - `onRangeSelect(range)` → create dialog prefilled with the range; all-day vs timed
    follows `range.allDay`.
  - `onEventClick(event)` → edit dialog prefilled from the row.
  - `onEventChange(event, change)` → fills and submits the hidden `move` form.
- Success toasts come from flash messages (`sveltekit-flash-message`), as elsewhere in
  the app.

## Event dialog

`event-dialog.svelte`, colocated in the route folder. One dialog, two modes (create /
edit) driven by whether `id` is set.

- Structure: `ui/dialog` (Root/Content/Header/Title/Description/Footer) around a
  superforms `<form method="POST" action="?/save" use:enhance>` composed with `ui/field`
  (FieldGroup / Field / FieldLabel / FieldContent / FieldError).
- Fields:
  - Type — `ui/select` over the enum with localized labels.
  - Title — `ui/input`; label and required-ness switch when type is `other`
    (required title vs optional note).
  - All day — `ui/switch`.
  - Start / end date — native date inputs (via `ui/input type="date"`).
  - Start / end time — time inputs, rendered only when not all-day.
- Edit mode extras: destructive Delete button in the footer with a two-step confirm
  (first click swaps the button to a "confirm delete" state; second click submits the
  separate delete form; any other interaction resets it). Events with `editable === false` (none
  are produced by this feature yet, but the calendar supports them) open read-only.
- Dialog opens/closes via local `$state`; a successful action redirects with flash,
  which closes it and refreshes the event list.

## i18n

New `calendar_event_*` keys in `messages/en.json`, `fr.json`, `pl.json`:

- Type labels (used in the select and as default titles).
- Dialog strings: titles (add/edit), field labels, buttons (save, delete, cancel),
  delete confirmation.
- Validation messages (title required for other, end-before-start).
- Flash toasts (created / updated / deleted / moved).

## Error handling

- Validation errors render under fields via `FieldError`; nothing persists.
- Ownership mismatch or missing row → 404 (no information leak about other users' ids).
- The calendar component already skips malformed ranges defensively; schema refinements
  make that a dead-code safety net rather than a reachable path.
- Failed `move` (e.g. stale id): flash error; drag preview reverts automatically since
  the events array never changes.

## Testing

Vitest unit tests, same style as `src/lib/components/calendar/core/*.test.ts`:

- `event` schema: other-requires-title, all-day `end ≥ start`, timed `end > start`,
  date/time format rejection.
- `move` schema: parse/ordering rules for both variants.
- Mapping helpers: row → `CalendarEvent` (all-day midnight/date-part rule, color/title
  derivation) and form values → row (round-trip).

No component/E2E tests — consistent with the current repo, which unit-tests pure logic
only.

## Migration

`pnpm db:generate` produces the migration for the new enum + table; `pnpm db:migrate`
applies it. No changes to existing tables.
