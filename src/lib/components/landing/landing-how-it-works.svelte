<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';

	const steps = [
		{ number: 1, title: m.landing_how_step1_title, description: m.landing_how_step1_description },
		{ number: 2, title: m.landing_how_step2_title, description: m.landing_how_step2_description },
		{ number: 3, title: m.landing_how_step3_title, description: m.landing_how_step3_description }
	];
</script>

<section
	id="how-it-works"
	class="scroll-mt-20 bg-sunset-50 px-4 py-20 sm:px-6 dark:bg-sunset-500/5"
>
	<div class="mx-auto max-w-6xl">
		<h2 class="text-center text-3xl font-bold tracking-tight text-balance sm:text-4xl">
			{m.landing_how_title()}
		</h2>
		<ol class="mx-auto mt-12 grid max-w-4xl gap-10 md:grid-cols-3">
			{#each steps as step (step.number)}
				<li>
					<span
						class="flex size-8 items-center justify-center rounded-full bg-sunset-500 text-sm font-bold text-white"
					>
						{step.number}
					</span>
					<h3 class="mt-4 font-semibold tracking-tight">{step.title()}</h3>
					<p class="mt-1.5 text-sm text-muted-foreground">{step.description()}</p>
				</li>
			{/each}
		</ol>
	</div>
</section>
