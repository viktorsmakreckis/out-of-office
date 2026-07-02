import type { EventColor } from '$lib/components/calendar';

// NOTE: this file is imported by src/lib/server/db/schema.ts, which drizzle-kit
// bundles without $lib alias resolution. Keep it free of value imports; type-only
// imports are erased at compile time.

export const eventTypes = [
	'vacation',
	'sick_leave',
	'business_trip',
	'public_holiday',
	'remote_work',
	'other'
] as const;
export type EventType = (typeof eventTypes)[number];

export const eventTypeColors: Record<EventType, EventColor> = {
	vacation: 'blue',
	sick_leave: 'red',
	business_trip: 'violet',
	public_holiday: 'green',
	remote_work: 'amber',
	other: 'gray'
};

export const DEFAULT_START_TIME = '09:00';
export const DEFAULT_END_TIME = '17:00';

/**
 * The subset of a calendar_event row the client works with.
 * start/end are instants; all-day rows hold UTC midnight and only their
 * date part is meaningful (end-inclusive).
 */
export type EventRecord = {
	id: string;
	type: EventType;
	title: string | null;
	allDay: boolean;
	start: Date;
	end: Date;
};

/** Flat field values of the event dialog form. Empty id means "create". */
export type EventFormValues = {
	id: string;
	type: EventType;
	title: string;
	allDay: boolean;
	startDate: string;
	endDate: string;
	startTime: string;
	endTime: string;
};
