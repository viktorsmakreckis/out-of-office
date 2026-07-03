<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import ReplyIcon from '@lucide/svelte/icons/reply';
	import { Button } from '$lib/components/ui/button';
	import { m } from '$lib/paraglide/messages.js';
	import calendarDark from '$lib/assets/landing/calendar-dark.png';
	import calendarLight from '$lib/assets/landing/calendar-light.png';
</script>

<section class="overflow-hidden px-4 pt-16 pb-10 sm:px-6 sm:pt-24">
	<div
		class="mx-auto flex max-w-6xl animate-in flex-col items-center text-center duration-700 fade-in slide-in-from-bottom-4 motion-reduce:animate-none"
	>
		<p
			class="flex items-center gap-2 rounded-full border border-sunset-200 bg-sunset-50 px-4 py-1.5 text-sm font-medium text-sunset-700 dark:border-sunset-500/30 dark:bg-sunset-500/10 dark:text-sunset-300"
		>
			<ReplyIcon class="size-4" />
			{m.landing_hero_chip()}
		</p>
		<h1 class="mt-6 max-w-3xl text-5xl font-extrabold tracking-tighter text-balance sm:text-7xl">
			<span class="text-sunset-500">{m.landing_hero_title_accent()}</span>
			{m.landing_hero_title_rest()}
		</h1>
		<p class="mt-6 max-w-xl text-lg text-pretty text-muted-foreground">
			{m.landing_hero_subtitle()}
		</p>
		<div class="mt-8 flex flex-wrap items-center justify-center gap-3">
			<Button
				size="lg"
				href={resolve('/signup' as Pathname)}
				class="bg-sunset-500 text-white hover:bg-sunset-600"
			>
				{m.landing_hero_cta_start()}
			</Button>
			<Button size="lg" variant="outline" href="#how-it-works">{m.landing_hero_cta_how()}</Button>
		</div>
	</div>

	<div
		class="relative mx-auto mt-16 max-w-5xl animate-in duration-700 fill-mode-backwards [animation-delay:150ms] fade-in slide-in-from-bottom-8 motion-reduce:animate-none sm:mt-20"
	>
		<div
			aria-hidden="true"
			class="absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--color-sunset-300),var(--color-sunset-500)_55%,transparent_72%)] opacity-80 blur-2xl sm:-top-36 sm:size-[28rem]"
		></div>
		<div class="relative overflow-hidden rounded-xl border shadow-2xl">
			<div class="flex h-8 items-center gap-1.5 border-b bg-muted px-3" aria-hidden="true">
				<span class="size-2.5 rounded-full bg-sunset-400"></span>
				<span class="size-2.5 rounded-full bg-sunset-300"></span>
				<span class="size-2.5 rounded-full bg-sunset-200"></span>
			</div>
			<img
				src={calendarLight}
				alt={m.landing_hero_screenshot_alt()}
				width="2048"
				height="1280"
				class="block w-full dark:hidden"
			/>
			<img
				src={calendarDark}
				alt={m.landing_hero_screenshot_alt()}
				width="2048"
				height="1280"
				class="hidden w-full dark:block"
			/>
		</div>
	</div>
</section>
