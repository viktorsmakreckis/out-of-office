<script lang="ts" generics="T">
	import {
		endOfMonth,
		getLocalTimeZone,
		isToday,
		startOfMonth,
		type CalendarDate
	} from '@internationalized/date';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import type { Snippet } from 'svelte';
	import * as Empty from '$lib/components/ui/empty';
	import { m } from '$lib/paraglide/messages.js';
	import { cn } from '$lib/utils.js';
	import { dotVariants } from './event-chip.svelte';
	import { mergeProps } from 'bits-ui';
	import EventTooltip from './event-tooltip.svelte';
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
	<Empty.Root class="border">
		<Empty.Header>
			<Empty.Media variant="icon">
				<CalendarDaysIcon />
			</Empty.Media>
			<Empty.Title>{m.calendar_empty_title()}</Empty.Title>
			<Empty.Description>{m.calendar_empty_description()}</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<!-- overflow-clip (not -hidden) clips the sticky headers' square corners at the border
	     radius without creating a scroll container, so position: sticky keeps working. -->
	<div class="flex flex-col overflow-clip rounded-lg border">
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
												{event.allDay
													? m.calendar_all_day()
													: formatTimeRange(event.start, event.end, locale)}
											</span>
											<span class="truncate font-medium">{event.title}</span>
										{/if}
									</button>
								{/snippet}
							</EventTooltip>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
{/if}
