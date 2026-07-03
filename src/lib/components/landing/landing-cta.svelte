<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { m } from '$lib/paraglide/messages.js';
</script>

<section class="px-4 py-20 sm:px-6">
	<div
		class="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-linear-to-br from-sunset-400 via-sunset-600 to-sunset-700 px-6 py-16 text-center sm:py-24"
	>
		<div
			aria-hidden="true"
			class="absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full bg-sunset-200/40 blur-3xl"
		></div>
		<h2
			class="relative mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-balance text-white sm:text-5xl"
		>
			{m.landing_cta_title()}
		</h2>
		<p class="relative mt-4 text-lg text-white">{m.landing_cta_subtitle()}</p>
		<Button
			size="lg"
			href={resolve('/signup' as Pathname)}
			class="relative mt-8 bg-white text-sunset-700 hover:bg-white/90"
		>
			{m.landing_cta_button()}
		</Button>
	</div>
</section>
