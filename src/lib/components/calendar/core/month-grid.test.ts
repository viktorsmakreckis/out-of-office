import { CalendarDate } from '@internationalized/date';
import { describe, expect, it } from 'vitest';
import { monthGrid, weekDays, DAYS_IN_WEEK, WEEKS_IN_GRID } from './month-grid';

const jul2026 = new CalendarDate(2026, 7, 15);

describe('monthGrid', () => {
	it('always returns 6 weeks of 7 days', () => {
		const grid = monthGrid(jul2026, 'pl');
		expect(grid).toHaveLength(WEEKS_IN_GRID);
		for (const week of grid) expect(week).toHaveLength(DAYS_IN_WEEK);
	});

	it('starts on Monday for pl and Sunday for en', () => {
		// 2026-07-01 is a Wednesday.
		expect(monthGrid(jul2026, 'pl')[0][0]).toEqual(new CalendarDate(2026, 6, 29));
		expect(monthGrid(jul2026, 'en')[0][0]).toEqual(new CalendarDate(2026, 6, 28));
	});

	it('produces 42 consecutive days', () => {
		const days = monthGrid(jul2026, 'pl').flat();
		for (let i = 1; i < days.length; i++) {
			expect(days[i].compare(days[i - 1].add({ days: 1 }))).toBe(0);
		}
	});

	it('covers every day of the focal month', () => {
		const days = monthGrid(jul2026, 'en').flat();
		for (let day = 1; day <= 31; day++) {
			expect(days.some((d) => d.compare(new CalendarDate(2026, 7, day)) === 0)).toBe(true);
		}
	});

	it('handles February of a leap year', () => {
		const feb = monthGrid(new CalendarDate(2028, 2, 10), 'pl');
		const days = feb.flat();
		expect(days.some((d) => d.compare(new CalendarDate(2028, 2, 29)) === 0)).toBe(true);
	});
});

describe('weekDays', () => {
	it('returns the 7 days of the focal week starting per locale', () => {
		const days = weekDays(new CalendarDate(2026, 7, 2), 'pl');
		expect(days).toHaveLength(7);
		expect(days[0]).toEqual(new CalendarDate(2026, 6, 29));
		expect(days[6]).toEqual(new CalendarDate(2026, 7, 5));
	});
});
