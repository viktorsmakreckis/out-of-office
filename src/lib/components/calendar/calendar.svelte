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
	<CalendarHeader
		{view}
		{label}
		onViewChange={(next) => (view = next)}
		onNavigate={navigate}
		{headerActions}
	/>
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
