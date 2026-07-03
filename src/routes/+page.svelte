<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>{m.app_name()}</title>
</svelte:head>

<main class="flex min-h-svh items-center justify-center">
	<h1 class="text-2xl font-semibold tracking-tight">{m.app_name()}</h1>
</main>
