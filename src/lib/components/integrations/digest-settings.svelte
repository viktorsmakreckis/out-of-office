<script lang="ts">
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Switch } from '$lib/components/ui/switch';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime';
	import { saveDigestSchema } from '$lib/schemas/integration';

	let { form }: { form: SuperValidated<Infer<typeof saveDigestSchema>> } = $props();

	// svelte-ignore state_referenced_locally
	const {
		form: data,
		submitting,
		enhance
	} = superForm(form, {
		id: 'digest',
		dataType: 'json',
		resetForm: false,
		validators: zod4Client(saveDigestSchema)
	});

	const timezones = Intl.supportedValuesOf('timeZone');
	const hours = Array.from({ length: 24 }, (_, i) => i);
	const weekdays = [1, 2, 3, 4, 5, 6, 7];
	const pad2 = (n: number) => String(n).padStart(2, '0');
	// 2024-01-01 is a Monday, so Date.UTC(2024, 0, iso) maps ISO 1–7 to Mon–Sun.
	const weekdayName = (iso: number) =>
		new Intl.DateTimeFormat(getLocale(), { weekday: 'long' }).format(
			new Date(Date.UTC(2024, 0, iso))
		);
</script>

<form method="POST" action="?/saveDigest" use:enhance class="grid gap-4">
	<div>
		<h3 class="text-sm font-medium">{m.digest_section_title()}</h3>
		<p class="text-sm text-muted-foreground">{m.digest_section_description()}</p>
	</div>

	<div class="flex items-center justify-between gap-2">
		<Label for="digest-enabled">{m.digest_enable_label()}</Label>
		<Switch id="digest-enabled" bind:checked={$data.enabled} />
	</div>

	{#if $data.enabled}
		<Field.Field>
			<Field.Label for="digest-weekday">{m.digest_weekday_label()}</Field.Label>
			<Select.Root
				type="single"
				value={String($data.weekday)}
				onValueChange={(value) => value && ($data.weekday = Number(value))}
			>
				<Select.Trigger id="digest-weekday" class="w-full"
					>{weekdayName($data.weekday)}</Select.Trigger
				>
				<Select.Content>
					<Select.Group>
						{#each weekdays as day (day)}
							<Select.Item value={String(day)}>{weekdayName(day)}</Select.Item>
						{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>
		</Field.Field>

		<Field.Field>
			<Field.Label for="digest-hour">{m.digest_hour_label()}</Field.Label>
			<Select.Root
				type="single"
				value={String($data.hour)}
				onValueChange={(value) =>
					value !== undefined && value !== '' && ($data.hour = Number(value))}
			>
				<Select.Trigger id="digest-hour" class="w-full">{pad2($data.hour)}:00</Select.Trigger>
				<Select.Content class="max-h-72">
					<Select.Group>
						{#each hours as h (h)}
							<Select.Item value={String(h)}>{pad2(h)}:00</Select.Item>
						{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>
		</Field.Field>

		<Field.Field>
			<Field.Label for="digest-timezone">{m.digest_timezone_label()}</Field.Label>
			<Select.Root type="single" bind:value={$data.timezone}>
				<Select.Trigger id="digest-timezone" class="w-full">{$data.timezone}</Select.Trigger>
				<Select.Content class="max-h-72">
					<Select.Group>
						{#each timezones as tz (tz)}
							<Select.Item value={tz}>{tz}</Select.Item>
						{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>
		</Field.Field>

		<div class="flex items-center justify-between gap-2">
			<Label for="digest-empty">{m.digest_post_when_empty_label()}</Label>
			<Switch id="digest-empty" bind:checked={$data.postWhenEmpty} />
		</div>
	{/if}

	<div>
		<Button type="submit" disabled={$submitting}>
			{#if $submitting}<Spinner />{/if}
			{m.digest_save_cta()}
		</Button>
	</div>
</form>
