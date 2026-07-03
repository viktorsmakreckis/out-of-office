<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import * as Item from '$lib/components/ui/item';
	import type { AppNotification } from '$lib/notifications';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const pendingIds = $derived(new Set(data.pendingInvitationIds));
	const hasUnread = $derived(data.notifications.some((n) => n.readAt === null));

	function text(entry: AppNotification): string {
		switch (entry.type) {
			case 'team_invite':
				return m.notification_team_invite({
					name: entry.actorName,
					team: entry.data.teamName
				});
			case 'calendar_shared':
				return m.notification_calendar_shared({ name: entry.actorName });
			case 'event_created':
				return m.notification_event_created({ name: entry.actorName });
			case 'event_updated':
				return m.notification_event_updated({ name: entry.actorName });
		}
	}

	const dateFormat = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	});
</script>

<svelte:head><title>{m.notifications_title()} · {m.app_name()}</title></svelte:head>

<div class="mx-auto grid max-w-xl gap-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-semibold">{m.notifications_title()}</h1>
		{#if hasUnread}
			<form method="POST" action="?/markAllRead">
				<Button type="submit" variant="outline" size="sm">{m.notifications_mark_all_read()}</Button>
			</form>
		{/if}
	</div>

	{#if data.notifications.length === 0}
		<Empty.Root>
			<Empty.Title>{m.notifications_empty()}</Empty.Title>
		</Empty.Root>
	{:else}
		<div class="grid gap-2">
			{#each data.notifications as entry (entry.id)}
				<Item.Root variant={entry.readAt === null ? 'outline' : 'muted'}>
					<Item.Content>
						<Item.Title>{text(entry)}</Item.Title>
						<Item.Description>
							{dateFormat.format(entry.createdAt)}
							{#if (entry.type === 'event_created' || entry.type === 'event_updated') && entry.data.eventTitle}
								· {entry.data.eventTitle}
							{/if}
						</Item.Description>
					</Item.Content>
					<Item.Actions>
						{#if entry.readAt === null}
							<Badge variant="default" class="h-2 w-2 rounded-full p-0" />
						{/if}
						{#if entry.type === 'team_invite' && pendingIds.has(entry.data.invitationId)}
							<form method="POST" action="?/acceptInvitation">
								<input type="hidden" name="invitationId" value={entry.data.invitationId} />
								<Button type="submit" size="sm">{m.invitation_accept()}</Button>
							</form>
							<form method="POST" action="?/declineInvitation">
								<input type="hidden" name="invitationId" value={entry.data.invitationId} />
								<Button type="submit" variant="ghost" size="sm">{m.invitation_decline()}</Button>
							</form>
						{/if}
						{#if entry.type === 'calendar_shared' && entry.data.shareId}
							<form method="POST" action="?/shareBack">
								<input type="hidden" name="notificationId" value={entry.id} />
								<Button type="submit" variant="outline" size="sm">{m.share_back_cta()}</Button>
							</form>
						{/if}
					</Item.Actions>
				</Item.Root>
			{/each}
		</div>
	{/if}
</div>
