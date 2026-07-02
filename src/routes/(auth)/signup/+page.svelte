<script lang="ts">
	import { onMount } from 'svelte';
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
	import { signupSchema } from '$lib/schemas/auth';
	import { toFieldErrors } from '$lib/utils';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, constraints, submitting, enhance } = superForm(data.form, {
		validators: zod4Client(signupSchema)
	});

	onMount(() => {
		$form.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});
</script>

<svelte:head><title>{m.auth_signup_title()} · {m.app_name()}</title></svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.auth_signup_title()}</Card.Title>
		<Card.Description>{m.auth_signup_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" use:enhance>
			<input type="hidden" name="timezone" bind:value={$form.timezone} />
			<input type="hidden" name="locale" bind:value={$form.locale} />
			<Field.Group>
				<Field.Error errors={toFieldErrors($errors._errors as string[] | undefined)} />
				<Field.Field data-invalid={!!$errors.name || undefined}>
					<Field.Label for="signup-name">{m.auth_name_label()}</Field.Label>
					<Input
						id="signup-name"
						name="name"
						autocomplete="name"
						bind:value={$form.name}
						aria-invalid={$errors.name ? 'true' : undefined}
						{...$constraints.name}
					/>
					<Field.Error errors={toFieldErrors($errors.name as string[] | undefined)} />
				</Field.Field>
				<Field.Field data-invalid={!!$errors.email || undefined}>
					<Field.Label for="signup-email">{m.auth_email_label()}</Field.Label>
					<Input
						id="signup-email"
						type="email"
						name="email"
						autocomplete="email"
						bind:value={$form.email}
						aria-invalid={$errors.email ? 'true' : undefined}
						{...$constraints.email}
					/>
					<Field.Error errors={toFieldErrors($errors.email as string[] | undefined)} />
				</Field.Field>
				<Field.Field data-invalid={!!$errors.password || undefined}>
					<Field.Label for="signup-password">{m.auth_password_label()}</Field.Label>
					<Input
						id="signup-password"
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
					{m.auth_signup_cta()}
				</Button>
			</Field.Group>
		</form>
	</Card.Content>
	<Card.Footer class="justify-center gap-1 text-sm">
		<span class="text-muted-foreground">{m.auth_have_account()}</span>
		<a class="underline underline-offset-4" href={resolve('/login' as Pathname)}>
			{m.auth_login_cta()}
		</a>
	</Card.Footer>
</Card.Root>
