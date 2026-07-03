<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Item from '$lib/components/ui/item';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { m } from '$lib/paraglide/messages.js';
	import { shareTargetSchema } from '$lib/schemas/share';
	import { toFieldErrors } from '$lib/utils';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, submitting, enhance } = superForm(data.shareForm, {
		id: 'share',
		validators: zod4Client(shareTargetSchema)
	});

	const selectedTeamName = $derived(
		data.allTeams.find((team) => team.id === $form.teamId)?.name ?? ''
	);
</script>

<svelte:head><title>{m.sharing_title()} · {m.app_name()}</title></svelte:head>

<div class="mx-auto grid max-w-xl gap-6">
	<h1 class="text-2xl font-semibold">{m.sharing_title()}</h1>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.share_form_title()}</Card.Title>
			<Card.Description>{m.share_form_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/share" use:enhance>
				<Field.Group>
					<Field.Field>
						<Field.Label>{m.share_target_label()}</Field.Label>
						<RadioGroup.Root bind:value={$form.targetType} name="targetType" class="flex gap-6">
							<Field.Field orientation="horizontal" class="w-fit">
								<RadioGroup.Item id="share-person" value="person" />
								<Field.Label for="share-person">
									{m.share_target_person()}
								</Field.Label>
							</Field.Field>
							<Field.Field orientation="horizontal" class="w-fit">
								<RadioGroup.Item id="share-team" value="team" />
								<Field.Label for="share-team">
									{m.share_target_team()}
								</Field.Label>
							</Field.Field>
						</RadioGroup.Root>
					</Field.Field>
					{#if $form.targetType === 'team'}
						<Field.Field data-invalid={!!$errors.teamId || undefined}>
							<Field.Label for="share-team">{m.share_team_label()}</Field.Label>
							<Select.Root type="single" name="teamId" bind:value={$form.teamId}>
								<Select.Trigger id="share-team" class="w-full">{selectedTeamName}</Select.Trigger>
								<Select.Content>
									<Select.Group>
										{#each data.allTeams as team (team.id)}
											<Select.Item value={team.id}>{team.name}</Select.Item>
										{/each}
									</Select.Group>
								</Select.Content>
							</Select.Root>
							<Field.Error errors={toFieldErrors($errors.teamId)} />
						</Field.Field>
					{:else}
						<Field.Field data-invalid={!!$errors.email || undefined}>
							<Field.Label for="share-email">{m.share_email_label()}</Field.Label>
							<Input
								id="share-email"
								type="email"
								name="email"
								bind:value={$form.email}
								aria-invalid={$errors.email ? 'true' : undefined}
							/>
							<Field.Error errors={toFieldErrors($errors.email)} />
						</Field.Field>
					{/if}
					<div>
						<Button type="submit" disabled={$submitting}>
							{#if $submitting}<Spinner />{/if}
							{m.share_cta()}
						</Button>
					</div>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header><Card.Title>{m.share_by_you_title()}</Card.Title></Card.Header>
		<Card.Content class="grid gap-2">
			{#if data.givenShares.length === 0}
				<p class="text-muted-foreground text-sm">{m.share_empty()}</p>
			{/if}
			{#each data.givenShares as share (share.id)}
				<Item.Root variant="outline">
					<Item.Content>
						<Item.Title>{share.label}</Item.Title>
						{#if share.pending}
							<Item.Description>{m.share_pending()}</Item.Description>
						{/if}
					</Item.Content>
					<Item.Actions>
						<form method="POST" action="?/revoke">
							<input type="hidden" name="id" value={share.id} />
							<Button type="submit" variant="ghost" size="sm">{m.share_revoke()}</Button>
						</form>
					</Item.Actions>
				</Item.Root>
			{/each}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header><Card.Title>{m.share_with_you_title()}</Card.Title></Card.Header>
		<Card.Content class="grid gap-2">
			{#if data.receivedShares.length === 0}
				<p class="text-muted-foreground text-sm">{m.share_empty()}</p>
			{/if}
			{#each data.receivedShares as share (share.id)}
				<Item.Root variant="outline">
					<Item.Content>
						<Item.Title>{share.label}</Item.Title>
						{#if share.hidden}
							<Badge variant="outline">{m.share_hidden()}</Badge>
						{/if}
					</Item.Content>
					<Item.Actions>
						<form method="POST" action={share.hidden ? '?/unhide' : '?/hide'}>
							<input type="hidden" name="id" value={share.id} />
							<Button type="submit" variant="ghost" size="sm">
								{share.hidden ? m.share_unhide() : m.share_hide()}
							</Button>
						</form>
					</Item.Actions>
				</Item.Root>
			{/each}
		</Card.Content>
	</Card.Root>
</div>
