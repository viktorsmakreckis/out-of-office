<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { m } from '$lib/paraglide/messages.js';
	import { forgotPasswordSchema } from '$lib/schemas/auth';
	import { toFieldErrors } from '$lib/utils';

	let { data } = $props();

	const { form, errors, constraints, submitting, enhance } = superForm(data.form, {
		validators: zod4Client(forgotPasswordSchema)
	});
</script>

<svelte:head><title>{m.auth_forgot_title()} · {m.app_name()}</title></svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.auth_forgot_title()}</Card.Title>
		<Card.Description>{m.auth_forgot_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" use:enhance>
			<Field.Group>
				<Field.Field data-invalid={!!$errors.email || undefined}>
					<Field.Label for="forgot-email">{m.auth_email_label()}</Field.Label>
					<Input
						id="forgot-email"
						type="email"
						name="email"
						autocomplete="email"
						bind:value={$form.email}
						aria-invalid={$errors.email ? 'true' : undefined}
						{...$constraints.email}
					/>
					<Field.Error errors={toFieldErrors($errors.email as string[] | undefined)} />
				</Field.Field>
				<Button type="submit" disabled={$submitting}>
					{#if $submitting}<Spinner />{/if}
					{m.auth_forgot_cta()}
				</Button>
			</Field.Group>
		</form>
	</Card.Content>
	<Card.Footer class="justify-center text-sm">
		<a class="underline underline-offset-4" href={resolve('/login' as Pathname)}>{m.auth_back_to_login()}</a>
	</Card.Footer>
</Card.Root>
