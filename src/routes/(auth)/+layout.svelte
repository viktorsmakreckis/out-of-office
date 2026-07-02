<script lang="ts">
	let { children } = $props();
</script>

<main class="flex min-h-svh items-center justify-center bg-muted/40 p-4">
	<div class="w-full max-w-sm">
		{@render children()}
	</div>
</main>
