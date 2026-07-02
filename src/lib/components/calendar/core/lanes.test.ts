import { CalendarDate, CalendarDateTime } from '@internationalized/date';
import { describe, expect, it } from 'vitest';
import { overflowCounts, packLanes } from './lanes';
import type { AllDayEvent, TimedEvent } from './types';

const d = (day: number) => new CalendarDate(2026, 7, day);
const rowStart = d(6); // Monday 2026-07-06

function allDay(id: string, start: number, end: number): AllDayEvent {
	return { id, title: id, allDay: true, start: d(start), end: d(end) };
}

describe('packLanes', () => {
	it('places non-overlapping events on the same lane', () => {
		const segments = packLanes([allDay('a', 6, 7), allDay('b', 9, 10)], rowStart, 7);
		expect(segments.every((s) => s.lane === 0)).toBe(true);
	});

	it('stacks overlapping events on separate lanes, longest first', () => {
		const long = allDay('long', 6, 10);
		const short = allDay('short', 7, 8);
		const segments = packLanes([short, long], rowStart, 7);
		const byId = Object.fromEntries(segments.map((s) => [s.event.id, s]));
		expect(byId.long.lane).toBe(0);
		expect(byId.short.lane).toBe(1);
	});

	it('clips segments to the row and flags continuation', () => {
		const segments = packLanes([allDay('span', 3, 15)], rowStart, 7);
		expect(segments).toHaveLength(1);
		expect(segments[0]).toMatchObject({
			startCol: 0,
			span: 7,
			continuesLeft: true,
			continuesRight: true
		});
	});

	it('computes startCol and span inside the row', () => {
		const segments = packLanes([allDay('mid', 8, 9)], rowStart, 7);
		expect(segments[0]).toMatchObject({
			startCol: 2,
			span: 2,
			continuesLeft: false,
			continuesRight: false
		});
	});

	it('excludes events outside the row', () => {
		expect(packLanes([allDay('before', 1, 5), allDay('after', 13, 20)], rowStart, 7)).toHaveLength(
			0
		);
	});

	it('keeps the in-row event and drops the outside one when mixed', () => {
		const segments = packLanes([allDay('before', 1, 5), allDay('inside', 8, 9)], rowStart, 7);
		expect(segments.map((s) => s.event.id)).toEqual(['inside']);
	});

	it('includes timed events as single-column segments via their date span', () => {
		const meeting: TimedEvent = {
			id: 'meeting',
			title: 'meeting',
			allDay: false,
			start: new CalendarDateTime(2026, 7, 8, 9, 0),
			end: new CalendarDateTime(2026, 7, 8, 10, 0)
		};
		const segments = packLanes([meeting], rowStart, 7);
		expect(segments[0]).toMatchObject({ startCol: 2, span: 1 });
	});

	it('reuses freed lanes (first fit)', () => {
		const a = allDay('a', 6, 7);
		const b = allDay('b', 6, 12); // occupies lane 1 after a takes lane 0... or lane 0 if sorted longer-first
		const c = allDay('c', 9, 10); // fits back on the lane a freed
		const segments = packLanes([a, b, c], rowStart, 7);
		const byId = Object.fromEntries(segments.map((s) => [s.event.id, s]));
		// b is longest → lane 0; a takes lane 1; c fits lane 1 after a ends.
		expect(byId.b.lane).toBe(0);
		expect(byId.a.lane).toBe(1);
		expect(byId.c.lane).toBe(1);
	});
});

describe('overflowCounts', () => {
	it('counts hidden events per column', () => {
		const events = [allDay('a', 6, 12), allDay('b', 6, 12), allDay('c', 6, 7), allDay('d', 6, 6)];
		const segments = packLanes(events, rowStart, 7);
		const counts = overflowCounts(segments, 7, 2);
		// Lanes 0..1 visible; lane 2 (c: cols 0-1) and lane 3 (d: col 0) hidden.
		expect(counts).toEqual([2, 1, 0, 0, 0, 0, 0]);
	});

	it('is all zeros when everything fits', () => {
		const segments = packLanes([allDay('a', 6, 7)], rowStart, 7);
		expect(overflowCounts(segments, 7, 2)).toEqual([0, 0, 0, 0, 0, 0, 0]);
	});
});
