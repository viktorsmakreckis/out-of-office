import { m } from '$lib/paraglide/messages.js';
import type { Locale } from '$lib/paraglide/runtime';
import type { EventType } from './types';

// Two parallel switches over EventType: this one resolves the current request locale
// (client components), eventTypeLabelFor below takes an explicit locale (server fan-out).
// Keep both cases in sync when adding an event type.
export function eventTypeLabel(type: EventType): string {
	switch (type) {
		case 'vacation':
			return m.calendar_event_type_vacation();
		case 'sick_leave':
			return m.calendar_event_type_sick_leave();
		case 'business_trip':
			return m.calendar_event_type_business_trip();
		case 'public_holiday':
			return m.calendar_event_type_public_holiday();
		case 'remote_work':
			return m.calendar_event_type_remote_work();
		case 'other':
			return m.calendar_event_type_other();
	}
}

/** Localized display label for a calendar_event type, for an explicit (non-current) locale. */
export function eventTypeLabelFor(type: string, locale: Locale): string {
	switch (type) {
		case 'vacation':
			return m.calendar_event_type_vacation({}, { locale });
		case 'sick_leave':
			return m.calendar_event_type_sick_leave({}, { locale });
		case 'business_trip':
			return m.calendar_event_type_business_trip({}, { locale });
		case 'public_holiday':
			return m.calendar_event_type_public_holiday({}, { locale });
		case 'remote_work':
			return m.calendar_event_type_remote_work({}, { locale });
		default:
			return m.calendar_event_type_other({}, { locale });
	}
}
