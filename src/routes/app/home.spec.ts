import { CalendarDate, CalendarDateTime } from '@internationalized/date';
import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '$lib/components/calendar';
import { awayOn, BOARD_DAYS, buildBoard, upcomingEvents } from './home';

type Owned = { ownerId: string; ownerName: string };

const today = new CalendarDate(2026, 7, 3);

function allDay(
	id: string,
	owner: Owned,
	start: CalendarDate,
	end: CalendarDate
): CalendarEvent<Owned> {
	return { id, title: id, allDay: true, start, end, data: owner };
}

const me = { ownerId: 'me', ownerName: 'Zoe' };
const anna = { ownerId: 'u1', ownerName: 'Anna' };
const bart = { ownerId: 'u2', ownerName: 'Bart' };

describe('buildBoard', () => {
	it('places a single-day event in its column with both ends closed', () => {
		const rows = buildBoard(
			[allDay('a', anna, today.add({ days: 2 }), today.add({ days: 2 }))],
			today,
			'me'
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].segments).toEqual([
			expect.objectContaining({
				startIndex: 2,
				endIndex: 2,
				continuesLeft: false,
				continuesRight: false
			})
		]);
	});

	it('clips events crossing the window edges and marks them as continuing', () => {
		const rows = buildBoard(
			[allDay('a', anna, today.subtract({ days: 3 }), today.add({ days: 20 }))],
			today,
			'me'
		);
		expect(rows[0].segments).toEqual([
			expect.objectContaining({
				startIndex: 0,
				endIndex: BOARD_DAYS - 1,
				continuesLeft: true,
				continuesRight: true
			})
		]);
	});

	it('drops events entirely outside the window', () => {
		const rows = buildBoard(
			[
				allDay('past', anna, today.subtract({ days: 5 }), today.subtract({ days: 1 })),
				allDay('far', bart, today.add({ days: BOARD_DAYS }), today.add({ days: BOARD_DAYS + 2 }))
			],
			today,
			'me'
		);
		expect(rows).toHaveLength(0);
	});

	it('puts the viewer first and sorts the rest by name', () => {
		const day = today.add({ days: 1 });
		const rows = buildBoard(
			[allDay('b', bart, day, day), allDay('z', me, day, day), allDay('a', anna, day, day)],
			today,
			'me'
		);
		expect(rows.map((row) => row.ownerName)).toEqual(['Zoe', 'Anna', 'Bart']);
	});

	it('does not leak a timed event ending at midnight into the next day', () => {
		const event: CalendarEvent<Owned> = {
			id: 't',
			title: 't',
			allDay: false,
			start: new CalendarDateTime(2026, 7, 6, 9, 0),
			end: new CalendarDateTime(2026, 7, 7, 0, 0),
			data: anna
		};
		const rows = buildBoard([event], today, 'me');
		expect(rows[0].segments[0]).toMatchObject({ startIndex: 3, endIndex: 3 });
	});

	it('groups multiple events of one owner into one row, segments in order', () => {
		const rows = buildBoard(
			[
				allDay('late', anna, today.add({ days: 8 }), today.add({ days: 9 })),
				allDay('early', anna, today, today.add({ days: 1 }))
			],
			today,
			'me'
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].segments.map((segment) => segment.startIndex)).toEqual([0, 8]);
	});
});

describe('awayOn', () => {
	it('returns only people whose events cover the day, sorted by name', () => {
		const entries = awayOn(
			[
				allDay('b', bart, today, today.add({ days: 1 })),
				allDay('a', anna, today.subtract({ days: 1 }), today),
				allDay('future', me, today.add({ days: 1 }), today.add({ days: 2 }))
			],
			today
		);
		expect(entries.map((entry) => entry.data.ownerName)).toEqual(['Anna', 'Bart']);
	});

	it('keeps the event that ends last when several cover the day', () => {
		const entries = awayOn(
			[
				allDay('short', anna, today, today),
				allDay('long', anna, today.subtract({ days: 2 }), today.add({ days: 4 }))
			],
			today
		);
		expect(entries).toHaveLength(1);
		expect(entries[0].event.id).toBe('long');
		expect(entries[0].lastDay.compare(today.add({ days: 4 }))).toBe(0);
	});
});

describe('upcomingEvents', () => {
	it('drops past events, keeps ongoing ones, sorts by start, and limits', () => {
		const events = [
			allDay('past', me, today.subtract({ days: 9 }), today.subtract({ days: 2 })),
			allDay('ongoing', me, today.subtract({ days: 1 }), today.add({ days: 1 })),
			allDay('c', me, today.add({ days: 30 }), today.add({ days: 31 })),
			allDay('b', me, today.add({ days: 10 }), today.add({ days: 12 })),
			allDay('a', me, today.add({ days: 5 }), today.add({ days: 6 }))
		];
		expect(upcomingEvents(events, today, 3).map((entry) => entry.event.id)).toEqual([
			'ongoing',
			'a',
			'b'
		]);
	});
});
