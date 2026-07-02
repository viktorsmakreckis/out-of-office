import { CalendarDate, CalendarDateTime } from '@internationalized/date';
import { describe, expect, it } from 'vitest';
import {
	compareEvents,
	daysBetween,
	eventDateSpan,
	eventsOnDay,
	isValidEvent,
	validEvents,
	type AllDayEvent,
	type TimedEvent
} from './types.js';

function allDay(id: string, start: CalendarDate, end: CalendarDate): AllDayEvent {
	return { id, title: id, allDay: true, start, end };
}

function timed(id: string, start: CalendarDateTime, end: CalendarDateTime): TimedEvent {
	return { id, title: id, allDay: false, start, end };
}

const d = (day: number) => new CalendarDate(2026, 7, day);
const t = (day: number, hour: number, minute = 0) =>
	new CalendarDateTime(2026, 7, day, hour, minute);

describe('isValidEvent', () => {
	it('accepts a one-day all-day event (start equals end)', () => {
		expect(isValidEvent(allDay('a', d(1), d(1)))).toBe(true);
	});

	it('rejects an all-day event ending before it starts', () => {
		expect(isValidEvent(allDay('a', d(2), d(1)))).toBe(false);
	});

	it('rejects a timed event with zero duration', () => {
		expect(isValidEvent(timed('a', t(1, 9), t(1, 9)))).toBe(false);
	});

	it('accepts a timed event with positive duration', () => {
		expect(isValidEvent(timed('a', t(1, 9), t(1, 10)))).toBe(true);
	});
});

describe('validEvents', () => {
	it('filters out invalid events', () => {
		const events = [allDay('good', d(1), d(2)), allDay('bad', d(3), d(1))];
		expect(validEvents(events).map((e) => e.id)).toEqual(['good']);
	});
});

describe('eventDateSpan', () => {
	it('returns the all-day range unchanged', () => {
		expect(eventDateSpan(allDay('a', d(2), d(6)))).toEqual({ start: d(2), end: d(6) });
	});

	it('covers each calendar date a timed event touches', () => {
		const span = eventDateSpan(timed('a', t(26, 22), t(27, 6)));
		expect(span).toEqual({ start: d(26), end: d(27) });
	});

	it('does not include the next day when a timed event ends exactly at midnight', () => {
		const span = eventDateSpan(timed('a', t(1, 20), t(2, 0)));
		expect(span).toEqual({ start: d(1), end: d(1) });
	});
});

describe('daysBetween', () => {
	it('is positive going forward and negative going back', () => {
		expect(daysBetween(d(1), d(8))).toBe(7);
		expect(daysBetween(d(8), d(1))).toBe(-7);
		expect(daysBetween(d(4), d(4))).toBe(0);
	});

	it('crosses month boundaries', () => {
		expect(daysBetween(new CalendarDate(2026, 6, 29), d(1))).toBe(2);
	});
});

describe('eventsOnDay', () => {
	it('includes events covering the day and excludes others', () => {
		const events = [
			allDay('covers', d(2), d(6)),
			allDay('before', d(1), d(1)),
			timed('on-day', t(4, 9), t(4, 10))
		];
		expect(eventsOnDay(events, d(4)).map((e) => e.id)).toEqual(['covers', 'on-day']);
	});
});

describe('compareEvents', () => {
	it('orders earlier start first, longer span first, all-day before timed', () => {
		const long = allDay('long', d(1), d(5));
		const short = allDay('short', d(1), d(2));
		const meeting = timed('meeting', t(1, 9), t(1, 10));
		const sameDayAllDay = allDay('same', d(1), d(1));
		const sorted = [meeting, sameDayAllDay, short, long].sort(compareEvents);
		expect(sorted.map((e) => e.id)).toEqual(['long', 'short', 'same', 'meeting']);
	});

	it('breaks timed ties by start time then id', () => {
		const a = timed('a', t(1, 9), t(1, 10));
		const b = timed('b', t(1, 8), t(1, 9));
		expect([a, b].sort(compareEvents).map((e) => e.id)).toEqual(['b', 'a']);
	});
});
