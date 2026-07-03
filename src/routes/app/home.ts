import type { CalendarDate } from '@internationalized/date';
import { daysBetween, eventDateSpan, type CalendarEvent } from '$lib/components/calendar';

/** Length of the availability board window, starting today. */
export const BOARD_DAYS = 14;

type Owned = { ownerId: string; ownerName: string };

export type BoardSegment<T> = {
	event: CalendarEvent<T>;
	/** Inclusive calendar-date span of the whole event (may exceed the window). */
	span: { start: CalendarDate; end: CalendarDate };
	/** 0-based first board column the event covers. */
	startIndex: number;
	/** 0-based last board column the event covers (inclusive). */
	endIndex: number;
	/** True when the event extends past the window edge. */
	continuesLeft: boolean;
	continuesRight: boolean;
};

export type BoardRow<T> = { ownerId: string; ownerName: string; segments: BoardSegment<T>[] };

/**
 * One row per person with at least one event inside [start, start + days),
 * viewer first, others by name. Segments are clipped to the window.
 */
export function buildBoard<T extends Owned>(
	events: CalendarEvent<T>[],
	start: CalendarDate,
	viewerId: string,
	days = BOARD_DAYS
): BoardRow<T>[] {
	const rows = new Map<string, BoardRow<T>>();
	for (const event of events) {
		const data = event.data;
		if (!data) continue;
		const span = eventDateSpan(event);
		const from = daysBetween(start, span.start);
		const to = daysBetween(start, span.end);
		if (to < 0 || from >= days) continue;
		const segment: BoardSegment<T> = {
			event,
			span,
			startIndex: Math.max(0, from),
			endIndex: Math.min(days - 1, to),
			continuesLeft: from < 0,
			continuesRight: to >= days
		};
		const row = rows.get(data.ownerId);
		if (row) row.segments.push(segment);
		else rows.set(data.ownerId, { ...data, segments: [segment] });
	}
	for (const row of rows.values()) row.segments.sort((a, b) => a.startIndex - b.startIndex);
	return [...rows.values()].sort((a, b) => {
		if (a.ownerId === viewerId) return -1;
		if (b.ownerId === viewerId) return 1;
		return a.ownerName.localeCompare(b.ownerName);
	});
}

export type AwayEntry<T> = {
	data: T;
	event: CalendarEvent<T>;
	/** Last calendar date of the absence (inclusive). */
	lastDay: CalendarDate;
};

/** People away on `day`, sorted by name; per person, the absence that ends last. */
export function awayOn<T extends Owned>(
	events: CalendarEvent<T>[],
	day: CalendarDate
): AwayEntry<T>[] {
	const byOwner = new Map<string, AwayEntry<T>>();
	for (const event of events) {
		const data = event.data;
		if (!data) continue;
		const span = eventDateSpan(event);
		if (span.start.compare(day) > 0 || span.end.compare(day) < 0) continue;
		const current = byOwner.get(data.ownerId);
		if (!current || span.end.compare(current.lastDay) > 0) {
			byOwner.set(data.ownerId, { data, event, lastDay: span.end });
		}
	}
	return [...byOwner.values()].sort((a, b) => a.data.ownerName.localeCompare(b.data.ownerName));
}

export type UpcomingEntry<T> = {
	event: CalendarEvent<T>;
	/** Inclusive calendar-date span of the event. */
	span: { start: CalendarDate; end: CalendarDate };
};

/** Events still ongoing or in the future, soonest first. */
export function upcomingEvents<T>(
	events: CalendarEvent<T>[],
	today: CalendarDate,
	limit = 3
): UpcomingEntry<T>[] {
	return events
		.map((event) => ({ event, span: eventDateSpan(event) }))
		.filter((entry) => entry.span.end.compare(today) >= 0)
		.sort((a, b) => a.span.start.compare(b.span.start))
		.slice(0, limit);
}
