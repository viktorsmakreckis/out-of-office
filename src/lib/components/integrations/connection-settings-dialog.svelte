<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { m } from '$lib/paraglide/messages.js';

	type ConnectionRow = {
		id: string;
		notifyOoo: boolean;
		notifyDigest: boolean;
	};

	let { row }: { row: ConnectionRow } = $props();

	/** Submit a single-toggle form by writing the value into its hidden input. */
	function submitToggle(formId: string, inputName: string, value: boolean) {
		const form = document.getElementById(formId);
		if (!(form instanceof HTMLFormElement)) return;
		const input = form.querySelector(`input[name="${inputName}"]`);
		if (input instanceof HTMLInputElement) {
			input.value = String(value);
			form.requestSubmit();
		}
	}
</script>

<Dialog.Root>
	<Dialog.Trigger class={buttonVariants({ variant: 'outline', size: 'sm' })}>
		{m.connection_settings_cta()}
	</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.connection_settings_title()}</Dialog.Title>
		</Dialog.Header>
		<div class="grid gap-4">
			<form
				id="notify-form-{row.id}"
				method="POST"
				action="?/updateConnectionNotify"
				use:enhance
				class="flex items-center justify-between gap-2"
			>
				<input type="hidden" name="id" value={row.id} />
				<input type="hidden" name="notifyOoo" value={String(row.notifyOoo)} />
				<Label for="notify-{row.id}">{m.integrations_notify_ooo_label()}</Label>
				<Switch
					id="notify-{row.id}"
					checked={row.notifyOoo}
					onCheckedChange={(value) => submitToggle(`notify-form-${row.id}`, 'notifyOoo', value)}
				/>
			</form>

			<form
				id="digest-form-{row.id}"
				method="POST"
				action="?/updateConnectionDigest"
				use:enhance
				class="flex items-center justify-between gap-2"
			>
				<input type="hidden" name="id" value={row.id} />
				<input type="hidden" name="notifyDigest" value={String(row.notifyDigest)} />
				<Label for="digest-{row.id}">{m.integrations_notify_digest_label()}</Label>
				<Switch
					id="digest-{row.id}"
					checked={row.notifyDigest}
					onCheckedChange={(value) => submitToggle(`digest-form-${row.id}`, 'notifyDigest', value)}
				/>
			</form>
		</div>
		<Dialog.Footer class="justify-between">
			<form method="POST" action="?/testConnection" use:enhance>
				<input type="hidden" name="id" value={row.id} />
				<Button type="submit" variant="outline" size="sm">{m.integrations_test_cta()}</Button>
			</form>
			<form method="POST" action="?/removeConnection" use:enhance>
				<input type="hidden" name="id" value={row.id} />
				<Button type="submit" variant="ghost" size="sm">{m.integrations_remove_cta()}</Button>
			</form>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
