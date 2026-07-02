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
				? { allDay: true, ...movedAllDay(active.event.start, active.event.end, delta) }
				: { allDay: false, ...movedTimed(active.event.start, active.event.end, delta, 0) };
		}
		if (active.kind === 'resize') {
			return {
				allDay: true,
				...resizedAllDay(active.event.start, active.event.end, active.edge, active.target)
			};
		}
		return null;
	}

	const previewEvents = $derived.by(() => {
		if (!drag || drag.kind === 'select' || !dragMoved) return events;
		const change = draggedChange(drag);
		if (!change) return events;
		const dragged = drag.event;
		return events.map((event) => (event.id === dragged.id ? { ...event, ...change } : event));
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

	/** Columns of `week` covered by the drag selection, for the ghost outline. */
	function selectionSpanForRow(week: CalendarDate[]): { startCol: number; span: number } | null {
		if (!selection) return null;
		const rowStart = week[0];
		const rowEnd = week[DAYS_IN_WEEK - 1];
		if (selection.start.compare(rowEnd) > 0 || selection.end.compare(rowStart) < 0) return null;
		const startCol = Math.max(0, daysBetween(rowStart, selection.start));
		const endCol = Math.min(DAYS_IN_WEEK - 1, daysBetween(rowStart, selection.end));
		return { startCol, span: endCol - startCol + 1 };
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
		suppressClick = false;
		if (e.button !== 0) return;
		drag = { kind: 'select', anchor: day, target: day };
		dragMoved = false;
	}

	function startMove(e: PointerEvent, event: CalendarEvent<T>) {
		suppressClick = false;
		if (e.button !== 0 || !canEdit(event)) return;
		const day = dayAtPointer(e);
		if (!day) return;
		drag = { kind: 'move', event, anchor: day, target: day };
		dragMoved = false;
	}

	function startResize(e: PointerEvent, event: CalendarEvent<T>, edge: 'start' | 'end') {
		suppressClick = false;
		if (e.button !== 0 || !event.allDay || !canEdit(event)) return;
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
		// Comparing to the previous frame's target is equivalent to comparing to the initial one: dragMoved only ever latches true.
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
	<div class="flex h-[44rem] min-w-[640px] flex-col select-none">
		<div class="grid grid-cols-7 border-b">
			{#each weeks[0] as day (day.toString())}
				<div class="text-muted-foreground px-2 py-1.5 text-center text-xs font-medium">
					{formatWeekdayName(day, locale)}
				</div>
			{/each}
		</div>
		<div class="grid flex-1 grid-rows-6" bind:this={gridEl}>
			{#each rows as { week, segments, overflow }, w (week[0].toString())}
				{@const ghost = selectionSpanForRow(week)}
				<div class="relative border-b last:border-b-0" bind:clientHeight={rowHeights[w]}>
					<div class="grid h-full grid-cols-7">
						{#each week as day, c (day.toString())}
							<div
								role="gridcell"
								tabindex="0"
								class={cn(
									'focus-visible:ring-ring/50 relative border-r p-1 last:border-r-0 focus-visible:ring-[3px] focus-visible:outline-none',
									!isSameMonth(day, focal) && 'bg-muted/30 text-muted-foreground'
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
					{#if ghost}
						<div
							class="border-primary bg-primary/10 pointer-events-none absolute inset-y-1 z-10 rounded-md border"
							style="left: calc({(ghost.startCol / 7) * 100}% + 2px); width: calc({(ghost.span /
								7) *
								100}% - 4px);"
						></div>
					{/if}
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
