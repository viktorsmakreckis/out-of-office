<script lang="ts">
	import { toast } from 'svelte-sonner';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
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
		<AlertDialog.Root>
			<AlertDialog.Trigger>
				{#snippet child({ props })}
					<Button {...props} type="button" variant="outline">{m.feed_regenerate_cta()}</Button>
				{/snippet}
			</AlertDialog.Trigger>
			<AlertDialog.Content>
				<AlertDialog.Header>
					<AlertDialog.Title>{m.feed_regenerate_confirm_title()}</AlertDialog.Title>
					<AlertDialog.Description>
						{m.feed_regenerate_confirm_description()}
					</AlertDialog.Description>
				</AlertDialog.Header>
				<AlertDialog.Footer>
					<AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel>
					<form method="POST" action="?/regenerateFeed">
						<Button type="submit" variant="destructive">{m.feed_regenerate_cta()}</Button>
					</form>
				</AlertDialog.Footer>
			</AlertDialog.Content>
		</AlertDialog.Root>
	</div>
</div>
