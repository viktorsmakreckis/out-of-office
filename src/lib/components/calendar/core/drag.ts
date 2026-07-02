import {
	toCalendarDateTime,
	type CalendarDate,
	type CalendarDateTime
} from '@internationalized/date';
import { MINUTES_IN_DAY } from './types.js';

export const SNAP_MINUTES = 15;
export const MIN_EVENT_MINUTES = 15;

export function snapMinute(minute: number): number {
	return Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES;
}

/** Maps grid-relative coordinates to a cell, clamped to the grid. */
export function cellAtPoint(
	x: number,
	y: number,
	width: number,
	height: number,
	cols: number,
	rows: number
): { col: number; row: number } {
	return {
		col: clamp(Math.floor((x / width) * cols), 0, cols - 1),
		row: clamp(Math.floor((y / height) * rows), 0, rows - 1)
	};
}

/** Maps a column-relative y to a snapped minute of the day. */
export function minuteAtPoint(y: number, height: number): number {
	return clamp(snapMinute((y / height) * MINUTES_IN_DAY), 0, MINUTES_IN_DAY);
}

export function timeOn(day: CalendarDate, minute: number): CalendarDateTime {
	return toCalendarDateTime(day).add({ minutes: minute });
}

/** Ordered inclusive all-day range between a drag anchor and target. */
export function dateRangeBetween(
	anchor: CalendarDate,
	target: CalendarDate
): { start: CalendarDate; end: CalendarDate } {
	return anchor.compare(target) <= 0
		? { start: anchor, end: target }
		: { start: target, end: anchor };
}

/** Ordered, snapped timed range on `day`; at least MIN_EVENT_MINUTES long. */
export function timeRangeBetween(
	day: CalendarDate,
	anchorMinute: number,
	targetMinute: number
): { start: CalendarDateTime; end: CalendarDateTime } {
	let start = clamp(snapMinute(anchorMinute), 0, MINUTES_IN_DAY);
	let end = clamp(snapMinute(targetMinute), 0, MINUTES_IN_DAY);
	if (end < start) [start, end] = [end, start];
	if (end - start < MIN_EVENT_MINUTES) end = start + MIN_EVENT_MINUTES;
	if (end > MINUTES_IN_DAY) {
		end = MINUTES_IN_DAY;
		start = MINUTES_IN_DAY - MIN_EVENT_MINUTES;
	}
	return { start: timeOn(day, start), end: timeOn(day, end) };
}

export function movedAllDay(
	start: CalendarDate,
	end: CalendarDate,
	dayDelta: number
): { start: CalendarDate; end: CalendarDate } {
	return { start: start.add({ days: dayDelta }), end: end.add({ days: dayDelta }) };
}

/** Drags one edge of an all-day event to `target`; collapses to one day rather than inverting. */
export function resizedAllDay(
	start: CalendarDate,
	end: CalendarDate,
	edge: 'start' | 'end',
	target: CalendarDate
): { start: CalendarDate; end: CalendarDate } {
	if (edge === 'start') return { start: target.compare(end) > 0 ? end : target, end };
	return { start, end: target.compare(start) < 0 ? start : target };
}

export function movedTimed(
	start: CalendarDateTime,
	end: CalendarDateTime,
	dayDelta: number,
	minuteDelta: number
): { start: CalendarDateTime; end: CalendarDateTime } {
	const snapped = snapMinute(minuteDelta);
	return {
		start: start.add({ days: dayDelta, minutes: snapped }),
		end: end.add({ days: dayDelta, minutes: snapped })
	};
}

/** Drags a timed event's end to a minute on `day`; keeps end ≥ start + MIN_EVENT_MINUTES. */
export function resizedTimed(
	start: CalendarDateTime,
	day: CalendarDate,
	minute: number
): { start: CalendarDateTime; end: CalendarDateTime } {
	const minimumEnd = start.add({ minutes: MIN_EVENT_MINUTES });
	let end = timeOn(day, clamp(snapMinute(minute), 0, MINUTES_IN_DAY));
	if (end.compare(minimumEnd) < 0) end = minimumEnd;
	return { start, end };
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
