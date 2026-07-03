<script lang="ts">
	import { parseDate, type CalendarDate } from '@internationalized/date';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import TreePalmIcon from '@lucide/svelte/icons/tree-palm';
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { chipVariants, dotVariants } from '$lib/components/calendar/event-chip.svelte';
	import { formatDayHeading, formatWeekLabel } from '$lib/components/calendar/core/format.js';
	import { eventTypeLabel, safeTimezone, toCalendarEvent } from '$lib/events';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime';
	import { cn } from '$lib/utils';
	import { awayOn, BOARD_DAYS, buildBoard, upcomingEvents } from './home';

	let { data } = $props();

	// setLocale() reloads the page, so the current locale is stable per render.
	const locale = getLocale();

	const timezone = $derived(safeTimezone(data.user.timezone));
	const todayDate = $derived(parseDate(data.today));
	const days = $derived(Array.from({ length: BOARD_DAYS }, (_, i) => todayDate.add({ days: i })));
	const boardEvents = $derived(data.records.map((record) => toCalendarEvent(record, timezone)));
	const rows = $derived(buildBoard(boardEvents, todayDate, data.user.id));
	const away = $derived(awayOn(boardEvents, todayDate));
	const upcoming = $derived(
		upcomingEvents(
			data.upcoming.map((record) => toCalendarEvent(record, timezone)),
			todayDate
		)
	);

	const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
	const returnFormat = new Intl.DateTimeFormat(locale, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC'
	});

	// Column count must match BOARD_DAYS.
	const dayColumns = 'grid flex-1 grid-cols-[repeat(14,minmax(2.25rem,1fr))]';

	function initials(name: string): string {
		return name
			.split(' ')
			.map((part) => part[0] ?? '')
			.join('')
			.slice(0, 2)
			.toUpperCase();
	}

	function isWeekend(day: CalendarDate): boolean {
		const weekday = day.toDate('UTC').getUTCDay();
		return weekday === 0 || weekday === 6;
	}
</script>

<svelte:head><title>{m.nav_home()} · {m.app_name()}</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold">{formatDayHeading(todayDate, locale)}</h1>
			<p class="text-muted-foreground">
				{away.length > 0 ? m.home_away_count({ count: away.length }) : m.home_everyone_in()}
			</p>
		</div>
		<Button variant="outline" href={resolve('/app/calendar')}>
			<CalendarIcon data-icon="inline-start" />
			{m.home_open_calendar()}
		</Button>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.home_board_title()}</Card.Title>
			<Card.Description>
				{formatWeekLabel(todayDate, days[days.length - 1], locale)}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if rows.length === 0}
				<Empty.Root class="border">
					<Empty.Header>
						<Empty.Media variant="icon"><TreePalmIcon /></Empty.Media>
						<Empty.Title>{m.home_board_empty_title()}</Empty.Title>
						<Empty.Description>
							{data.hasConnections
								? m.home_board_empty_description()
								: m.home_board_connect_description()}
						</Empty.Description>
					</Empty.Header>
					{#if !data.hasConnections}
						<Empty.Content>
							<div class="flex gap-2">
								<Button variant="outline" size="sm" href={resolve('/app/teams' as Pathname)}>
									{m.nav_teams()}
								</Button>
								<Button variant="outline" size="sm" href={resolve('/app/sharing' as Pathname)}>
									{m.nav_sharing()}
								</Button>
							</div>
						</Empty.Content>
					{/if}
				</Empty.Root>
			{:else}
				<Tooltip.Provider delayDuration={200}>
					<div class="overflow-x-auto">
						<div class="min-w-xl">
							<div class="flex">
								<div class="w-24 shrink-0 sm:w-32"></div>
								<div class={dayColumns}>
									{#each days as day, i (day.toString())}
										<div class="flex flex-col items-center gap-0.5 pb-1.5">
											<span class="text-[10px] text-muted-foreground uppercase">
												{weekdayFormat.format(day.toDate('UTC'))}
											</span>
											<span
												class={cn(
													'flex size-6 items-center justify-center rounded-full text-xs',
													i === 0 && 'bg-primary font-semibold text-primary-foreground'
												)}
											>
												{day.day}
											</span>
										</div>
									{/each}
								</div>
							</div>
							{#each rows as row (row.ownerId)}
								{@const rowName = row.ownerId === data.user.id ? m.home_you() : row.ownerName}
								<div class="flex border-t">
									<div class="flex w-24 shrink-0 items-center py-2 pr-2 sm:w-32">
										<span class="truncate text-sm font-medium">{rowName}</span>
									</div>
									<div class={dayColumns}>
										{#each days as day, i (day.toString())}
											<div
												style="grid-area: 1 / {i + 1}"
												class={cn(
													'min-h-10 border-l',
													isWeekend(day) && 'bg-muted/50',
													i === 0 && 'bg-primary/5'
												)}
											></div>
										{/each}
										{#each row.segments as segment (segment.event.id)}
											{@const range = formatWeekLabel(segment.span.start, segment.span.end, locale)}
											<Tooltip.Root>
												<Tooltip.Trigger>
													{#snippet child({ props })}
														<a
															{...props}
															href="{resolve('/app/calendar')}?view=week&date={days[
																segment.startIndex
															].toString()}"
															aria-label="{rowName} · {segment.event.title} · {range}"
															style="grid-area: 1 / {segment.startIndex +
																1} / auto / {segment.endIndex + 2}"
															class={cn(
																chipVariants({
																	color: segment.event.color,
																	continuesLeft: segment.continuesLeft,
																	continuesRight: segment.continuesRight
																}),
																'z-10 self-center',
																!segment.continuesLeft && 'ml-0.5',
																!segment.continuesRight && 'mr-0.5'
															)}
														>
															<span class="truncate">{segment.event.title}</span>
														</a>
													{/snippet}
												</Tooltip.Trigger>
												<Tooltip.Content>
													{segment.event.title} · {range}
												</Tooltip.Content>
											</Tooltip.Root>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</div>
				</Tooltip.Provider>
			{/if}
		</Card.Content>
		{#if rows.length > 0}
			<Card.Footer>
				<p class="text-xs text-muted-foreground">{m.home_board_footnote()}</p>
			</Card.Footer>
		{/if}
	</Card.Root>

	<div class="grid gap-6 md:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.home_away_now_title()}</Card.Title>
			</Card.Header>
			<Card.Content>
				{#if away.length === 0}
					<Empty.Root class="p-6">
						<Empty.Header>
							<Empty.Title class="text-sm">{m.home_everyone_in()}</Empty.Title>
						</Empty.Header>
					</Empty.Root>
				{:else}
					<div class="flex flex-col gap-4">
						{#each away as entry (entry.data.ownerId)}
							<div class="flex items-center gap-3">
								<Avatar.Root class="size-8">
									<Avatar.Fallback class="text-xs">
										{initials(entry.data.ownerName)}
									</Avatar.Fallback>
								</Avatar.Root>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">{entry.data.ownerName}</p>
									<p class="text-xs text-muted-foreground">
										{m.home_back_on({
											date: returnFormat.format(entry.lastDay.add({ days: 1 }).toDate('UTC'))
										})}
									</p>
								</div>
								<Badge variant="outline" class="shrink-0 gap-1.5">
									<span class={dotVariants({ color: entry.event.color })}></span>
									{eventTypeLabel(entry.data.type)}
								</Badge>
							</div>
						{/each}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.home_next_time_off_title()}</Card.Title>
			</Card.Header>
			<Card.Content>
				{#if upcoming.length === 0}
					<Empty.Root class="p-6">
						<Empty.Header>
							<Empty.Title class="text-sm">{m.home_next_time_off_empty_title()}</Empty.Title>
							<Empty.Description>{m.home_next_time_off_empty_description()}</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{:else}
					<div class="flex flex-col gap-4">
						{#each upcoming as entry (entry.event.id)}
							<div class="flex items-center gap-3">
								<span class={dotVariants({ color: entry.event.color })}></span>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">{entry.event.title}</p>
									<p class="text-xs text-muted-foreground">
										{formatWeekLabel(entry.span.start, entry.span.end, locale)}
									</p>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</div>
