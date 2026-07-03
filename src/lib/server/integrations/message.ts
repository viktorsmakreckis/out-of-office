import { eventTypeLabelFor } from '$lib/events/labels';
import type { EventType } from '$lib/events/types';
import { m } from '$lib/paraglide/messages.js';
import { baseLocale } from '$lib/paraglide/runtime';

/**
 * Provider-neutral channel message. Channel posts are base-locale English —
 * a channel has no single user locale.
 */
export type OooMessage = {
	actorName: string;
	eventLabel: string;
	emoji: string;
	dateRange: string;
	kind: 'created' | 'updated' | 'test';
};

const eventTypeEmoji: Record<EventType, string> = {
	vacation: '🌴',
	sick_leave: '🤒',
	business_trip: '✈️',
	public_holiday: '🎉',
	remote_work: '🏠',
	other: '📅'
};

const dateFmt = new Intl.DateTimeFormat('en', {
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC'
});
const timeFmt = new Intl.DateTimeFormat('en', {
	month: 'short',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hour12: false,
	timeZone: 'UTC'
});

/** All-day rows are end-inclusive by date part; timed rows are instants shown in UTC. */
export function formatDateRange(start: Date, end: Date, allDay: boolean): string {
	if (allDay) {
		const from = dateFmt.format(start);
		const to = dateFmt.format(end);
		return from === to ? from : `${from} – ${to}`;
	}
	return `${timeFmt.format(start)} – ${timeFmt.format(end)} UTC`;
}

export function buildEventMessage(
	actorName: string,
	kind: 'created' | 'updated',
	title: string | null,
	type: string,
	range: { allDay: boolean; start: Date; end: Date }
): OooMessage {
	return {
		actorName,
		eventLabel: title ?? eventTypeLabelFor(type, baseLocale),
		emoji: eventTypeEmoji[type as EventType] ?? '📅',
		dateRange: formatDateRange(range.start, range.end, range.allDay),
		kind
	};
}

export function testMessage(): OooMessage {
	return { actorName: '', eventLabel: '', emoji: '', dateRange: '', kind: 'test' };
}

/** Renders the one-line channel text; `bold` supplies the provider's bold syntax. */
export function composeLine(message: OooMessage, bold: (s: string) => string): string {
	if (message.kind === 'test') return m.channel_message_test({}, { locale: baseLocale });
	const params = {
		emoji: message.emoji,
		name: bold(message.actorName),
		range: message.dateRange,
		label: message.eventLabel
	};
	return message.kind === 'created'
		? m.channel_message_created(params, { locale: baseLocale })
		: m.channel_message_updated(params, { locale: baseLocale });
}
