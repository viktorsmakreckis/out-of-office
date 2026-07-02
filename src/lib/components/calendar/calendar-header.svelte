<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages.js';
	import type { CalendarView } from './core/types.js';

	let {
		view,
		label,
		onViewChange,
		onNavigate,
		headerActions
	}: {
		view: CalendarView;
		label: string;
		onViewChange: (view: CalendarView) => void;
		onNavigate: (target: 'previous' | 'today' | 'next') => void;
		headerActions?: Snippet;
	} = $props();
</script>

<div class="flex flex-wrap items-center gap-2">
	<div class="flex items-center gap-1">
		<Tooltip.Provider delayDuration={300}>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon"
							aria-label={m.calendar_previous()}
							onclick={() => onNavigate('previous')}
						>
							<ChevronLeftIcon />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>{m.calendar_previous()}</Tooltip.Content>
			</Tooltip.Root>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon"
							aria-label={m.calendar_next()}
							onclick={() => onNavigate('next')}
						>
							<ChevronRightIcon />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>{m.calendar_next()}</Tooltip.Content>
			</Tooltip.Root>
		</Tooltip.Provider>
		<Button variant="outline" size="sm" onclick={() => onNavigate('today')}>
			{m.calendar_today()}
		</Button>
	</div>
	<h2 class="min-w-0 flex-1 truncate text-lg font-semibold">{label}</h2>
	<ToggleGroup.Root
		type="single"
		variant="outline"
		value={view}
		onValueChange={(value) => {
			if (value) onViewChange(value as CalendarView);
		}}
	>
		<ToggleGroup.Item value="month">{m.calendar_view_month()}</ToggleGroup.Item>
		<ToggleGroup.Item value="week">{m.calendar_view_week()}</ToggleGroup.Item>
		<ToggleGroup.Item value="agenda">{m.calendar_view_agenda()}</ToggleGroup.Item>
	</ToggleGroup.Root>
	{#if headerActions}
		{@render headerActions()}
	{/if}
</div>
