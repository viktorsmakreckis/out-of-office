<script lang="ts">
	import { enhance } from '$app/forms';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Item from '$lib/components/ui/item';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale, locales, type Locale } from '$lib/paraglide/runtime';
	import { addConnectionSchema } from '$lib/schemas/integration';
	import { toFieldErrors } from '$lib/utils';
	import ConnectionSettingsDialog from './connection-settings-dialog.svelte';
	import FeedUrlField from './feed-url-field.svelte';

	type Provider = Infer<typeof addConnectionSchema>['provider'];
	type ConnectionRow = {
		id: string;
		provider: Provider;
		label: string | null;
		notifyOoo: boolean;
		notifyDigest: boolean;
		consecutiveFailures: number;
		lastFailureAt: Date | null;
	};

	let {
		connections,
		feedUrl,
		form,
		teamLocale
	}: {
		connections: ConnectionRow[];
		feedUrl: string;
		form: SuperValidated<Infer<typeof addConnectionSchema>>;
		teamLocale: Locale;
	} = $props();

	const providerNames: Record<Provider, string> = {
		slack: 'Slack',
		discord: 'Discord',
		msteams: 'Microsoft Teams'
	};

	// Endonyms are intentionally not translated.
	const localeLabels: Record<Locale, string> = {
		'en-GB': 'English (UK)',
		'en-US': 'English (US)',
		pl: 'Polski',
		fr: 'Français'
	};

	// svelte-ignore state_referenced_locally
	const connection = superForm(form, {
		id: 'connection',
		validators: zod4Client(addConnectionSchema)
	});
	const {
		form: connectionData,
		errors: connectionErrors,
		submitting: connectionSubmitting,
		enhance: connectionEnhance
	} = connection;

	const failingSince = (date: Date | null) =>
		date ? m.integrations_failing({ date: date.toLocaleDateString(getLocale()) }) : '';
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.integrations_title()}</Card.Title>
		<Card.Description>{m.integrations_description()}</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		<form id="team-language-form" method="POST" action="?/updateLanguage" use:enhance>
			<Field.Field>
				<Field.Label for="team-language">{m.team_language_label()}</Field.Label>
				<input type="hidden" name="locale" value={teamLocale} />
				<Select.Root
					type="single"
					value={teamLocale}
					onValueChange={(locale) => {
						const languageForm = document.getElementById('team-language-form');
						if (!(languageForm instanceof HTMLFormElement)) return;
						const input = languageForm.querySelector('input[name="locale"]');
						if (input instanceof HTMLInputElement && locale) {
							input.value = locale;
							languageForm.requestSubmit();
						}
					}}
				>
					<Select.Trigger id="team-language" class="w-full"
						>{localeLabels[teamLocale]}</Select.Trigger
					>
					<Select.Content>
						<Select.Group>
							{#each locales as locale (locale)}
								<Select.Item value={locale}>{localeLabels[locale]}</Select.Item>
							{/each}
						</Select.Group>
					</Select.Content>
				</Select.Root>
				<Field.Description>{m.team_language_description()}</Field.Description>
			</Field.Field>
		</form>

		{#if connections.length === 0}
			<p class="text-sm text-muted-foreground">{m.integrations_empty()}</p>
		{:else}
			<div class="grid gap-2">
				{#each connections as row (row.id)}
					<Item.Root variant="outline">
						<Item.Content>
							<Item.Title>{row.label ?? providerNames[row.provider]}</Item.Title>
							<Item.Description>
								{providerNames[row.provider]}
								{#if row.consecutiveFailures > 0}
									<Badge variant="destructive">{failingSince(row.lastFailureAt)}</Badge>
								{/if}
							</Item.Description>
						</Item.Content>
						<Item.Actions>
							<ConnectionSettingsDialog {row} />
						</Item.Actions>
					</Item.Root>
				{/each}
			</div>
		{/if}

		<form method="POST" action="?/addConnection" use:connectionEnhance>
			<Field.Group>
				<Field.Field>
					<Field.Label for="connection-provider">{m.integrations_provider_label()}</Field.Label>
					<Select.Root type="single" bind:value={$connectionData.provider}>
						<Select.Trigger id="connection-provider" class="w-full">
							{$connectionData.provider ? providerNames[$connectionData.provider] : ''}
						</Select.Trigger>
						<Select.Content>
							<Select.Group>
								<Select.Item value="slack">Slack</Select.Item>
								<Select.Item value="discord">Discord</Select.Item>
								<Select.Item value="msteams">Microsoft Teams</Select.Item>
							</Select.Group>
						</Select.Content>
					</Select.Root>
					<input type="hidden" name="provider" value={$connectionData.provider} />
				</Field.Field>
				<Field.Field data-invalid={!!$connectionErrors.webhookUrl || undefined}>
					<Field.Label for="connection-url">{m.integrations_webhook_url_label()}</Field.Label>
					<Input
						id="connection-url"
						name="webhookUrl"
						bind:value={$connectionData.webhookUrl}
						aria-invalid={$connectionErrors.webhookUrl ? 'true' : undefined}
					/>
					<Field.Error errors={toFieldErrors($connectionErrors.webhookUrl)} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="connection-label">{m.integrations_label_label()}</Field.Label>
					<Input id="connection-label" name="label" bind:value={$connectionData.label} />
				</Field.Field>
				<div>
					<Button type="submit" disabled={$connectionSubmitting}>
						{#if $connectionSubmitting}<Spinner />{/if}
						{m.integrations_add_cta()}
					</Button>
				</div>
			</Field.Group>
		</form>

		<FeedUrlField url={feedUrl} description={m.feed_team_description()} />
	</Card.Content>
</Card.Root>
