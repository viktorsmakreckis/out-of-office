<script lang="ts">
	import LandingFaq from '$lib/components/landing/landing-faq.svelte';
	import LandingFeatures from '$lib/components/landing/landing-features.svelte';
	import LandingFooter from '$lib/components/landing/landing-footer.svelte';
	import LandingHero from '$lib/components/landing/landing-hero.svelte';
	import LandingHowItWorks from '$lib/components/landing/landing-how-it-works.svelte';
	import LandingNav from '$lib/components/landing/landing-nav.svelte';
	import { m } from '$lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>{m.app_name()} · {m.landing_meta_title()}</title>
	<meta name="description" content={m.landing_meta_description()} />
</svelte:head>

<div class="flex min-h-svh flex-col">
	<LandingNav />
	<main class="flex-1">
		<LandingHero />
		<LandingFeatures />
		<LandingHowItWorks />
		<LandingFaq />
	</main>
	<LandingFooter />
</div>
