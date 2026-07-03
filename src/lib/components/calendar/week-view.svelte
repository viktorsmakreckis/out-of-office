<script lang="ts" generics="T">
	import { getLocalTimeZone, isToday, type CalendarDate } from '@internationalized/date';
	import type { Snippet } from 'svelte';
	import { mergeProps } from 'bits-ui';
	import { m } from '$lib/paraglide/messages.js';
	import { cn } from '$lib/utils.js';
	import EventChip, { blockVariants } from './event-chip.svelte';
	import EventTooltip from './event-tooltip.svelte';
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
	import { formatHourLabel, formatTimeRange, formatWeekdayName } from './core/format.js';
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
				return {
					allDay: false,
					...movedTimed(active.event.start, active.event.end, dayDelta, minuteDelta)
				};
			}
			case 'grid-resize':
				return {
					allDay: false,
					...resizedTimed(active.event.start, days[active.targetDay], active.targetMinute)
				};
			case 'lane-move': {
				const delta = daysBetween(active.anchor, active.target);
				if (delta === 0) return null;
				return { allDay: true, ...movedAllDay(active.event.start, active.event.end, delta) };
			}
			case 'lane-resize':
				return {
					allDay: true,
					...resizedAllDay(active.event.start, active.event.end, active.edge, active.target)
				};
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
		return events.map((event) => (event.id === dragged.id ? { ...event, ...change } : event));
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
		suppressClick = false;
		if (e.button !== 0 || readonly || !onRangeSelect) return;
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
		suppressClick = false;
		if (e.button !== 0) return;
		e.stopPropagation();
		if (!canEdit(event)) return;
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
		suppressClick = false;
		if (e.button !== 0) return;
		e.stopPropagation();
		if (!canEdit(event)) return;
		const position = gridPosition(e);
		if (!position) return;
		drag = {
			kind: 'grid-resize',
			event,
			targetDay: position.dayIndex,
			targetMinute: position.minute
		};
		dragMoved = false;
	}

	function startLaneSelect(e: PointerEvent) {
		suppressClick = false;
		if (e.button !== 0) return;
		const day = laneDayAtPointer(e);
		if (!day) return;
		drag = { kind: 'lane-select', anchor: day, target: day };
		dragMoved = false;
	}

	function startLaneMove(e: PointerEvent, event: CalendarEvent<T>) {
		suppressClick = false;
		if (e.button !== 0) return;
		e.stopPropagation();
		if (!event.allDay || !canEdit(event)) return;
		const day = laneDayAtPointer(e);
		if (!day) return;
		drag = { kind: 'lane-move', event, anchor: day, target: day };
		dragMoved = false;
	}

	function startLaneResize(e: PointerEvent, event: CalendarEvent<T>, edge: 'start' | 'end') {
		suppressClick = false;
		if (e.button !== 0) return;
		e.stopPropagation();
		if (!event.allDay || !canEdit(event)) return;
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
				// Comparing to the previous frame's target is equivalent to comparing to the initial one: dragMoved only ever latches true.
				if (position.dayIndex !== drag.targetDay || position.minute !== drag.targetMinute) {
					dragMoved = true;
				}
				drag = { ...drag, targetDay: position.dayIndex, targetMinute: position.minute };
				return;
			}
			case 'lane-select':
			case 'lane-move':
			case 'lane-resize': {
				// Guarded here, not in startLaneSelect: a plain click must still reach onDayClick in readonly mode.
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
	<div class="flex h-[40rem] min-w-[640px] flex-col select-none">
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
			<div class="px-2 py-1 text-[10px] text-muted-foreground">{m.calendar_all_day()}</div>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="relative col-span-7"
				style="height: {laneCount * 24 + 8}px"
				bind:this={laneEl}
				onpointerdown={startLaneSelect}
			>
				<div class="absolute inset-0 grid grid-cols-7">
					{#each days as day (day.toString())}
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
											100}%; left: {(placement.col / placement.colCount) * 100}%; width: {(1 /
											placement.colCount) *
											100}%;"
									>
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
																{formatTimeRange(
																	placement.event.start,
																	placement.event.end,
																	locale
																)}
															</span>
														{/if}
													{/if}
												</button>
											{/snippet}
										</EventTooltip>
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
