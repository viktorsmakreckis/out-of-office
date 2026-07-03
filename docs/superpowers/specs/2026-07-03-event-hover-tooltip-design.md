# Event Hover Tooltip — Design

**Date:** 2026-07-03
**Status:** Approved

## Problem

Calendar events with long titles are unreadable when the event occupies little
horizontal space — e.g. a 1-day event in month view. Event chips and blocks
truncate the title (`truncate` / `overflow-hidden`), and there is no way to see
the full text without opening the edit dialog.

## Decision

Show a styled tooltip on hover over any event, in all three calendar views,
using the existing shadcn-svelte/bits-ui `Tooltip` component. The tooltip
always appears (after a short delay), not only when text is truncated.

Events have no `description` field — the clipped text is the **title**. No
schema, API, or form changes are in scope.

## Tooltip content

- **Full title** — wrapping freely, capped at `max-w-xs`.
- **Date/time line** (muted text), formatted with the locale via
  `core/format.js` helpers (adding a `formatDateRange`-style helper if none
  fits):
  - Timed event: `Jul 3, 09:00 – 10:30`
  - All-day, single day: `All day · Jul 3` (reuses `m.calendar_all_day()`)
  - All-day, multi-day: `Jul 3 – Jul 7`

## Architecture

New component `src/lib/components/calendar/event-tooltip.svelte`:

- Props: `event: CalendarEvent<T>`, `locale: string`, `disabled?: boolean`,
  and a trigger snippet.
- Wraps `Tooltip.Root` / `Tooltip.Trigger` / `Tooltip.Content` from
  `$lib/components/ui/tooltip`.
- Uses bits-ui's `child` snippet on `Tooltip.Trigger` so the existing event
  `<button>` remains the trigger element — no nested buttons, and all existing
  click / pointerdown handlers stay on the same element.
- Hover delay ~500ms.

### Integration sites (4)

1. **Month view** — `EventChip` in the day grid and inside the "+N more"
   overflow popover.
2. **Week view, all-day lane** — `EventChip` segments.
3. **Week view, timed grid** — the raw `blockVariants` button.
4. **Agenda view** — event list-item buttons.

## Drag & drop interplay

- Month and week views pass `disabled={drag !== null}` so no tooltip opens
  while an event is being moved/resized or a range is being selected.
- bits-ui closes an open tooltip on pointer-down on the trigger (default
  behavior), so starting a drag dismisses the tooltip.

## Error handling

No new failure modes: the component is presentational, renders only data
already present on `CalendarEvent`, and has no async work.

## Testing

- Unit test (vitest) for any new date-range format helper, across the three
  content cases.
- Browser verification: tooltip appears on hover in month, week (both lanes),
  and agenda views; full long title is readable; tooltips do not appear during
  drag; click-to-edit still works.
