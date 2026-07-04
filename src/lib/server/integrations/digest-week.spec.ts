import { describe, expect, it } from 'vitest';
import { overlapsWeek, zonedWeekBounds } from './digest-week';

describe('zonedWeekBounds', () => {
	it('anchors the ISO week to Monday 00:00 in UTC', () => {
		const b = zonedWeekBounds(new Date('2026-07-08T10:00:00Z'), 'UTC', 'en-US');
		expect(b.weekStart.toISOString()).toBe('2026-07-06T00:00:00.000Z');
		expect(b.weekEndExclusive.toISOString()).toBe('2026-07-13T00:00:00.000Z');
		expect(b.weekKey).toBe('2026-W28');
		expect(b.weekLabel).toBe('Jul 6 – Jul 12');
	});

	it('uses the local week in a non-UTC zone (late Sunday local rolls back a week)', () => {
		// 02:00Z Mon is 22:00 (Sun) in New York (EDT, UTC-4) → previous ISO week.
		const b = zonedWeekBounds(new Date('2026-07-06T02:00:00Z'), 'America/New_York', 'en-US');
		expect(b.weekStart.toISOString()).toBe('2026-06-29T04:00:00.000Z');
		expect(b.weekEndExclusive.toISOString()).toBe('2026-07-06T04:00:00.000Z');
		expect(b.weekKey).toBe('2026-W27');
	});

	it('handles a DST spring-forward inside the week', () => {
		// London BST starts Sun 2026-03-29 01:00Z; the Mon–Sun week straddles it.
		const b = zonedWeekBounds(new Date('2026-03-25T12:00:00Z'), 'Europe/London', 'en-US');
		expect(b.weekStart.toISOString()).toBe('2026-03-23T00:00:00.000Z');
		expect(b.weekEndExclusive.toISOString()).toBe('2026-03-29T23:00:00.000Z');
	});
});

describe('overlapsWeek', () => {
	const weekStart = new Date('2026-07-06T00:00:00Z');
	const weekEndExclusive = new Date('2026-07-13T00:00:00Z');

	it('includes an all-day event on the first day (end-inclusive by date)', () => {
		const e = { allDay: true, start: new Date('2026-07-06T00:00:00Z'), end: new Date('2026-07-06T00:00:00Z') };
		expect(overlapsWeek(e, weekStart, weekEndExclusive)).toBe(true);
	});

	it('excludes an all-day event ending the day before the week starts', () => {
		const e = { allDay: true, start: new Date('2026-07-05T00:00:00Z'), end: new Date('2026-07-05T00:00:00Z') };
		expect(overlapsWeek(e, weekStart, weekEndExclusive)).toBe(false);
	});

	it('includes a timed event overlapping the last day', () => {
		const e = { allDay: false, start: new Date('2026-07-12T22:00:00Z'), end: new Date('2026-07-12T23:00:00Z') };
		expect(overlapsWeek(e, weekStart, weekEndExclusive)).toBe(true);
	});

	it('excludes an event entirely after the week', () => {
		const e = { allDay: false, start: new Date('2026-07-13T00:00:00Z'), end: new Date('2026-07-13T01:00:00Z') };
		expect(overlapsWeek(e, weekStart, weekEndExclusive)).toBe(false);
	});
});
