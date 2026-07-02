<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Item from '$lib/components/ui/item';
	import { Spinner } from '$lib/components/ui/spinner';
	import { m } from '$lib/paraglide/messages.js';
	import { createTeamSchema } from '$lib/schemas/team';
	import { toFieldErrors } from '$lib/utils';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, constraints, submitting, enhance } = superForm(data.createForm, {
		validators: zod4Client(createTeamSchema)
	});

	const roleLabels: Record<string, string> = {
		owner: m.team_role_owner(),
		admin: m.team_role_admin(),
		member: m.team_role_member()
	};
</script>

<svelte:head><title>{m.teams_title()} · {m.app_name()}</title></svelte:head>

<div class="mx-auto grid max-w-xl gap-6">
	<h1 class="text-2xl font-semibold">{m.teams_title()}</h1>

	{#if data.teams.length === 0}
		<Empty.Root>
			<Empty.Title>{m.teams_empty()}</Empty.Title>
		</Empty.Root>
	{:else}
		<div class="grid gap-2">
			{#each data.teams as team (team.id)}
				<Item.Root variant="outline">
					{#snippet child({ props })}
						<a href={resolve(`/app/teams/${team.id}` as Pathname)} {...props}>
							<Item.Content>
								<Item.Title>{team.name}</Item.Title>
							</Item.Content>
							<Item.Actions>
								<Badge variant="secondary">{roleLabels[team.role] ?? team.role}</Badge>
							</Item.Actions>
						</a>
					{/snippet}
				</Item.Root>
			{/each}
		</div>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.teams_create_title()}</Card.Title>
			<Card.Description>{m.teams_create_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/create" use:enhance>
				<Field.Group>
					<Field.Field data-invalid={!!$errors.name || undefined}>
						<Field.Label for="team-name">{m.team_name_label()}</Field.Label>
						<Input
							id="team-name"
							name="name"
							bind:value={$form.name}
							aria-invalid={$errors.name ? 'true' : undefined}
							{...$constraints.name}
						/>
						<Field.Error errors={toFieldErrors($errors.name)} />
					</Field.Field>
					<div>
						<Button type="submit" disabled={$submitting}>
							{#if $submitting}<Spinner />{/if}
							{m.teams_create_cta()}
						</Button>
					</div>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>
</div>
