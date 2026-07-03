# Event Hover Tooltip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a styled hover tooltip (full title + date/time range) on every calendar event in month, week, and agenda views, so cramped events with long titles are readable.

**Architecture:** A new `event-tooltip.svelte` component in the calendar library wraps the existing shadcn-svelte/bits-ui Tooltip primitives. It exposes a `trigger` snippet that receives bits-ui's trigger props; each view spreads those props onto its existing event `<button>` (via `mergeProps` from bits-ui) so the button itself becomes the tooltip trigger — no nested buttons, existing click/drag handlers preserved. Two new pure format helpers produce the date/time line.

**Tech Stack:** Svelte 5 (runes), bits-ui v2 Tooltip, tailwind-variants, `@internationalized/date`, vitest, paraglide i18n.

**Spec:** `docs/superpowers/specs/2026-07-03-event-hover-tooltip-design.md`

## Global Constraints

- Package manager is **pnpm**; run tools with `pnpm exec <tool>`.
- **Never add `Co-Authored-By` trailers to commits** (repo rule).
- After writing or editing any `.svelte` file, validate it with the Svelte MCP `svelte-autofixer` tool if available (call until clean); always finish with `pnpm exec svelte-check --tsconfig ./tsconfig.json` scoped errors check via `pnpm check`.
- No DB schema, API, or edit-form changes — events only have a `title`; the tooltip renders existing data.
- All-day events: `end` is **inclusive** (`AllDayEvent` in `src/lib/components/calendar/core/types.ts:21-26`). Timed events: `end` is exclusive.
- Formatters in `core/format.ts` must stay pure (no paraglide imports) and format in UTC via the existing cached `formatter()` helper.

---

### Task 1: Date-range format helpers

**Files:**

- Modify: `src/lib/components/calendar/core/format.ts` (append after `formatTimeRange`, `src/lib/components/calendar/core/format.ts:55`)
- Test: `src/lib/components/calendar/core/format.test.ts`

**Interfaces:**

- Consumes: existing private `formatter(locale, options)` cache in `format.ts`.
- Produces (used by Task 2):
  - `formatDateRange(start: CalendarDate, end: CalendarDate, locale: string): string` — "Jul 2" when start = end, "Jul 2 – 7" style range otherwise.
  - `formatDateTimeRange(start: CalendarDateTime, end: CalendarDateTime, locale: string): string` — "Jul 2, 9:00 – 10:30 AM" same-day, both dates when crossing midnight.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/components/calendar/core/format.test.ts` (add `formatDateRange`, `formatDateTimeRange` to the existing import from `./format.js`; `jul2` and `CalendarDateTime` are already imported at the top of the file):

```ts
describe('formatDateRange', () => {
	it('collapses an equal start and end to a single date', () => {
		expect(formatDateRange(jul2, jul2, 'en')).toBe('Jul 2');
	});

	it('formats a multi-day range with month and days', () => {
		const label = formatDateRange(jul2, new CalendarDate(2026, 7, 7), 'en');
		expect(label).toContain('2');
		expect(label).toContain('7');
		expect(label).toMatch(/Jul/);
	});
});

describe('formatDateTimeRange', () => {
	it('shows the date once for a same-day range', () => {
		const label = formatDateTimeRange(
			new CalendarDateTime(2026, 7, 2, 9, 0),
			new CalendarDateTime(2026, 7, 2, 10, 30),
			'en'
		);
		expect(label).toContain('9:00');
		expect(label).toContain('10:30');
		expect(label.match(/Jul/g)).toHaveLength(1);
	});

	it('shows both dates when the range crosses midnight', () => {
		const label = formatDateTimeRange(
			new CalendarDateTime(2026, 7, 2, 21, 0),
			new CalendarDateTime(2026, 7, 3, 2, 0),
			'en'
		);
		expect(label.match(/Jul/g)).toHaveLength(2);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/components/calendar/core/format.test.ts`
Expected: FAIL — `formatDateRange is not a function` (or import error).

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/components/calendar/core/format.ts`:

```ts
export function formatDateRange(start: CalendarDate, end: CalendarDate, locale: string): string {
	return formatter(locale, { day: 'numeric', month: 'short' }).formatRange(
		start.toDate('UTC'),
		end.toDate('UTC')
	);
}

export function formatDateTimeRange(
	start: CalendarDateTime,
	end: CalendarDateTime,
	locale: string
): string {
	return formatter(locale, {
		day: 'numeric',
		month: 'short',
		hour: 'numeric',
		minute: '2-digit'
	}).formatRange(start.toDate('UTC'), end.toDate('UTC'));
}
```

Note: `Intl.DateTimeFormat.formatRange` already collapses equal values ("Jul 2") and shared date parts ("Jul 2, 9:00 – 10:30 AM"), so no branching is needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/components/calendar/core/format.test.ts`
Expected: PASS (all existing + 4 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/calendar/core/format.ts src/lib/components/calendar/core/format.test.ts
git commit -m "feat(calendar): date and datetime range format helpers"
```

---

### Task 2: `event-tooltip.svelte` component

**Files:**

- Create: `src/lib/components/calendar/event-tooltip.svelte`

**Interfaces:**

- Consumes: `formatDateRange` / `formatDateTimeRange` from Task 1; `$lib/components/ui/tooltip` (shadcn wrappers over bits-ui); `m.calendar_all_day()` paraglide message (already exists — used in `week-view.svelte:362`).
- Produces (used by Tasks 3–5): component `EventTooltip` with props:
  - `event: CalendarEvent<T>` (generic `T`)
  - `locale: string`
  - `disabled?: boolean` (default `false`)
  - `trigger: Snippet<[HTMLButtonAttributes]>` — render your event button here, spreading the received props onto it.

There is no unit test for this presentational component (the repo has no component-test setup — `core/*.test.ts` only); it is validated by `svelte-autofixer` + `pnpm check` here and by browser verification in Task 6.

- [ ] **Step 1: Create the component**

Create `src/lib/components/calendar/event-tooltip.svelte`:

```svelte
<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages.js';
	import { formatDateRange, formatDateTimeRange } from './core/format.js';
	import type { CalendarEvent } from './core/types.js';

	let {
		event,
		locale,
		disabled = false,
		trigger
	}: {
		event: CalendarEvent<T>;
		locale: string;
		disabled?: boolean;
		trigger: Snippet<[HTMLButtonAttributes]>;
	} = $props();

	const whenLabel = $derived.by(() => {
		if (!event.allDay) return formatDateTimeRange(event.start, event.end, locale);
		const range = formatDateRange(event.start, event.end, locale);
		return event.start.compare(event.end) === 0 ? `${m.calendar_all_day()} · ${range}` : range;
	});
</script>

<Tooltip.Provider delayDuration={500}>
	<Tooltip.Root {disabled}>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				{@render trigger(props as HTMLButtonAttributes)}
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content class="flex-col items-start gap-0.5">
			<span class="break-words">{event.title}</span>
			<span class="opacity-70">{whenLabel}</span>
		</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>
```

Notes for the implementer:

- The `child` snippet is bits-ui's way to make an element you render yourself act as the trigger; `Tooltip.Trigger` (shadcn wrapper) forwards it through `{...restProps}`.
- `disabled` is a documented bits-ui `Tooltip.Root` prop forwarded by the shadcn wrapper's `restProps`. If `pnpm check` rejects it there, move it to `<Tooltip.Provider {disabled} ...>` (also a documented Provider prop) — behavior is equivalent here since the Provider wraps a single tooltip.
- A Provider per tooltip matches the existing per-usage pattern in `calendar-header.svelte:28`.
- `Tooltip.Content`'s base classes include `inline-flex items-center max-w-xs`; the `flex-col items-start` override makes it a two-line stack, and long titles wrap via `break-words` within `max-w-xs`.

- [ ] **Step 2: Validate**

Run Svelte MCP `svelte-autofixer` on the file content until it reports no issues (skip if the MCP is unavailable), then:

Run: `pnpm check`
Expected: 0 errors (pre-existing warnings, if any, unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/calendar/event-tooltip.svelte
git commit -m "feat(calendar): event tooltip component"
```

---

### Task 3: Month view integration (grid chips + "+N more" popover)

**Files:**

- Modify: `src/lib/components/calendar/month-view.svelte` (imports at top; popover chips at `:254-261`; grid chips at `:284-293` — line numbers from before this change)

**Interfaces:**

- Consumes: `EventTooltip` from Task 2; `mergeProps` from `bits-ui` (merges the tooltip's trigger handlers with the view's own `onclick`/`onpointerdown` so both run).
- Produces: nothing new.

- [ ] **Step 1: Add imports**

In the `<script>` block of `month-view.svelte`, next to the existing `EventChip` import:

```ts
import { mergeProps } from 'bits-ui';
import EventTooltip from './event-tooltip.svelte';
```

- [ ] **Step 2: Wrap the grid chip**

Replace the `EventChip` usage in the lane-segments loop (currently `month-view.svelte:284-293`):

```svelte
<EventTooltip event={segment.event} {locale} disabled={drag !== null}>
	{#snippet trigger(tooltipProps)}
		<EventChip
			{...mergeProps(tooltipProps, {
				onpointerdown: (e: PointerEvent) => startMove(e, segment.event),
				onclick: () => chipClick(segment.event)
			})}
			event={segment.event}
			{locale}
			continuesLeft={segment.continuesLeft}
			continuesRight={segment.continuesRight}
			{eventContent}
			class={cn(canEdit(segment.event) && 'cursor-grab')}
		/>
	{/snippet}
</EventTooltip>
```

- [ ] **Step 3: Wrap the "+N more" popover chip**

Replace the `EventChip` usage inside `Popover.Content` (currently `month-view.svelte:255-260`):

```svelte
<EventTooltip {event} {locale}>
	{#snippet trigger(tooltipProps)}
		<EventChip
			{...mergeProps(tooltipProps, { onclick: () => onEventClick?.(event) })}
			{event}
			{locale}
			{eventContent}
		/>
	{/snippet}
</EventTooltip>
```

(No `disabled` needed — chips inside the popover are not drag sources.)

- [ ] **Step 4: Validate**

Run Svelte MCP `svelte-autofixer` on the edited file (skip if unavailable), then:

Run: `pnpm check`
Expected: 0 errors.
Run: `pnpm exec vitest run`
Expected: PASS (no unit tests touch views; this guards against accidental breakage).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/calendar/month-view.svelte
git commit -m "feat(calendar): hover tooltips on month view events"
```

---

### Task 4: Week view integration (all-day lane + timed grid)

**Files:**

- Modify: `src/lib/components/calendar/week-view.svelte` (imports at top; all-day lane `EventChip` at `:397-406`; timed block `<button>` at `:464-483` — line numbers from before this change)

**Interfaces:**

- Consumes: `EventTooltip` (Task 2), `mergeProps` from `bits-ui`.
- Produces: nothing new.

- [ ] **Step 1: Add imports**

In the `<script>` block of `week-view.svelte`, alongside the existing `import EventChip, { blockVariants } from './event-chip.svelte';`:

```ts
import { mergeProps } from 'bits-ui';
import EventTooltip from './event-tooltip.svelte';
```

- [ ] **Step 2: Wrap the all-day lane chip**

Replace the `EventChip` usage in the lane-segments loop (currently `week-view.svelte:397-406`):

```svelte
<EventTooltip event={segment.event} {locale} disabled={drag !== null}>
	{#snippet trigger(tooltipProps)}
		<EventChip
			{...mergeProps(tooltipProps, {
				onpointerdown: (e: PointerEvent) => startLaneMove(e, segment.event),
				onclick: () => eventClick(segment.event)
			})}
			event={segment.event}
			{locale}
			continuesLeft={segment.continuesLeft}
			continuesRight={segment.continuesRight}
			{eventContent}
			class={cn(canEdit(segment.event) && 'cursor-grab')}
		/>
	{/snippet}
</EventTooltip>
```

- [ ] **Step 3: Wrap the timed grid block**

Replace the raw `<button>` in the timed placements loop (currently `week-view.svelte:464-483`), keeping its children unchanged:

```svelte
<EventTooltip event={placement.event} {locale} disabled={drag !== null}>
	{#snippet trigger(tooltipProps)}
		<button
			type="button"
			{...mergeProps(tooltipProps, {
				onpointerdown: (e: PointerEvent) => startGridMove(e, placement.event),
				onclick: () => eventClick(placement.event)
			})}
			class={cn(
				blockVariants({ color: placement.event.color }),
				canEdit(placement.event) && 'cursor-grab'
			)}
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
	{/snippet}
</EventTooltip>
```

The resize handle `<div>` after the button and the surrounding positioned wrapper stay exactly as they are.

- [ ] **Step 4: Validate**

Run Svelte MCP `svelte-autofixer` on the edited file (skip if unavailable), then:

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/calendar/week-view.svelte
git commit -m "feat(calendar): hover tooltips on week view events"
```

---

### Task 5: Agenda view integration

**Files:**

- Modify: `src/lib/components/calendar/agenda-view.svelte` (imports at top; list-item `<button>` at `:68-84` — line numbers from before this change)

**Interfaces:**

- Consumes: `EventTooltip` (Task 2), `mergeProps` from `bits-ui`.
- Produces: nothing new.

- [ ] **Step 1: Add imports**

In the `<script>` block of `agenda-view.svelte`, alongside the existing `import { dotVariants } from './event-chip.svelte';`:

```ts
import { mergeProps } from 'bits-ui';
import EventTooltip from './event-tooltip.svelte';
```

- [ ] **Step 2: Wrap the list-item button**

Replace the `<button>` inside the `<li>` (currently `agenda-view.svelte:68-84`), keeping its children unchanged:

```svelte
<EventTooltip {event} {locale}>
	{#snippet trigger(tooltipProps)}
		<button
			type="button"
			{...mergeProps(tooltipProps, { onclick: () => onEventClick?.(event) })}
			class="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm focus-visible:ring-[3px] focus-visible:outline-none"
		>
			{#if agendaItem}
				{@render agendaItem(event)}
			{:else}
				<span class={dotVariants({ color: event.color })}></span>
				<span class="text-muted-foreground min-w-36 shrink-0 whitespace-nowrap">
					{event.allDay ? m.calendar_all_day() : formatTimeRange(event.start, event.end, locale)}
				</span>
				<span class="truncate font-medium">{event.title}</span>
			{/if}
		</button>
	{/snippet}
</EventTooltip>
```

(Agenda view has no drag & drop, so no `disabled` prop.)

- [ ] **Step 3: Validate**

Run Svelte MCP `svelte-autofixer` on the edited file (skip if unavailable), then:

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/calendar/agenda-view.svelte
git commit -m "feat(calendar): hover tooltips on agenda view events"
```

---

### Task 6: Full test run + browser verification

**Files:** none created/modified (fixes only if verification finds bugs).

- [ ] **Step 1: Full unit test suite**

Run: `pnpm exec vitest run`
Expected: all tests PASS.

- [ ] **Step 2: Type/lint gate**

Run: `pnpm check && pnpm lint`
Expected: 0 errors.

- [ ] **Step 3: Browser verification (preview tools)**

Setup (this repo's known-good flow): start the dev server via `preview_start` (`.claude/launch.json`), sign in as `dash-tester@example.com` / `dash-tester-pass-123` (existing dev-DB account with seeded July 2026 events; seed extra events via `docker exec -i out-of-office-db-1 psql -U root -d local` if needed — SQL inserts into `calendar_event` need explicit `gen_random_uuid()::text` ids). Reload the frame after code edits before evaluating.

Ensure at least one seeded event has a long title (60+ chars) on a single day, e.g.:

```sql
insert into calendar_event (id, user_id, type, title, all_day, start, "end", created_at, updated_at)
select gen_random_uuid()::text, u.id, 'vacation',
  'Very long single-day event title that is completely unreadable in a month cell',
  true, '2026-07-15', '2026-07-15', now(), now()
from "user" u where u.email = 'dash-tester@example.com';
```

Verify on the calendar page (July 2026):

1. **Month view:** hover a short event with the long title → after ~0.5s a tooltip shows the full wrapped title plus "All day · Jul 15"; hover a multi-day event → date range line.
2. **"+N more" popover:** open it (seed 5+ events on one day if none overflows), hover a chip inside → tooltip appears.
3. **Week view:** hover an all-day lane chip and a timed block → tooltips with correct date/time lines ("Jul N, 9:00 – 10:30 AM" style for timed).
4. **Agenda view:** hover a row → tooltip appears.
5. **Click still works:** clicking an event opens the edit dialog, and no tooltip lingers over the dialog.
6. **Drag non-interference (month or week):** drag an event to another day — while dragging, no tooltips pop up over neighboring events; drop still moves the event.

Take a `preview_screenshot` of an open tooltip over a cramped month-view event as proof.

- [ ] **Step 4: Fix anything found, re-verify, commit fixes**

Diagnose via source, fix, re-run the relevant checks above. Commit any fixes as `fix(calendar): ...`.
