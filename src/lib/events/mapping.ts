import {
	fromDate,
	parseDate,
	parseDateTime,
	parseTime,
	toCalendarDate,
	toCalendarDateTime,
	toZoned
} from '@internationalized/date';
import type { CalendarEvent } from '$lib/components/calendar';
import { eventTypeLabel } from './labels';
import {
	DEFAULT_END_TIME,
	DEFAULT_START_TIME,
	eventTypeColors,
	type EventFormValues,
	type EventRecord
} from './types';

export function formatTimeOfDay(value: { hour: number; minute: number }): string {
	const pad = (part: number) => String(part).padStart(2, '0');
	return `${pad(value.hour)}:${pad(value.minute)}`;
}

const knownTimezones = new Set(Intl.supportedValuesOf('timeZone'));

/** Guards against an invalid stored profile timezone (spec: fall back to UTC). */
export function safeTimezone(timezone: string): string {
	return knownTimezones.has(timezone) ? timezone : 'UTC';
}

export function toCalendarEvent<T extends EventRecord>(
	record: T,
	timezone: string
): CalendarEvent<T> {
	timezone = safeTimezone(timezone);
	const base = {
		id: record.id,
		title: record.title ?? eventTypeLabel(record.type),
		color: eventTypeColors[record.type],
		data: record
	};
	if (record.allDay) {
		return {
			...base,
			allDay: true,
			start: toCalendarDate(fromDate(record.start, 'UTC')),
			end: toCalendarDate(fromDate(record.end, 'UTC'))
		};
	}
	return {
		...base,
		allDay: false,
		start: toCalendarDateTime(fromDate(record.start, timezone)),
		end: toCalendarDateTime(fromDate(record.end, timezone))
	};
}

export function toFormValues(record: EventRecord, timezone: string): EventFormValues {
	timezone = safeTimezone(timezone);
	const shared = { id: record.id, type: record.type, title: record.title ?? '' };
	if (record.allDay) {
		return {
			...shared,
			allDay: true,
			startDate: toCalendarDate(fromDate(record.start, 'UTC')).toString(),
			endDate: toCalendarDate(fromDate(record.end, 'UTC')).toString(),
			startTime: DEFAULT_START_TIME,
			endTime: DEFAULT_END_TIME
		};
	}
	const start = toCalendarDateTime(fromDate(record.start, timezone));
	const end = toCalendarDateTime(fromDate(record.end, timezone));
	return {
		...shared,
		allDay: false,
		startDate: toCalendarDate(start).toString(),
		endDate: toCalendarDate(end).toString(),
		startTime: formatTimeOfDay(start),
		endTime: formatTimeOfDay(end)
	};
}

export function formValuesToRange(
	values: Pick<EventFormValues, 'allDay' | 'startDate' | 'endDate' | 'startTime' | 'endTime'>,
	timezone: string
): { start: Date; end: Date } {
	timezone = safeTimezone(timezone);
	if (values.allDay) {
		return {
			start: parseDate(values.startDate).toDate('UTC'),
			end: parseDate(values.endDate).toDate('UTC')
		};
	}
	const start = toCalendarDateTime(parseDate(values.startDate), parseTime(values.startTime));
	const end = toCalendarDateTime(parseDate(values.endDate), parseTime(values.endTime));
	return { start: toZoned(start, timezone).toDate(), end: toZoned(end, timezone).toDate() };
}

export function changeRangeToInstants(
	change: { allDay: boolean; start: string; end: string },
	timezone: string
): { start: Date; end: Date } {
	timezone = safeTimezone(timezone);
	if (change.allDay) {
		return {
			start: parseDate(change.start).toDate('UTC'),
			end: parseDate(change.end).toDate('UTC')
		};
	}
	return {
		start: toZoned(parseDateTime(change.start), timezone).toDate(),
		end: toZoned(parseDateTime(change.end), timezone).toDate()
	};
}
