<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { m } from '$lib/paraglide/messages.js';
</script>

<footer class="border-t px-4 py-10 sm:px-6">
	<div class="mx-auto flex max-w-6xl flex-col justify-between gap-6 sm:flex-row sm:items-center">
		<div>
			<p class="flex items-center gap-2 font-semibold tracking-tight">
				<span class="flex size-6 items-center justify-center rounded-full bg-sunset-500 text-white">
					<SunIcon class="size-4" />
				</span>
				{m.app_name()}
			</p>
			<p class="mt-2 text-sm text-muted-foreground">{m.landing_footer_tagline()}</p>
		</div>
		<nav
			aria-label={m.landing_footer_nav_aria()}
			class="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground"
		>
			<a href="#features" class="transition-colors hover:text-foreground"
				>{m.landing_nav_features()}</a
			>
			<a href="#how-it-works" class="transition-colors hover:text-foreground">
				{m.landing_nav_how_it_works()}
			</a>
			<a href="#faq" class="transition-colors hover:text-foreground">{m.landing_nav_faq()}</a>
			<a href={resolve('/login' as Pathname)} class="transition-colors hover:text-foreground">
				{m.landing_nav_login()}
			</a>
			<a href={resolve('/signup' as Pathname)} class="transition-colors hover:text-foreground">
				{m.landing_nav_signup()}
			</a>
		</nav>
	</div>
	<p class="mx-auto mt-8 max-w-6xl text-sm text-muted-foreground">
		{m.landing_footer_copyright({ year: new Date().getFullYear().toString() })}
	</p>
</footer>
