# Calendar Component

A generic, event-agnostic calendar with Month, Week, and Agenda views, located at `src/lib/components/calendar`. It renders whatever events it is given and reports user intent through callbacks; it owns no data and performs no persistence.

```ts
import { Calendar, EVENT_COLORS } from '$lib/components/calendar';
import type {
	AllDayEvent,
	CalendarEvent,
	CalendarView,
	EventChange,
	EventColor,
	RangeSelection,
	TimedEvent
} from '$lib/components/calendar';
```

## Event model

`CalendarEvent<T>` is a discriminated union on `allDay`. Dates use [`@internationalized/date`](https://react-spectrum.adobe.com/internationalized/date/) types.

```ts
type CalendarEvent<T = unknown> = AllDayEvent<T> | TimedEvent<T>;
```

| Field                    | Type               | Notes                                                                                                                 |
| ------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `id`                     | `string`           | Render key. Must be unique across the `events` array.                                                                 |
| `title`                  | `string`           | Rendered as plain text.                                                                                               |
| `allDay`                 | `boolean`          | Discriminant; selects the field types of `start`/`end`.                                                               |
| `start`, `end` (all-day) | `CalendarDate`     | **End-inclusive**: a one-day event has `start` equal to `end`.                                                        |
| `start`, `end` (timed)   | `CalendarDateTime` | **End-exclusive**. An event ending at exactly midnight does not touch the next day.                                   |
| `color`                  | `EventColor?`      | One of `EVENT_COLORS`: `'blue' \| 'green' \| 'amber' \| 'red' \| 'violet' \| 'rose' \| 'gray'`. Defaults to `'gray'`. |
| `editable`               | `boolean?`         | When `false`, the event cannot be moved or resized. Defaults to `true`.                                               |
| `data`                   | `T?`               | Arbitrary consumer data. Passed back unchanged through every callback and snippet.                                    |

Timezone handling: the component performs **no timezone conversion**. All-day events are plain dates. Timed events are floating local times — convert stored instants to the desired display zone before passing them in. "Today" highlighting and the week view's current-time line use the browser's local timezone.

Events whose `end` precedes their `start` are skipped during rendering (with a `console.warn` in dev builds); the component never throws on malformed data.

## Props

```svelte
<Calendar
	{events}
	bind:view
	bind:date
	locale="en"
	readonly={false}
	onDayClick={...}
	onEventClick={...}
	onRangeSelect={...}
	onEventChange={...}
	eventContent={...}
	agendaItem={...}
	headerActions={...}
/>
```

| Prop       | Type                            | Default                 | Notes                                                                                                                     |
| ---------- | ------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `events`   | `CalendarEvent<T>[]`            | `[]`                    | Display data. Never mutated by the component.                                                                             |
| `view`     | `'month' \| 'week' \| 'agenda'` | `'month'`               | Bindable. Changed by the header's view switcher.                                                                          |
| `date`     | `CalendarDate`                  | today                   | Bindable focal date. Changed by prev/today/next navigation.                                                               |
| `locale`   | `string`                        | active Paraglide locale | Drives all date/time formatting (`Intl.DateTimeFormat`) and the week start day (CLDR: `en` → Sunday, `pl`/`fr` → Monday). |
| `readonly` | `boolean`                       | `false`                 | Disables all drag interactions (range selection, move, resize). Click callbacks still fire.                               |

Prev/next navigation steps by one week in the week view and by one month otherwise. "Today" resets `date` to the current day.

## Callbacks

All callbacks are optional. Omitting a callback disables the interaction that reports through it (for example, without `onEventChange`, no event can be dragged or resized).

| Callback        | Signature                                                | Fires when                                                                                                                                                                                                                                                                                                                    |
| --------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onDayClick`    | `(date: CalendarDate) => void`                           | A month cell or a week-view all-day-lane slot is clicked (or activated with Enter/Space).                                                                                                                                                                                                                                     |
| `onEventClick`  | `(event: CalendarEvent<T>) => void`                      | An event chip, block, or agenda row is clicked (or activated via keyboard).                                                                                                                                                                                                                                                   |
| `onRangeSelect` | `(range: RangeSelection) => void`                        | A drag-selection completes. Month view and the week all-day lane produce `{ allDay: true, start, end }` (`CalendarDate`, ordered, end-inclusive). The week time grid produces `{ allDay: false, start, end }` (`CalendarDateTime`, snapped to 15 minutes, minimum 15 minutes, confined to the drag's starting day).           |
| `onEventChange` | `(event: CalendarEvent<T>, change: EventChange) => void` | A move or resize drag completes. `change` is a discriminated union `{ allDay, start, end }` matching the event's `allDay` (`CalendarDate` dates for all-day, `CalendarDateTime` for timed). The component shows a live preview during the drag but reverts on drop — committing the change is the consumer's job (see below). |

### Controlled updates

The component never modifies `events`. To accept a proposed move/resize, apply the change to your own state:

```svelte
<Calendar
	{events}
	onEventChange={(event, change) => {
		events = events.map((existing) =>
			existing.id === event.id ? { ...existing, ...change } : existing
		);
	}}
/>
```

Ignoring the callback (or applying it after a failed persistence call) leaves the event where it was — the drag preview reverts automatically.

### Interaction reference

| Gesture                      | Month view                                 | Week view                                                                    |
| ---------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| Click empty day/slot         | `onDayClick`                               | All-day lane: `onDayClick`. Time grid: nothing (selection requires a drag).  |
| Drag across empty days/slots | All-day `onRangeSelect`                    | Lane: all-day `onRangeSelect`. Grid: timed `onRangeSelect` (15-minute snap). |
| Drag an event                | Move by whole days (`onEventChange`)       | Lane: move by days. Grid: move by day + snapped minutes.                     |
| Drag an event's edge         | Resize all-day events (left/right handles) | Lane: resize by days. Grid: resize the end time (bottom handle, ≥ 15 min).   |

Drags are pointer-based. Keyboard users can reach every element (day cells, chips, rows) and activate the click callbacks; mutations are then up to the consumer's own UI. The agenda view has no drag interactions.

## Snippets

All optional; defaults are provided.

| Snippet         | Signature                     | Replaces                                                                                       |
| --------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `eventContent`  | `Snippet<[CalendarEvent<T>]>` | The inner content of event chips (month, all-day lane, overflow popover) and time-grid blocks. |
| `agendaItem`    | `Snippet<[CalendarEvent<T>]>` | The inner content of an agenda row.                                                            |
| `headerActions` | `Snippet`                     | Nothing by default — renders trailing content in the header, after the view switcher.          |

```svelte
<Calendar {events}>
	{#snippet eventContent(event)}
		<span class="truncate">{event.title} ({event.data?.owner})</span>
	{/snippet}
	{#snippet headerActions()}
		<Button onclick={openCreateDialog}>Add</Button>
	{/snippet}
</Calendar>
```

The `data` field is typed: passing `events: CalendarEvent<Leave>[]` makes snippets and callbacks receive `CalendarEvent<Leave>`.

## Localization

- UI strings (view names, "Today", "All day", "+N more", empty state) come from Paraglide messages (`calendar_*` keys in `messages/*.json`) and follow the app's active locale.
- Date and time text is formatted with `Intl.DateTimeFormat` using the `locale` prop.
- The first day of the week derives from the locale's CLDR data.

## Exports

| Export                                                | Kind                | Description                         |
| ----------------------------------------------------- | ------------------- | ----------------------------------- |
| `Calendar`                                            | component           | The root component described above. |
| `EVENT_COLORS`                                        | `readonly string[]` | The seven valid `color` values.     |
| `CalendarEvent<T>`, `AllDayEvent<T>`, `TimedEvent<T>` | types               | Event model.                        |
| `CalendarView`                                        | type                | `'month' \| 'week' \| 'agenda'`.    |
| `EventColor`                                          | type                | Union of `EVENT_COLORS`.            |
| `RangeSelection`                                      | type                | `onRangeSelect` payload.            |
| `EventChange`                                         | type                | `onEventChange` payload.            |

## Example implementation

A self-contained page with in-memory events, `view`/`date` mirrored to query params (linkable and SSR-friendly), and every callback wired up. This previously lived at `/app/calendar` as a demo route.

`+page.ts` — parse and validate calendar state from the URL:

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

`+page.svelte` — seed state from the load data, bind it to the calendar, sync it back to the URL:

```svelte
<script lang="ts">
	import {
		getLocalTimeZone,
		startOfMonth,
		toCalendarDateTime,
		today
	} from '@internationalized/date';
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
		// Multi-day all-day range (end-inclusive).
		{
			id: 'leave-1',
			title: 'Annual leave',
			allDay: true,
			color: 'blue',
			start: day(2),
			end: day(6)
		},
		// Non-editable: cannot be moved or resized.
		{
			id: 'holiday',
			title: 'Public holiday',
			allDay: true,
			color: 'green',
			editable: false,
			start: day(14),
			end: day(14)
		},
		// Overlapping timed events render side by side in the week view.
		{
			id: 'meet-1',
			title: 'Team sync',
			allDay: false,
			color: 'blue',
			start: at(9, 10),
			end: at(9, 11)
		},
		{
			id: 'meet-2',
			title: '1:1',
			allDay: false,
			color: 'violet',
			start: at(9, 10, 30),
			end: at(9, 11, 30)
		},
		// Short (< 30 min) events render compactly.
		{
			id: 'standup',
			title: 'Standup',
			allDay: false,
			color: 'amber',
			start: at(10, 9, 15),
			end: at(10, 9, 30)
		},
		// A timed event may cross midnight (end-exclusive).
		{
			id: 'on-call',
			title: 'On-call',
			allDay: false,
			color: 'red',
			start: at(26, 22),
			end: at(27, 6)
		}
	]);

	$effect(() => {
		const params = new URLSearchParams({ view, date: date.toString() });
		// Query-only relative navigation has no resolve()-compatible form.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`?${params}`, { replaceState: true, keepFocus: true, noScroll: true });
	});
</script>

<svelte:head><title>Calendar · {m.app_name()}</title></svelte:head>

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
			existing.id === event.id ? { ...existing, ...change } : existing
		);
		toast.success(`Updated "${event.title}"`);
	}}
/>
```

The toast handlers are placeholders — a real consumer would open a creation dialog from `onRangeSelect`/`onDayClick`, an edit dialog from `onEventClick`, and persist `onEventChange` before applying it.
