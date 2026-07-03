import { eventTypeLabelFor } from '$lib/events/labels';
import type { EventType } from '$lib/events/types';
import { m } from '$lib/paraglide/messages.js';
import type { Locale } from '$lib/paraglide/runtime';

/**
 * Provider-neutral channel message. Channel posts render in the team's language
 * (see `locale`), since a channel has no single reader.
 */
export type OooMessage = {
	actorName: string;
	eventLabel: string;
	emoji: string;
	dateRange: string;
	kind: 'created' | 'updated' | 'deleted' | 'test';
	locale: Locale;
};

const eventTypeEmoji: Record<EventType, string> = {
	vacation: '🌴',
	sick_leave: '🤒',
	business_trip: '✈️',
	public_holiday: '🎉',
	remote_work: '🏠',
	other: '📅'
};

const dateFmtCache = new Map<Locale, Intl.DateTimeFormat>();
const timeFmtCache = new Map<Locale, Intl.DateTimeFormat>();

function dateFormatter(locale: Locale): Intl.DateTimeFormat {
	let fmt = dateFmtCache.get(locale);
	if (!fmt) {
		fmt = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
		dateFmtCache.set(locale, fmt);
	}
	return fmt;
}

function timeFormatter(locale: Locale): Intl.DateTimeFormat {
	let fmt = timeFmtCache.get(locale);
	if (!fmt) {
		fmt = new Intl.DateTimeFormat(locale, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
			timeZone: 'UTC'
		});
		timeFmtCache.set(locale, fmt);
	}
	return fmt;
}

/** All-day rows are end-inclusive by date part; timed rows are instants shown in UTC. */
export function formatDateRange(start: Date, end: Date, allDay: boolean, locale: Locale): string {
	if (allDay) {
		const fmt = dateFormatter(locale);
		const from = fmt.format(start);
		const to = fmt.format(end);
		return from === to ? from : `${from} – ${to}`;
	}
	const fmt = timeFormatter(locale);
	return `${fmt.format(start)} – ${fmt.format(end)} UTC`;
}

export function buildEventMessage(
	actorName: string,
	kind: 'created' | 'updated' | 'deleted',
	title: string | null,
	type: string,
	range: { allDay: boolean; start: Date; end: Date },
	locale: Locale
): OooMessage {
	return {
		actorName,
		eventLabel: title ?? eventTypeLabelFor(type, locale),
		emoji: eventTypeEmoji[type as EventType] ?? '📅',
		dateRange: formatDateRange(range.start, range.end, range.allDay, locale),
		kind,
		locale
	};
}

export function testMessage(locale: Locale): OooMessage {
	return { actorName: '', eventLabel: '', emoji: '', dateRange: '', kind: 'test', locale };
}

/** Renders the one-line channel text; `bold` supplies the provider's bold syntax. */
export function composeLine(message: OooMessage, bold: (s: string) => string): string {
	const locale = message.locale;
	if (message.kind === 'test') return m.channel_message_test({}, { locale });
	const params = {
		emoji: message.emoji,
		name: bold(message.actorName),
		range: message.dateRange,
		label: message.eventLabel
	};
	if (message.kind === 'created') return m.channel_message_created(params, { locale });
	if (message.kind === 'updated') return m.channel_message_updated(params, { locale });
	return m.channel_message_deleted(params, { locale });
}
