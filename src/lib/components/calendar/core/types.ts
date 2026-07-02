import { toCalendarDate, type CalendarDate, type CalendarDateTime } from '@internationalized/date';

export const EVENT_COLORS = ['blue', 'green', 'amber', 'red', 'violet', 'rose', 'gray'] as const;
export type EventColor = (typeof EVENT_COLORS)[number];

export type CalendarView = 'month' | 'week' | 'agenda';

export const MINUTES_IN_DAY = 1440;

type CalendarEventBase<T> = {
	id: string;
	title: string;
	/** Semantic color variant; defaults to 'gray'. */
	color?: EventColor;
	/** When false, the event cannot be moved or resized. Defaults to true. */
	editable?: boolean;
	/** Consumer data, passed back through callbacks and snippets. */
	data?: T;
};

export type AllDayEvent<T = unknown> = CalendarEventBase<T> & {
	allDay: true;
	start: CalendarDate;
	/** Inclusive: a one-day event has start equal to end. */
	end: CalendarDate;
};

export type TimedEvent<T = unknown> = CalendarEventBase<T> & {
	allDay: false;
	start: CalendarDateTime;
	/** Exclusive. */
	end: CalendarDateTime;
};

export type CalendarEvent<T = unknown> = AllDayEvent<T> | TimedEvent<T>;

export type RangeSelection =
	| { allDay: true; start: CalendarDate; end: CalendarDate }
	| { allDay: false; start: CalendarDateTime; end: CalendarDateTime };

export type EventChange =
	{ start: CalendarDate; end: CalendarDate } | { start: CalendarDateTime; end: CalendarDateTime };

export function isValidEvent(event: CalendarEvent<unknown>): boolean {
	return event.allDay ? event.start.compare(event.end) <= 0 : event.start.compare(event.end) < 0;
}

export function validEvents<T>(events: CalendarEvent<T>[]): CalendarEvent<T>[] {
	return events.filter((event) => {
		if (isValidEvent(event)) return true;
		if (import.meta.env.DEV) {
			console.warn(`calendar: skipping event "${event.id}" — end is before start`);
		}
		return false;
	});
}

/** Inclusive range of calendar dates the event covers. */
export function eventDateSpan(event: CalendarEvent<unknown>): {
	start: CalendarDate;
	end: CalendarDate;
} {
	if (event.allDay) return { start: event.start, end: event.end };
	const start = toCalendarDate(event.start);
	let end = toCalendarDate(event.end);
	// The end is exclusive: an event ending exactly at midnight does not touch the next day.
	if (end.compare(start) > 0 && event.end.hour === 0 && event.end.minute === 0) {
		end = end.subtract({ days: 1 });
	}
	return { start, end };
}

export function daysBetween(from: CalendarDate, to: CalendarDate): number {
	return Math.round((to.toDate('UTC').getTime() - from.toDate('UTC').getTime()) / 86_400_000);
}

export function eventsOnDay<T>(events: CalendarEvent<T>[], day: CalendarDate): CalendarEvent<T>[] {
	return events
		.filter((event) => {
			const span = eventDateSpan(event);
			return span.start.compare(day) <= 0 && span.end.compare(day) >= 0;
		})
		.sort(compareEvents);
}

/** Earlier start first, longer span first, all-day before timed, then start time, then id. */
export function compareEvents(a: CalendarEvent<unknown>, b: CalendarEvent<unknown>): number {
	const spanA = eventDateSpan(a);
	const spanB = eventDateSpan(b);
	const byStart = spanA.start.compare(spanB.start);
	if (byStart !== 0) return byStart < 0 ? -1 : 1;
	const byLength = daysBetween(spanB.start, spanB.end) - daysBetween(spanA.start, spanA.end);
	if (byLength !== 0) return byLength;
	if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
	if (!a.allDay && !b.allDay) {
		const byTime = a.start.compare(b.start);
		if (byTime !== 0) return byTime < 0 ? -1 : 1;
	}
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
