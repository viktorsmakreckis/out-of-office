<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { m } from '$lib/paraglide/messages.js';

	let { url, description }: { url: string; description: string } = $props();

	async function copy() {
		try {
			await navigator.clipboard.writeText(url);
			toast.success(m.feed_copied());
		} catch {
			toast.error(m.error_generic());
		}
	}
</script>

<div class="grid gap-2">
	<p class="text-sm text-muted-foreground">{description}</p>
	<div class="flex gap-2">
		<Input readonly value={url} class="font-mono text-xs" />
		<Button type="button" variant="outline" onclick={copy}>{m.feed_copy_cta()}</Button>
		<form method="POST" action="?/regenerateFeed">
			<Button type="submit" variant="outline">{m.feed_regenerate_cta()}</Button>
		</form>
	</div>
</div>
