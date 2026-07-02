import {
	toCalendarDateTime,
	type CalendarDate,
	type CalendarDateTime
} from '@internationalized/date';
import { MINUTES_IN_DAY, type TimedEvent } from './types.js';

export type ColumnPlacement<T = unknown> = {
	event: TimedEvent<T>;
	/** Minutes from the day's midnight, clipped to [0, 1440]. */
	startMinute: number;
	endMinute: number;
	col: number;
	colCount: number;
};

/**
 * Lays out one day's timed events into side-by-side columns. Events in the same
 * transitive overlap group share colCount; columns are assigned greedily so a
 * freed column is reused by the next non-overlapping event.
 */
export function layoutDayColumns<T>(
	events: TimedEvent<T>[],
	day: CalendarDate
): ColumnPlacement<T>[] {
	const dayStart = toCalendarDateTime(day);
	const dayEnd = toCalendarDateTime(day.add({ days: 1 }));

	const clipped = events
		.filter((event) => event.start.compare(dayEnd) < 0 && event.end.compare(dayStart) > 0)
		.map((event) => ({
			event,
			startMinute: event.start.compare(dayStart) <= 0 ? 0 : minutesFromMidnight(event.start),
			endMinute: event.end.compare(dayEnd) >= 0 ? MINUTES_IN_DAY : minutesFromMidnight(event.end),
			col: 0,
			colCount: 0
		}))
		.sort(
			(a, b) =>
				a.startMinute - b.startMinute ||
				b.endMinute - a.endMinute ||
				(a.event.id < b.event.id ? -1 : 1)
		);

	let group: ColumnPlacement<T>[] = [];
	let columnEnds: number[] = [];
	let groupEnd = 0;

	const closeGroup = () => {
		for (const placement of group) placement.colCount = columnEnds.length;
		group = [];
		columnEnds = [];
		groupEnd = 0;
	};

	for (const placement of clipped) {
		if (group.length > 0 && placement.startMinute >= groupEnd) closeGroup();
		let col = columnEnds.findIndex((end) => end <= placement.startMinute);
		if (col === -1) col = columnEnds.length;
		placement.col = col;
		columnEnds[col] = placement.endMinute;
		group.push(placement);
		groupEnd = Math.max(groupEnd, placement.endMinute);
	}
	closeGroup();

	return clipped;
}

function minutesFromMidnight(time: CalendarDateTime): number {
	return time.hour * 60 + time.minute;
}
