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
		{
			id: 'leave-1',
			title: 'Annual leave — Viktors',
			allDay: true,
			color: 'blue',
			start: day(2),
			end: day(6)
		},
		{
			id: 'leave-2',
			title: 'Annual leave — Marta',
			allDay: true,
			color: 'violet',
			start: day(4),
			end: day(11)
		},
		{ id: 'sick-1', title: 'Sick — Tom', allDay: true, color: 'red', start: day(4), end: day(4) },
		{
			id: 'offsite',
			title: 'Company offsite',
			allDay: true,
			color: 'amber',
			start: day(16),
			end: day(18)
		},
		{
			id: 'holiday',
			title: 'Public holiday',
			allDay: true,
			color: 'green',
			editable: false,
			start: day(14),
			end: day(14)
		},
		{
			id: 'busy-1',
			title: 'Busy',
			allDay: true,
			color: 'gray',
			editable: false,
			start: day(20),
			end: day(21)
		},
		{
			id: 'apt-1',
			title: 'Dentist',
			allDay: false,
			color: 'rose',
			start: at(4, 9),
			end: at(4, 10)
		},
		{
			id: 'apt-2',
			title: 'School run',
			allDay: false,
			color: 'gray',
			start: at(4, 15),
			end: at(4, 15, 30)
		},
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
			color: 'green',
			start: at(9, 10, 30),
			end: at(9, 11, 30)
		},
		{
			id: 'meet-3',
			title: 'Interview',
			allDay: false,
			color: 'violet',
			start: at(9, 10, 45),
			end: at(9, 12)
		},
		{
			id: 'focus',
			title: 'Focus block',
			allDay: false,
			color: 'amber',
			start: at(10, 13),
			end: at(10, 17)
		},
		{
			id: 'standup',
			title: 'Standup',
			allDay: false,
			color: 'blue',
			start: at(10, 9, 15),
			end: at(10, 9, 30)
		},
		{
			id: 'half-day',
			title: 'Half day — Ana',
			allDay: false,
			color: 'rose',
			start: at(24, 13),
			end: at(24, 17, 30)
		},
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

<svelte:head><title>{m.nav_calendar()} · {m.app_name()}</title></svelte:head>

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
			existing.id === event.id ? ({ ...existing, ...change } as CalendarEvent) : existing
		);
		toast.success(`Updated "${event.title}"`);
	}}
/>
