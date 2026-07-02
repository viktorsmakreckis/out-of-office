<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import { superForm } from 'sveltekit-superforms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Spinner } from '$lib/components/ui/spinner';
	import { m } from '$lib/paraglide/messages.js';
	import { toFieldErrors } from '$lib/utils';

	let { data } = $props();

	const { form, errors, submitting, enhance } = superForm(data.form);
</script>

<svelte:head><title>{m.auth_verify_title()} · {m.app_name()}</title></svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.auth_verify_title()}</Card.Title>
		<Card.Description>{m.auth_verify_description({ email: $form.email as string })}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" use:enhance class="grid gap-3">
			<Field.Error errors={toFieldErrors($errors._errors as string[] | undefined)} />
			<input type="hidden" name="email" bind:value={$form.email} />
			<Button type="submit" variant="outline" disabled={$submitting}>
				{#if $submitting}<Spinner />{/if}
				{m.auth_verify_resend()}
			</Button>
		</form>
	</Card.Content>
	<Card.Footer class="justify-center text-sm">
		<a class="underline underline-offset-4" href={resolve('/login' as Pathname)}>
			{m.auth_back_to_login()}
		</a>
	</Card.Footer>
</Card.Root>
