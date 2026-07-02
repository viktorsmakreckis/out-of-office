<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { m } from '$lib/paraglide/messages.js';
	import { resetPasswordSchema } from '$lib/schemas/auth';
	import { toFieldErrors } from '$lib/utils';

	let { data } = $props();

	const { form, errors, constraints, submitting, enhance } = superForm(data.form, {
		validators: zod4Client(resetPasswordSchema)
	});
</script>

<svelte:head><title>{m.auth_reset_title()} · {m.app_name()}</title></svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.auth_reset_title()}</Card.Title>
	</Card.Header>
	<Card.Content>
		<form method="POST" use:enhance>
			<input type="hidden" name="token" bind:value={$form.token} />
			<Field.Group>
				<Field.Error errors={toFieldErrors($errors._errors as string[] | undefined)} />
				<Field.Field data-invalid={!!$errors.password || undefined}>
					<Field.Label for="reset-password">{m.auth_new_password_label()}</Field.Label>
					<Input
						id="reset-password"
						type="password"
						name="password"
						autocomplete="new-password"
						bind:value={$form.password}
						aria-invalid={$errors.password ? 'true' : undefined}
						{...$constraints.password}
					/>
					<Field.Error errors={toFieldErrors($errors.password as string[] | undefined)} />
				</Field.Field>
				<Button type="submit" disabled={$submitting}>
					{#if $submitting}<Spinner />{/if}
					{m.auth_reset_cta()}
				</Button>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>
