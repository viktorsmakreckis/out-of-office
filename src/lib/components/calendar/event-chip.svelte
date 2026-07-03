<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	export const chipVariants = tv({
		base: 'flex h-5 w-full min-w-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-left text-xs font-medium select-none focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px]',
		variants: {
			color: {
				blue: 'bg-blue-500/15 text-blue-800 hover:bg-blue-500/25 dark:text-blue-200',
				green: 'bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25 dark:text-emerald-200',
				amber: 'bg-amber-500/20 text-amber-800 hover:bg-amber-500/30 dark:text-amber-200',
				red: 'bg-red-500/15 text-red-800 hover:bg-red-500/25 dark:text-red-200',
				violet: 'bg-violet-500/15 text-violet-800 hover:bg-violet-500/25 dark:text-violet-200',
				rose: 'bg-rose-500/15 text-rose-800 hover:bg-rose-500/25 dark:text-rose-200',
				gray: 'bg-muted-foreground/15 text-foreground hover:bg-muted-foreground/25'
			},
			continuesLeft: { true: 'rounded-l-none' },
			continuesRight: { true: 'rounded-r-none' }
		},
		defaultVariants: { color: 'gray' }
	});

	export const blockVariants = tv({
		base: 'flex h-full w-full cursor-pointer flex-col items-start overflow-hidden rounded-md border-l-2 px-1.5 py-0.5 text-left text-xs select-none focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px]',
		variants: {
			color: {
				blue: 'border-blue-600 bg-blue-500/15 text-blue-800 hover:bg-blue-500/25 dark:text-blue-200',
				green:
					'border-emerald-600 bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25 dark:text-emerald-200',
				amber:
					'border-amber-600 bg-amber-500/20 text-amber-800 hover:bg-amber-500/30 dark:text-amber-200',
				red: 'border-red-600 bg-red-500/15 text-red-800 hover:bg-red-500/25 dark:text-red-200',
				violet:
					'border-violet-600 bg-violet-500/15 text-violet-800 hover:bg-violet-500/25 dark:text-violet-200',
				rose: 'border-rose-600 bg-rose-500/15 text-rose-800 hover:bg-rose-500/25 dark:text-rose-200',
				gray: 'border-muted-foreground bg-muted-foreground/15 text-foreground hover:bg-muted-foreground/25'
			}
		},
		defaultVariants: { color: 'gray' }
	});

	export const dotVariants = tv({
		base: 'size-2 shrink-0 rounded-full',
		variants: {
			color: {
				blue: 'bg-blue-500',
				green: 'bg-emerald-500',
				amber: 'bg-amber-500',
				red: 'bg-red-500',
				violet: 'bg-violet-500',
				rose: 'bg-rose-500',
				gray: 'bg-muted-foreground'
			}
		},
		defaultVariants: { color: 'gray' }
	});
</script>

<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { formatTime } from './core/format.js';
	import type { CalendarEvent } from './core/types.js';

	let {
		event,
		locale,
		continuesLeft = false,
		continuesRight = false,
		eventContent,
		class: className,
		...restProps
	}: {
		event: CalendarEvent<T>;
		locale: string;
		continuesLeft?: boolean;
		continuesRight?: boolean;
		eventContent?: Snippet<[CalendarEvent<T>]>;
	} & HTMLButtonAttributes = $props();
</script>

<button
	type="button"
	class={cn(chipVariants({ color: event.color, continuesLeft, continuesRight }), className)}
	{...restProps}
	data-slot="calendar-event-chip"
>
	{#if eventContent}
		{@render eventContent(event)}
	{:else}
		{#if !event.allDay}
			<span class="shrink-0 opacity-70">{formatTime(event.start, locale)}</span>
		{/if}
		<span class="truncate">{event.title}</span>
	{/if}
</button>
