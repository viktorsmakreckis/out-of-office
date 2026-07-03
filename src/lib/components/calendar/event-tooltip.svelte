<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
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
		trigger: Snippet<[Record<string, unknown>]>;
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
				{@render trigger(props)}
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content class="flex-col items-start gap-0.5">
			<span class="break-words">{event.title}</span>
			<span class="opacity-70">{whenLabel}</span>
		</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>
