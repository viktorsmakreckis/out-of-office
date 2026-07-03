<script lang="ts">
	import { parseDate, toCalendarDate, type CalendarDate } from '@internationalized/date';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import {
		Calendar,
		type CalendarEvent,
		type EventChange,
		type RangeSelection
	} from '$lib/components/calendar';
	import { formatTimeOfDay, toCalendarEvent } from '$lib/events';
	import { m } from '$lib/paraglide/messages.js';
	import { moveEventSchema } from '$lib/schemas/event';
	import EventDialog from './event-dialog.svelte';

	let { data } = $props();
	// svelte-ignore state_referenced_locally
	let view = $state(data.view);
	// svelte-ignore state_referenced_locally
	let date = $state(parseDate(data.date));
	// svelte-ignore state_referenced_locally
	let filter = $state(data.filter);

	const filterLabels = {
		all: m.calendar_filter_all(),
		mine: m.calendar_filter_mine(),
		teams: m.calendar_filter_teams(),
		shared: m.calendar_filter_shared()
	} as const;

	let dialog: ReturnType<typeof EventDialog> | undefined = $state();

	type Record = (typeof data.records)[number];

	// In-flight move/resize shown at its dropped position: the calendar reverts its
	// drag preview on pointerup, and the persisted change only arrives with the next
	// load — without this the event would snap back until the round-trip completes.
	// Tied to the records array it was created against, so it self-disables as soon
	// as fresh records (which already contain the persisted change) arrive.
	// $state.raw: deep-proxying would break the identity check against data.records.
	let pendingMove = $state.raw<{ records: unknown; event: CalendarEvent<Record> } | null>(null);

	const events = $derived(
		data.records.map((record) => {
			const event = toCalendarEvent(record, data.user.timezone);
			if (record.ownerId !== data.user.id) {
				return { ...event, title: `${record.ownerName} · ${event.title}`, editable: false };
			}
			return pendingMove?.records === data.records && pendingMove.event.id === event.id
				? pendingMove.event
				: event;
		})
	);
	const actionParams = $derived(`&view=${view}&date=${date.toString()}&filter=${filter}`);

	// svelte-ignore state_referenced_locally
	const {
		form: moveForm,
		enhance: moveEnhance,
		submit: submitMove
	} = superForm(data.moveForm, {
		id: 'move',
		validators: zod4Client(moveEventSchema),
		onUpdated({ form }) {
			if (!form.valid) {
				pendingMove = null;
				toast.error(m.error_generic());
			}
		},
		onError: () => {
			pendingMove = null;
			toast.error(m.error_generic());
		}
	});

	function handleDayClick(day: CalendarDate) {
		dialog?.openCreate({ allDay: true, startDate: day.toString(), endDate: day.toString() });
	}

	function handleRangeSelect(range: RangeSelection) {
		if (range.allDay) {
			dialog?.openCreate({
				allDay: true,
				startDate: range.start.toString(),
				endDate: range.end.toString()
			});
		} else {
			dialog?.openCreate({
				allDay: false,
				startDate: toCalendarDate(range.start).toString(),
				endDate: toCalendarDate(range.end).toString(),
				startTime: formatTimeOfDay(range.start),
				endTime: formatTimeOfDay(range.end)
			});
		}
	}

	function handleEventClick(event: CalendarEvent<Record>) {
		if (event.data && event.data.ownerId === data.user.id) dialog?.openEdit(event.data);
	}

	async function handleEventChange(event: CalendarEvent<Record>, change: EventChange) {
		pendingMove = {
			records: data.records,
			// Safe cast: the component guarantees change.allDay matches event.allDay.
			event: { ...event, ...change } as CalendarEvent<Record>
		};
		$moveForm.id = event.id;
		$moveForm.allDay = change.allDay;
		$moveForm.start = change.start.toString();
		$moveForm.end = change.end.toString();
		await tick();
		submitMove();
	}

	$effect(() => {
		const params = new URLSearchParams({ view, date: date.toString(), filter });
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
	onDayClick={handleDayClick}
	onEventClick={handleEventClick}
	onRangeSelect={handleRangeSelect}
	onEventChange={handleEventChange}
>
	{#snippet headerActions()}
		<ToggleGroup.Root
			type="single"
			value={filter}
			onValueChange={(value) => {
				if (value) filter = value as typeof filter;
			}}
			variant="outline"
			aria-label={m.calendar_filter_label()}
		>
			{#each Object.entries(filterLabels) as [key, label] (key)}
				<ToggleGroup.Item value={key} aria-label={label}>{label}</ToggleGroup.Item>
			{/each}
		</ToggleGroup.Root>
		<Button onclick={() => dialog?.openCreate()}>{m.calendar_event_add()}</Button>
	{/snippet}
</Calendar>

<EventDialog
	bind:this={dialog}
	eventForm={data.eventForm}
	deleteForm={data.deleteForm}
	timezone={data.user.timezone}
	{actionParams}
/>

<form method="POST" action={`?/move${actionParams}`} use:moveEnhance class="hidden">
	<input type="hidden" name="id" value={$moveForm.id} />
	<input type="hidden" name="allDay" value={$moveForm.allDay} />
	<input type="hidden" name="start" value={$moveForm.start} />
	<input type="hidden" name="end" value={$moveForm.end} />
</form>
