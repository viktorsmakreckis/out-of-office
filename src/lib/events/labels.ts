import { m } from '$lib/paraglide/messages.js';
import type { EventType } from './types';

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
