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
	import { loginSchema } from '$lib/schemas/auth';
	import { toFieldErrors } from '$lib/utils';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, constraints, submitting, enhance } = superForm(data.form, {
		validators: zod4Client(loginSchema)
	});
</script>

<svelte:head><title>{m.auth_login_title()} · {m.app_name()}</title></svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.auth_login_title()}</Card.Title>
		<Card.Description>{m.auth_login_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" use:enhance>
			<Field.Group>
				<Field.Error errors={toFieldErrors($errors._errors)} />
				<Field.Field data-invalid={!!$errors.email || undefined}>
					<Field.Label for="login-email">{m.auth_email_label()}</Field.Label>
					<Input
						id="login-email"
						type="email"
						name="email"
						autocomplete="email"
						bind:value={$form.email}
						aria-invalid={$errors.email ? 'true' : undefined}
						{...$constraints.email}
					/>
					<Field.Error errors={toFieldErrors($errors.email)} />
				</Field.Field>
				<Field.Field data-invalid={!!$errors.password || undefined}>
					<div class="flex items-center justify-between">
						<Field.Label for="login-password">{m.auth_password_label()}</Field.Label>
						<a class="text-sm underline underline-offset-4" href={resolve('/forgot-password' as Pathname)}>
							{m.auth_forgot_password()}
						</a>
					</div>
					<Input
						id="login-password"
						type="password"
						name="password"
						autocomplete="current-password"
						bind:value={$form.password}
						aria-invalid={$errors.password ? 'true' : undefined}
						{...$constraints.password}
					/>
					<Field.Error errors={toFieldErrors($errors.password)} />
				</Field.Field>
				<Button type="submit" disabled={$submitting}>
					{#if $submitting}<Spinner />{/if}
					{m.auth_login_cta()}
				</Button>
			</Field.Group>
		</form>
	</Card.Content>
	<Card.Footer class="justify-center gap-1 text-sm">
		<span class="text-muted-foreground">{m.auth_no_account()}</span>
		<a class="underline underline-offset-4" href={resolve('/signup' as Pathname)}>{m.auth_signup_cta()}</a>
	</Card.Footer>
</Card.Root>
