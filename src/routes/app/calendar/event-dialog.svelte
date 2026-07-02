<script lang="ts">
	import { getLocalTimeZone, today } from '@internationalized/date';
	import { toast } from 'svelte-sonner';
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Switch } from '$lib/components/ui/switch';
	import {
		DEFAULT_END_TIME,
		DEFAULT_START_TIME,
		eventTypeLabel,
		eventTypes,
		toFormValues,
		type EventFormValues,
		type EventRecord,
		type EventType
	} from '$lib/events';
	import { m } from '$lib/paraglide/messages.js';
	import { deleteEventSchema, eventSchema } from '$lib/schemas/event';
	import { toFieldErrors } from '$lib/utils';

	let {
		eventForm,
		deleteForm,
		timezone,
		actionParams
	}: {
		eventForm: SuperValidated<Infer<typeof eventSchema>>;
		deleteForm: SuperValidated<Infer<typeof deleteEventSchema>>;
		timezone: string;
		/** `&view=…&date=…` — appended to action URLs so calendar state survives the redirect. */
		actionParams: string;
	} = $props();

	let open = $state(false);
	let confirmingDelete = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, constraints, submitting, enhance, reset } = superForm(eventForm, {
		id: 'event',
		validators: zod4Client(eventSchema),
		onResult({ result }) {
			if (result.type === 'redirect') open = false;
		},
		onError: () => toast.error(m.error_generic())
	});

	// svelte-ignore state_referenced_locally
	const {
		form: delForm,
		submitting: delSubmitting,
		enhance: delEnhance
	} = superForm(deleteForm, {
		id: 'delete',
		validators: zod4Client(deleteEventSchema),
		onResult({ result }) {
			if (result.type === 'redirect') open = false;
		},
		onError: () => toast.error(m.error_generic())
	});

	const isEdit = $derived($form.id !== '');

	function blankValues(): EventFormValues {
		const day = today(getLocalTimeZone()).toString();
		return {
			id: '',
			type: 'vacation',
			title: '',
			allDay: true,
			startDate: day,
			endDate: day,
			startTime: DEFAULT_START_TIME,
			endTime: DEFAULT_END_TIME
		};
	}

	export function openCreate(values: Partial<EventFormValues> = {}) {
		reset({ data: { ...blankValues(), ...values } });
		confirmingDelete = false;
		open = true;
	}

	export function openEdit(record: EventRecord) {
		reset({ data: toFormValues(record, timezone) });
		$delForm.id = record.id;
		confirmingDelete = false;
		open = true;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{isEdit ? m.calendar_event_edit() : m.calendar_event_add()}</Dialog.Title>
			<Dialog.Description>
				{isEdit ? m.calendar_event_edit_description() : m.calendar_event_add_description()}
			</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action={`?/save${actionParams}`} use:enhance>
			<input type="hidden" name="id" value={$form.id} />
			<Field.Group>
				<Field.Error errors={toFieldErrors($errors._errors)} />
				<Field.Field data-invalid={!!$errors.type || undefined}>
					<Field.Label for="event-type">{m.calendar_event_type_label()}</Field.Label>
					<Select.Root
						type="single"
						name="type"
						value={$form.type}
						onValueChange={(value) => ($form.type = value as EventType)}
					>
						<Select.Trigger
							id="event-type"
							class="w-full"
							aria-invalid={$errors.type ? 'true' : undefined}
						>
							{eventTypeLabel($form.type)}
						</Select.Trigger>
						<Select.Content>
							{#each eventTypes as type (type)}
								<Select.Item value={type}>{eventTypeLabel(type)}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<Field.Error errors={toFieldErrors($errors.type)} />
				</Field.Field>
				<Field.Field data-invalid={!!$errors.title || undefined}>
					<Field.Label for="event-title">
						{$form.type === 'other'
							? m.calendar_event_title_label()
							: m.calendar_event_note_label()}
					</Field.Label>
					<Input
						id="event-title"
						name="title"
						bind:value={$form.title}
						aria-invalid={$errors.title ? 'true' : undefined}
						{...$constraints.title}
					/>
					<Field.Error errors={toFieldErrors($errors.title)} />
				</Field.Field>
				<Field.Field orientation="horizontal" data-invalid={!!$errors.allDay || undefined}>
					<Field.Label for="event-all-day">{m.calendar_event_all_day_label()}</Field.Label>
					<Switch
						id="event-all-day"
						name="allDay"
						bind:checked={$form.allDay}
						aria-invalid={$errors.allDay ? 'true' : undefined}
					/>
					<Field.Error errors={toFieldErrors($errors.allDay)} />
				</Field.Field>
				<div class="grid grid-cols-2 gap-4">
					<Field.Field data-invalid={!!$errors.startDate || undefined}>
						<Field.Label for="event-start-date">{m.calendar_event_start_date_label()}</Field.Label>
						<Input
							id="event-start-date"
							type="date"
							name="startDate"
							bind:value={$form.startDate}
							aria-invalid={$errors.startDate ? 'true' : undefined}
						/>
						<Field.Error errors={toFieldErrors($errors.startDate)} />
					</Field.Field>
					<Field.Field data-invalid={!!$errors.endDate || undefined}>
						<Field.Label for="event-end-date">{m.calendar_event_end_date_label()}</Field.Label>
						<Input
							id="event-end-date"
							type="date"
							name="endDate"
							bind:value={$form.endDate}
							aria-invalid={$errors.endDate ? 'true' : undefined}
						/>
						<Field.Error errors={toFieldErrors($errors.endDate)} />
					</Field.Field>
				</div>
				{#if !$form.allDay}
					<div class="grid grid-cols-2 gap-4">
						<Field.Field data-invalid={!!$errors.startTime || undefined}>
							<Field.Label for="event-start-time">
								{m.calendar_event_start_time_label()}
							</Field.Label>
							<Input
								id="event-start-time"
								type="time"
								name="startTime"
								bind:value={$form.startTime}
								aria-invalid={$errors.startTime ? 'true' : undefined}
							/>
							<Field.Error errors={toFieldErrors($errors.startTime)} />
						</Field.Field>
						<Field.Field data-invalid={!!$errors.endTime || undefined}>
							<Field.Label for="event-end-time">{m.calendar_event_end_time_label()}</Field.Label>
							<Input
								id="event-end-time"
								type="time"
								name="endTime"
								bind:value={$form.endTime}
								aria-invalid={$errors.endTime ? 'true' : undefined}
							/>
							<Field.Error errors={toFieldErrors($errors.endTime)} />
						</Field.Field>
					</div>
				{/if}
			</Field.Group>
			<Dialog.Footer class="mt-4">
				{#if isEdit}
					{#if confirmingDelete}
						<Button
							type="submit"
							form="event-delete-form"
							variant="destructive"
							disabled={$delSubmitting}
						>
							{#if $delSubmitting}<Spinner />{/if}
							{m.calendar_event_delete_confirm()}
						</Button>
					{:else}
						<Button type="button" variant="destructive" onclick={() => (confirmingDelete = true)}>
							{m.calendar_event_delete()}
						</Button>
					{/if}
				{/if}
				<Button type="submit" disabled={$submitting}>
					{#if $submitting}<Spinner />{/if}
					{m.save()}
				</Button>
			</Dialog.Footer>
		</form>
		{#if isEdit}
			<form
				id="event-delete-form"
				method="POST"
				action={`?/delete${actionParams}`}
				use:delEnhance
				class="hidden"
			>
				<input type="hidden" name="id" value={$delForm.id} />
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
