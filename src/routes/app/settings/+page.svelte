<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { m } from '$lib/paraglide/messages.js';
	import { locales, type Locale } from '$lib/paraglide/runtime';
	import {
		changeEmailSchema,
		changePasswordSchema,
		deleteAccountSchema,
		profileSchema
	} from '$lib/schemas/auth';
	import { toFieldErrors } from '$lib/utils';

	let { data } = $props();

	// Endonyms are intentionally not translated.
	const localeLabels: Record<Locale, string> = { en: 'English', pl: 'Polski', fr: 'Français' };
	const timezones = Intl.supportedValuesOf('timeZone');

	// svelte-ignore state_referenced_locally
	const {
		form: profileForm,
		errors: profileErrors,
		constraints: profileConstraints,
		submitting: profileSubmitting,
		enhance: profileEnhance
	} = superForm(data.profileForm, { validators: zod4Client(profileSchema) });

	// svelte-ignore state_referenced_locally
	const {
		form: emailForm,
		errors: emailErrors,
		constraints: emailConstraints,
		submitting: emailSubmitting,
		enhance: emailEnhance
	} = superForm(data.emailForm, { validators: zod4Client(changeEmailSchema) });

	// svelte-ignore state_referenced_locally
	const {
		form: passwordForm,
		errors: passwordErrors,
		constraints: passwordConstraints,
		submitting: passwordSubmitting,
		enhance: passwordEnhance
	} = superForm(data.passwordForm, { validators: zod4Client(changePasswordSchema) });

	// svelte-ignore state_referenced_locally
	const {
		form: deleteForm,
		errors: deleteErrors,
		submitting: deleteSubmitting,
		enhance: deleteEnhance
	} = superForm(data.deleteForm, { validators: zod4Client(deleteAccountSchema) });
</script>

<svelte:head><title>{m.settings_title()} · {m.app_name()}</title></svelte:head>

<div class="mx-auto grid max-w-xl gap-6">
	<h1 class="text-2xl font-semibold">{m.settings_title()}</h1>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_profile_title()}</Card.Title>
			<Card.Description>{m.settings_profile_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/profile" use:profileEnhance>
				<Field.Group>
					<Field.Error errors={toFieldErrors($profileErrors._errors as string[] | undefined)} />
					<Field.Field data-invalid={!!$profileErrors.name || undefined}>
						<Field.Label for="profile-name">{m.auth_name_label()}</Field.Label>
						<Input
							id="profile-name"
							name="name"
							autocomplete="name"
							bind:value={$profileForm.name}
							aria-invalid={$profileErrors.name ? 'true' : undefined}
							{...$profileConstraints.name}
						/>
						<Field.Error errors={toFieldErrors($profileErrors.name as string[] | undefined)} />
					</Field.Field>
					<Field.Field data-invalid={!!$profileErrors.locale || undefined}>
						<Field.Label for="profile-locale">{m.settings_language_label()}</Field.Label>
						<Select.Root
							type="single"
							name="locale"
							value={$profileForm.locale}
							onValueChange={(value) => ($profileForm.locale = value as Locale)}
						>
							<Select.Trigger id="profile-locale" class="w-full">
								{localeLabels[$profileForm.locale]}
							</Select.Trigger>
							<Select.Content>
								<Select.Group>
									{#each locales as locale (locale)}
										<Select.Item value={locale}>{localeLabels[locale]}</Select.Item>
									{/each}
								</Select.Group>
							</Select.Content>
						</Select.Root>
						<Field.Error errors={toFieldErrors($profileErrors.locale as string[] | undefined)} />
					</Field.Field>
					<Field.Field data-invalid={!!$profileErrors.timezone || undefined}>
						<Field.Label for="profile-timezone">{m.settings_timezone_label()}</Field.Label>
						<Select.Root type="single" name="timezone" bind:value={$profileForm.timezone}>
							<Select.Trigger id="profile-timezone" class="w-full">
								{$profileForm.timezone}
							</Select.Trigger>
							<Select.Content>
								<Select.Group>
									{#each timezones as timezone (timezone)}
										<Select.Item value={timezone}>{timezone}</Select.Item>
									{/each}
								</Select.Group>
							</Select.Content>
						</Select.Root>
						<Field.Error errors={toFieldErrors($profileErrors.timezone as string[] | undefined)} />
					</Field.Field>
					<div>
						<Button type="submit" disabled={$profileSubmitting}>
							{#if $profileSubmitting}<Spinner />{/if}
							{m.save()}
						</Button>
					</div>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_email_title()}</Card.Title>
			<Card.Description>{m.settings_email_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/changeEmail" use:emailEnhance>
				<Field.Group>
					<Field.Field data-invalid={!!$emailErrors.newEmail || undefined}>
						<Field.Label for="settings-new-email">{m.settings_new_email_label()}</Field.Label>
						<Input
							id="settings-new-email"
							type="email"
							name="newEmail"
							autocomplete="email"
							bind:value={$emailForm.newEmail}
							aria-invalid={$emailErrors.newEmail ? 'true' : undefined}
							{...$emailConstraints.newEmail}
						/>
						<Field.Error errors={toFieldErrors($emailErrors.newEmail as string[] | undefined)} />
					</Field.Field>
					<div>
						<Button type="submit" disabled={$emailSubmitting}>
							{#if $emailSubmitting}<Spinner />{/if}
							{m.settings_email_cta()}
						</Button>
					</div>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.settings_password_title()}</Card.Title>
			<Card.Description>{m.settings_password_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/changePassword" use:passwordEnhance>
				<Field.Group>
					<Field.Field data-invalid={!!$passwordErrors.currentPassword || undefined}>
						<Field.Label for="settings-current-password">
							{m.auth_current_password_label()}
						</Field.Label>
						<Input
							id="settings-current-password"
							type="password"
							name="currentPassword"
							autocomplete="current-password"
							bind:value={$passwordForm.currentPassword}
							aria-invalid={$passwordErrors.currentPassword ? 'true' : undefined}
							{...$passwordConstraints.currentPassword}
						/>
						<Field.Error
							errors={toFieldErrors($passwordErrors.currentPassword as string[] | undefined)}
						/>
					</Field.Field>
					<Field.Field data-invalid={!!$passwordErrors.newPassword || undefined}>
						<Field.Label for="settings-new-password">{m.auth_new_password_label()}</Field.Label>
						<Input
							id="settings-new-password"
							type="password"
							name="newPassword"
							autocomplete="new-password"
							bind:value={$passwordForm.newPassword}
							aria-invalid={$passwordErrors.newPassword ? 'true' : undefined}
							{...$passwordConstraints.newPassword}
						/>
						<Field.Error
							errors={toFieldErrors($passwordErrors.newPassword as string[] | undefined)}
						/>
					</Field.Field>
					<div>
						<Button type="submit" disabled={$passwordSubmitting}>
							{#if $passwordSubmitting}<Spinner />{/if}
							{m.settings_password_cta()}
						</Button>
					</div>
				</Field.Group>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root class="border-destructive/50">
		<Card.Header>
			<Card.Title>{m.settings_delete_title()}</Card.Title>
			<Card.Description>{m.settings_delete_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<AlertDialog.Root>
				<AlertDialog.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="destructive">{m.settings_delete_cta()}</Button>
					{/snippet}
				</AlertDialog.Trigger>
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>{m.settings_delete_confirm_title()}</AlertDialog.Title>
						<AlertDialog.Description>
							{m.settings_delete_confirm_description()}
						</AlertDialog.Description>
					</AlertDialog.Header>
					<form method="POST" action="?/deleteAccount" use:deleteEnhance class="grid gap-4">
						<Field.Field data-invalid={!!$deleteErrors.password || undefined}>
							<Field.Label for="delete-password">{m.auth_password_label()}</Field.Label>
							<Input
								id="delete-password"
								type="password"
								name="password"
								autocomplete="current-password"
								bind:value={$deleteForm.password}
								aria-invalid={$deleteErrors.password ? 'true' : undefined}
							/>
							<Field.Error errors={toFieldErrors($deleteErrors.password as string[] | undefined)} />
						</Field.Field>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>{m.cancel()}</AlertDialog.Cancel>
							<Button type="submit" variant="destructive" disabled={$deleteSubmitting}>
								{#if $deleteSubmitting}<Spinner />{/if}
								{m.settings_delete_cta()}
							</Button>
						</AlertDialog.Footer>
					</form>
				</AlertDialog.Content>
			</AlertDialog.Root>
		</Card.Content>
	</Card.Root>
</div>
