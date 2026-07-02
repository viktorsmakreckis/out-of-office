import { CalendarDate, CalendarDateTime } from '@internationalized/date';
import { describe, expect, it } from 'vitest';
import { layoutDayColumns } from './columns';
import type { TimedEvent } from './types';

const day = new CalendarDate(2026, 7, 9);
const t = (dayOfMonth: number, hour: number, minute = 0) =>
	new CalendarDateTime(2026, 7, dayOfMonth, hour, minute);

function timed(id: string, start: CalendarDateTime, end: CalendarDateTime): TimedEvent {
	return { id, title: id, allDay: false, start, end };
}

describe('layoutDayColumns', () => {
	it('gives non-overlapping events full width', () => {
		const placements = layoutDayColumns(
			[timed('a', t(9, 9), t(9, 10)), timed('b', t(9, 11), t(9, 12))],
			day
		);
		expect(placements.every((p) => p.col === 0 && p.colCount === 1)).toBe(true);
	});

	it('splits two overlapping events into two columns', () => {
		const placements = layoutDayColumns(
			[timed('a', t(9, 10), t(9, 11)), timed('b', t(9, 10, 30), t(9, 11, 30))],
			day
		);
		const byId = Object.fromEntries(placements.map((p) => [p.event.id, p]));
		expect(byId.a).toMatchObject({ col: 0, colCount: 2 });
		expect(byId.b).toMatchObject({ col: 1, colCount: 2 });
	});

	it('shares colCount across a transitive overlap chain', () => {
		// a overlaps b, b overlaps c, but a does not overlap c — still one group.
		const placements = layoutDayColumns(
			[
				timed('a', t(9, 9), t(9, 10, 30)),
				timed('b', t(9, 10), t(9, 12)),
				timed('c', t(9, 11), t(9, 13))
			],
			day
		);
		const byId = Object.fromEntries(placements.map((p) => [p.event.id, p]));
		expect(byId.a.colCount).toBe(2);
		expect(byId.b.colCount).toBe(2);
		expect(byId.c.colCount).toBe(2);
		expect(byId.c.col).toBe(0); // reuses the column a freed
	});

	it('computes minutes from midnight', () => {
		const [p] = layoutDayColumns([timed('a', t(9, 9, 15), t(9, 10, 45))], day);
		expect(p.startMinute).toBe(555);
		expect(p.endMinute).toBe(645);
	});

	it('clips events crossing midnight to the day', () => {
		const [p] = layoutDayColumns([timed('a', t(8, 22), t(9, 6))], day);
		expect(p.startMinute).toBe(0);
		expect(p.endMinute).toBe(360);
	});

	it('excludes events not touching the day', () => {
		expect(layoutDayColumns([timed('a', t(8, 9), t(8, 10))], day)).toHaveLength(0);
	});

	it('excludes an event ending exactly at the day start', () => {
		expect(layoutDayColumns([timed('a', t(8, 22), t(9, 0))], day)).toHaveLength(0);
	});
});
