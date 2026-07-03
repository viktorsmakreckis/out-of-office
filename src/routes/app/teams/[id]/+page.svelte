<script lang="ts">
	import { enhance } from '$app/forms';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import IntegrationsCard from '$lib/components/integrations/integrations-card.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
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
	import { inviteMemberSchema, renameTeamSchema } from '$lib/schemas/team';
	import { toFieldErrors } from '$lib/utils';

	let { data } = $props();

	const canManage = $derived(data.myRole === 'owner' || data.myRole === 'admin');
	const isOwner = $derived(data.myRole === 'owner');

	// Per-member transfer-ownership confirmation dialogs (closed on successful submit).
	let transferOpen = $state<Record<string, boolean>>({});

	const roleLabels: Record<string, string> = {
		owner: m.team_role_owner(),
		admin: m.team_role_admin(),
		member: m.team_role_member()
	};

	// svelte-ignore state_referenced_locally
	const invite = superForm(data.inviteForm, {
		id: 'invite',
		validators: zod4Client(inviteMemberSchema)
	});
	const {
		form: inviteData,
		errors: inviteErrors,
		submitting: inviteSubmitting,
		enhance: inviteEnhance
	} = invite;

	// svelte-ignore state_referenced_locally
	const rename = superForm(data.renameForm, {
		id: 'rename',
		validators: zod4Client(renameTeamSchema),
		// The input shows the current team name (not a fill-and-clear field), so keep the
		// submitted value after saving instead of resetting to the stale initial snapshot.
		resetForm: false
	});
	const {
		form: renameData,
		errors: renameErrors,
		submitting: renameSubmitting,
		enhance: renameEnhance
	} = rename;

	// svelte-ignore state_referenced_locally
	const share = superForm(data.shareForm, {
		id: 'share',
		validators: zod4Client(shareTargetSchema)
	});
	const {
		form: shareData,
		errors: shareErrors,
		submitting: shareSubmitting,
		enhance: shareEnhance
	} = share;

	const selectedTeamName = $derived(
		data.shareableTeams.find((team) => team.id === $shareData.teamId)?.name ?? ''
	);
</script>

<svelte:head><title>{data.team.name} · {m.app_name()}</title></svelte:head>

<div class="mx-auto grid max-w-xl gap-6">
	<h1 class="text-2xl font-semibold">{data.team.name}</h1>

	<Card.Root>
		<Card.Header><Card.Title>{m.team_members_title()}</Card.Title></Card.Header>
		<Card.Content class="grid gap-2">
			{#each data.members as teamMember (teamMember.id)}
				<Item.Root variant="outline">
					<Item.Content>
						<Item.Title>{teamMember.name}</Item.Title>
						<Item.Description>{teamMember.email}</Item.Description>
					</Item.Content>
					<Item.Actions>
						{#if canManage && teamMember.role !== 'owner' && teamMember.userId !== data.user?.id}
							<form
								id={`role-form-${teamMember.id}`}
								method="POST"
								action="?/updateRole"
								class="contents"
								use:enhance
							>
								<input type="hidden" name="memberId" value={teamMember.id} />
								<input type="hidden" name="role" value={teamMember.role} />
								<Select.Root
									type="single"
									value={teamMember.role}
									onValueChange={(role) => {
										const form = document.getElementById(`role-form-${teamMember.id}`);
										if (!(form instanceof HTMLFormElement)) return;
										const input = form.querySelector('input[name="role"]');
										if (input instanceof HTMLInputElement && role) {
											input.value = role;
											form.requestSubmit();
										}
									}}
								>
									<Select.Trigger class="w-28">{roleLabels[teamMember.role]}</Select.Trigger>
									<Select.Content>
										<Select.Group>
											<Select.Item value="member">{m.team_role_member()}</Select.Item>
											<Select.Item value="admin">{m.team_role_admin()}</Select.Item>
										</Select.Group>
									</Select.Content>
								</Select.Root>
							</form>
							{#if isOwner}
								<AlertDialog.Root bind:open={transferOpen[teamMember.id]}>
									<AlertDialog.Trigger>
										{#snippet child({ props })}
											<Button {...props} variant="outline" size="sm">{m.team_transfer_cta()}</Button
											>
										{/snippet}
									</AlertDialog.Trigger>
									<AlertDialog.Content>
										<AlertDialog.Header>
											<AlertDialog.Title>{m.team_transfer_confirm_title()}</AlertDialog.Title>
											<AlertDialog.Description>
												{m.team_transfer_confirm_description({ name: teamMember.name })}
											</AlertDialog.Description>
										</AlertDialog.Header>
										<AlertDialog.Footer>
											<AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel>
											<form
												method="POST"
												action="?/transferOwnership"
												use:enhance={() =>
													async ({ update }) => {
														await update();
														transferOpen[teamMember.id] = false;
													}}
											>
												<input type="hidden" name="memberId" value={teamMember.id} />
												<Button type="submit">{m.team_transfer_cta()}</Button>
											</form>
										</AlertDialog.Footer>
									</AlertDialog.Content>
								</AlertDialog.Root>
							{/if}
							<form method="POST" action="?/removeMember" use:enhance>
								<input type="hidden" name="memberId" value={teamMember.id} />
								<Button type="submit" variant="ghost" size="sm">{m.team_member_remove()}</Button>
							</form>
						{:else}
							<Badge variant="secondary">{roleLabels[teamMember.role] ?? teamMember.role}</Badge>
						{/if}
					</Item.Actions>
				</Item.Root>
			{/each}
		</Card.Content>
	</Card.Root>

	{#if canManage}
		<Card.Root>
			<Card.Header><Card.Title>{m.team_invite_title()}</Card.Title></Card.Header>
			<Card.Content>
				<form method="POST" action="?/invite" use:inviteEnhance>
					<Field.Group>
						<Field.Field data-invalid={!!$inviteErrors.email || undefined}>
							<Field.Label for="invite-email">{m.share_email_label()}</Field.Label>
							<Input
								id="invite-email"
								type="email"
								name="email"
								bind:value={$inviteData.email}
								aria-invalid={$inviteErrors.email ? 'true' : undefined}
							/>
							<Field.Error errors={toFieldErrors($inviteErrors.email)} />
						</Field.Field>
						<Field.Field>
							<Field.Label for="invite-role">{m.team_invite_role_label()}</Field.Label>
							<Select.Root type="single" name="role" bind:value={$inviteData.role}>
								<Select.Trigger id="invite-role" class="w-full">
									{roleLabels[$inviteData.role] ?? m.team_role_member()}
								</Select.Trigger>
								<Select.Content>
									<Select.Group>
										<Select.Item value="member">{m.team_role_member()}</Select.Item>
										<Select.Item value="admin">{m.team_role_admin()}</Select.Item>
									</Select.Group>
								</Select.Content>
							</Select.Root>
						</Field.Field>
						<div>
							<Button type="submit" disabled={$inviteSubmitting}>
								{#if $inviteSubmitting}<Spinner />{/if}
								{m.team_invite_cta()}
							</Button>
						</div>
					</Field.Group>
				</form>
				{#if data.pendingInvitations.length > 0}
					<div class="mt-4 grid gap-2">
						<h3 class="text-sm font-medium">{m.team_pending_invites_title()}</h3>
						{#each data.pendingInvitations as pending (pending.id)}
							<Item.Root variant="muted">
								<Item.Content>
									<Item.Title>{pending.email}</Item.Title>
								</Item.Content>
								<Item.Actions>
									<Badge variant="outline">{roleLabels[pending.role ?? 'member']}</Badge>
								</Item.Actions>
							</Item.Root>
						{/each}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.team_share_title()}</Card.Title>
				<Card.Description>{m.team_share_description()}</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				<form method="POST" action="?/share" use:shareEnhance>
					<Field.Group>
						<Field.Field>
							<Field.Label>{m.share_target_label()}</Field.Label>
							<RadioGroup.Root
								bind:value={$shareData.targetType}
								name="targetType"
								class="flex gap-4"
							>
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
						{#if $shareData.targetType === 'team'}
							<Field.Field data-invalid={!!$shareErrors.teamId || undefined}>
								<Field.Label for="team-share-team">{m.share_team_label()}</Field.Label>
								<Select.Root type="single" name="teamId" bind:value={$shareData.teamId}>
									<Select.Trigger id="team-share-team" class="w-full"
										>{selectedTeamName}</Select.Trigger
									>
									<Select.Content>
										<Select.Group>
											{#each data.shareableTeams as team (team.id)}
												<Select.Item value={team.id}>{team.name}</Select.Item>
											{/each}
										</Select.Group>
									</Select.Content>
								</Select.Root>
								<Field.Error errors={toFieldErrors($shareErrors.teamId)} />
							</Field.Field>
						{:else}
							<Field.Field data-invalid={!!$shareErrors.email || undefined}>
								<Field.Label for="team-share-email">{m.share_email_label()}</Field.Label>
								<Input
									id="team-share-email"
									type="email"
									name="email"
									bind:value={$shareData.email}
									aria-invalid={$shareErrors.email ? 'true' : undefined}
								/>
								<Field.Error errors={toFieldErrors($shareErrors.email)} />
							</Field.Field>
						{/if}
						<div>
							<Button type="submit" disabled={$shareSubmitting}>
								{#if $shareSubmitting}<Spinner />{/if}
								{m.share_cta()}
							</Button>
						</div>
					</Field.Group>
				</form>
				{#if data.shares.length > 0}
					<div class="grid gap-2">
						{#each data.shares as teamShare (teamShare.id)}
							<Item.Root variant="outline">
								<Item.Content>
									<Item.Title>{teamShare.label}</Item.Title>
									{#if teamShare.pending}
										<Item.Description>{m.share_pending()}</Item.Description>
									{/if}
								</Item.Content>
								<Item.Actions>
									<form method="POST" action="?/revokeShare" use:enhance>
										<input type="hidden" name="id" value={teamShare.id} />
										<Button type="submit" variant="ghost" size="sm">{m.share_revoke()}</Button>
									</form>
								</Item.Actions>
							</Item.Root>
						{/each}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header><Card.Title>{m.team_settings_title()}</Card.Title></Card.Header>
		<Card.Content class="grid gap-4">
			{#if isOwner}
				<div class="flex items-end gap-2">
					<form id="rename-form" method="POST" action="?/rename" use:renameEnhance class="flex-1">
						<Field.Field data-invalid={!!$renameErrors.name || undefined}>
							<Field.Label for="rename-name">{m.team_name_label()}</Field.Label>
							<Input id="rename-name" name="name" bind:value={$renameData.name} />
							<Field.Error errors={toFieldErrors($renameErrors.name)} />
						</Field.Field>
					</form>
					<Button type="submit" form="rename-form" variant="outline" disabled={$renameSubmitting}>
						{#if $renameSubmitting}<Spinner />{/if}
						{m.team_rename_cta()}
					</Button>
					<AlertDialog.Root>
						<AlertDialog.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="destructive">
									{m.team_delete_cta()}
								</Button>
							{/snippet}
						</AlertDialog.Trigger>
						<AlertDialog.Content>
							<AlertDialog.Header>
								<AlertDialog.Title>{m.team_delete_confirm_title()}</AlertDialog.Title>
								<AlertDialog.Description
									>{m.team_delete_confirm_description()}</AlertDialog.Description
								>
							</AlertDialog.Header>
							<AlertDialog.Footer>
								<AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel>
								<form method="POST" action="?/deleteTeam">
									<Button type="submit" variant="destructive">{m.team_delete_cta()}</Button>
								</form>
							</AlertDialog.Footer>
						</AlertDialog.Content>
					</AlertDialog.Root>
				</div>
			{:else}
				<AlertDialog.Root>
					<AlertDialog.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="outline" class="justify-self-start">
								{m.team_leave_cta()}
							</Button>
						{/snippet}
					</AlertDialog.Trigger>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>{m.team_leave_confirm_title()}</AlertDialog.Title>
							<AlertDialog.Description>{m.team_leave_confirm_description()}</AlertDialog.Description
							>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel>
							<form method="POST" action="?/leave">
								<Button type="submit">{m.team_leave_cta()}</Button>
							</form>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Root>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if data.integrations}
		<IntegrationsCard
			connections={data.integrations.connections}
			feedUrl={data.integrations.feedUrl}
			form={data.integrations.connectionForm}
			teamLocale={data.integrations.teamLocale}
		/>
	{/if}
</div>
