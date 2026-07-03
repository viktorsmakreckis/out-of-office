<script lang="ts">
	import BellRingIcon from '@lucide/svelte/icons/bell-ring';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import { m } from '$lib/paraglide/messages.js';
	import boardDark from '$lib/assets/landing/board-dark.png';
	import boardLight from '$lib/assets/landing/board-light.png';
	import sharingDark from '$lib/assets/landing/sharing-dark.png';
	import sharingLight from '$lib/assets/landing/sharing-light.png';
</script>

<section id="features" class="scroll-mt-20 px-4 py-20 sm:px-6">
	<div class="mx-auto max-w-6xl">
		<h2 class="text-center text-3xl font-bold tracking-tight text-balance sm:text-4xl">
			{m.landing_features_title()}
		</h2>
		<p class="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
			{m.landing_features_subtitle()}
		</p>
		<div class="mt-12 grid gap-4 md:grid-cols-5">
			<article class="flex flex-col overflow-hidden rounded-2xl border bg-card md:col-span-3">
				<div class="p-6 pb-4">
					<h3 class="text-lg font-semibold tracking-tight">{m.landing_feature_board_title()}</h3>
					<p class="mt-1.5 text-sm text-muted-foreground">
						{m.landing_feature_board_description()}
					</p>
				</div>
				<div class="mt-auto h-64 pl-6">
					<img
						src={boardLight}
						alt={m.landing_feature_board_alt()}
						width="2368"
						height="1536"
						loading="lazy"
						class="h-full w-full rounded-tl-xl border-t border-l object-cover object-left-top dark:hidden"
					/>
					<img
						src={boardDark}
						alt={m.landing_feature_board_alt()}
						width="2368"
						height="1536"
						loading="lazy"
						class="hidden h-full w-full rounded-tl-xl border-t border-l object-cover object-left-top dark:block"
					/>
				</div>
			</article>
			<article class="rounded-2xl border bg-card p-6 md:col-span-2">
				<span
					class="flex size-10 items-center justify-center rounded-lg bg-sunset-100 text-sunset-600 dark:bg-sunset-500/15 dark:text-sunset-300"
				>
					<CalendarDaysIcon class="size-5" />
				</span>
				<h3 class="mt-4 text-lg font-semibold tracking-tight">
					{m.landing_feature_calendar_title()}
				</h3>
				<p class="mt-1.5 text-sm text-muted-foreground">
					{m.landing_feature_calendar_description()}
				</p>
			</article>
			<article class="rounded-2xl border bg-card p-6 md:col-span-2">
				<span
					class="flex size-10 items-center justify-center rounded-lg bg-sunset-100 text-sunset-600 dark:bg-sunset-500/15 dark:text-sunset-300"
				>
					<BellRingIcon class="size-5" />
				</span>
				<h3 class="mt-4 text-lg font-semibold tracking-tight">
					{m.landing_feature_notifications_title()}
				</h3>
				<p class="mt-1.5 text-sm text-muted-foreground">
					{m.landing_feature_notifications_description()}
				</p>
			</article>
			<article class="flex flex-col overflow-hidden rounded-2xl border bg-card md:col-span-3">
				<div class="p-6 pb-4">
					<h3 class="text-lg font-semibold tracking-tight">{m.landing_feature_sharing_title()}</h3>
					<p class="mt-1.5 text-sm text-muted-foreground">
						{m.landing_feature_sharing_description()}
					</p>
				</div>
				<div class="mt-auto h-64 pl-6">
					<img
						src={sharingLight}
						alt={m.landing_feature_sharing_alt()}
						width="2368"
						height="1536"
						loading="lazy"
						class="h-full w-full rounded-tl-xl border-t border-l object-cover object-left-top dark:hidden"
					/>
					<img
						src={sharingDark}
						alt={m.landing_feature_sharing_alt()}
						width="2368"
						height="1536"
						loading="lazy"
						class="hidden h-full w-full rounded-tl-xl border-t border-l object-cover object-left-top dark:block"
					/>
				</div>
			</article>
		</div>
	</div>
</section>
