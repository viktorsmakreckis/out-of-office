import { CalendarDate, CalendarDateTime } from '@internationalized/date';
import { describe, expect, it } from 'vitest';
import {
	cellAtPoint,
	dateRangeBetween,
	minuteAtPoint,
	movedAllDay,
	movedTimed,
	resizedAllDay,
	resizedTimed,
	snapMinute,
	timeOn,
	timeRangeBetween
} from './drag';

const d = (day: number) => new CalendarDate(2026, 7, day);
const t = (day: number, hour: number, minute = 0) =>
	new CalendarDateTime(2026, 7, day, hour, minute);

describe('snapMinute', () => {
	it('rounds to the nearest 15 minutes', () => {
		expect(snapMinute(0)).toBe(0);
		expect(snapMinute(7)).toBe(0);
		expect(snapMinute(8)).toBe(15);
		expect(snapMinute(52)).toBe(45);
		expect(snapMinute(53)).toBe(60);
	});
});

describe('cellAtPoint', () => {
	it('maps a point to its cell', () => {
		expect(cellAtPoint(150, 50, 700, 600, 7, 6)).toEqual({ col: 1, row: 0 });
		expect(cellAtPoint(650, 550, 700, 600, 7, 6)).toEqual({ col: 6, row: 5 });
	});

	it('clamps points outside the grid', () => {
		expect(cellAtPoint(-10, -10, 700, 600, 7, 6)).toEqual({ col: 0, row: 0 });
		expect(cellAtPoint(900, 900, 700, 600, 7, 6)).toEqual({ col: 6, row: 5 });
	});
});

describe('minuteAtPoint', () => {
	it('maps y to a snapped minute of day', () => {
		expect(minuteAtPoint(0, 1152)).toBe(0);
		expect(minuteAtPoint(576, 1152)).toBe(720); // halfway → noon
		expect(minuteAtPoint(1152, 1152)).toBe(1440);
	});

	it('clamps outside the column', () => {
		expect(minuteAtPoint(-50, 1152)).toBe(0);
		expect(minuteAtPoint(5000, 1152)).toBe(1440);
	});
});

describe('timeOn', () => {
	it('builds a CalendarDateTime at a minute of the day', () => {
		expect(timeOn(d(2), 570).compare(t(2, 9, 30))).toBe(0);
	});
});

describe('dateRangeBetween', () => {
	it('orders the endpoints', () => {
		expect(dateRangeBetween(d(5), d(2))).toEqual({ start: d(2), end: d(5) });
		expect(dateRangeBetween(d(2), d(5))).toEqual({ start: d(2), end: d(5) });
	});
});

describe('timeRangeBetween', () => {
	it('orders and snaps the endpoints', () => {
		const range = timeRangeBetween(d(2), 655, 590);
		expect(range.start.compare(t(2, 9, 45))).toBe(0);
		expect(range.end.compare(t(2, 11, 0))).toBe(0);
	});

	it('enforces the minimum duration', () => {
		const range = timeRangeBetween(d(2), 600, 600);
		expect(range.end.compare(range.start.add({ minutes: 15 }))).toBe(0);
	});

	it('keeps the minimum duration at the end of the day', () => {
		const range = timeRangeBetween(d(2), 1440, 1440);
		expect(range.start.compare(t(2, 23, 45))).toBe(0);
		expect(range.end.compare(t(3, 0, 0))).toBe(0);
	});
});

describe('movedAllDay', () => {
	it('shifts both ends by whole days', () => {
		expect(movedAllDay(d(2), d(4), 3)).toEqual({ start: d(5), end: d(7) });
		expect(movedAllDay(d(2), d(4), -1)).toEqual({ start: d(1), end: d(3) });
	});
});

describe('resizedAllDay', () => {
	it('moves one edge to the target', () => {
		expect(resizedAllDay(d(2), d(4), 'end', d(8))).toEqual({ start: d(2), end: d(8) });
		expect(resizedAllDay(d(2), d(4), 'start', d(1))).toEqual({ start: d(1), end: d(4) });
	});

	it('never inverts the range', () => {
		expect(resizedAllDay(d(2), d(4), 'end', d(1))).toEqual({ start: d(2), end: d(2) });
		expect(resizedAllDay(d(2), d(4), 'start', d(9))).toEqual({ start: d(4), end: d(4) });
	});
});

describe('movedTimed', () => {
	it('shifts by days and snapped minutes', () => {
		const moved = movedTimed(t(2, 9), t(2, 10), 1, 37);
		expect(moved.start.compare(t(3, 9, 30))).toBe(0);
		expect(moved.end.compare(t(3, 10, 30))).toBe(0);
	});
});

describe('resizedTimed', () => {
	it('sets the end to the snapped target minute', () => {
		const resized = resizedTimed(t(2, 9), d(2), 640);
		expect(resized.end.compare(t(2, 10, 45))).toBe(0);
	});

	it('enforces the minimum duration', () => {
		const resized = resizedTimed(t(2, 9), d(2), 300);
		expect(resized.end.compare(t(2, 9, 15))).toBe(0);
	});
});
