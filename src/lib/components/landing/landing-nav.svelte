<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { Button } from '$lib/components/ui/button';
	import { m } from '$lib/paraglide/messages.js';
</script>

<header class="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
	<nav
		aria-label={m.landing_nav_aria()}
		class="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6"
	>
		<a href={resolve('/' as Pathname)} class="flex items-center gap-2 font-semibold tracking-tight">
			<span class="flex size-6 items-center justify-center rounded-full bg-sunset-500 text-white">
				<SunIcon class="size-4" />
			</span>
			{m.app_name()}
		</a>
		<div class="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
			<a href="#features" class="transition-colors hover:text-foreground"
				>{m.landing_nav_features()}</a
			>
			<a href="#how-it-works" class="transition-colors hover:text-foreground">
				{m.landing_nav_how_it_works()}
			</a>
			<a href="#faq" class="transition-colors hover:text-foreground">{m.landing_nav_faq()}</a>
		</div>
		<div class="flex items-center gap-2">
			<Button variant="ghost" href={resolve('/login' as Pathname)}>{m.landing_nav_login()}</Button>
			<Button
				href={resolve('/signup' as Pathname)}
				class="bg-sunset-500 text-white hover:bg-sunset-600"
			>
				{m.landing_nav_signup()}
			</Button>
		</div>
	</nav>
</header>
