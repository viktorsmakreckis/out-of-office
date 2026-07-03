import { CalendarDate, CalendarDateTime } from '@internationalized/date';
import { describe, expect, it } from 'vitest';
import {
	formatDayHeading,
	formatDateRange,
	formatDateTimeRange,
	formatHourLabel,
	formatMonthLabel,
	formatTime,
	formatTimeRange,
	formatWeekLabel,
	formatWeekdayName
} from './format.js';

const jul2 = new CalendarDate(2026, 7, 2);

describe('formatMonthLabel', () => {
	it('formats month and year per locale', () => {
		expect(formatMonthLabel(jul2, 'en')).toBe('July 2026');
		expect(formatMonthLabel(jul2, 'pl')).toBe('lipiec 2026');
		expect(formatMonthLabel(jul2, 'fr')).toBe('juillet 2026');
	});
});

describe('formatWeekLabel', () => {
	it('includes both endpoints and the year', () => {
		const label = formatWeekLabel(
			new CalendarDate(2026, 6, 29),
			new CalendarDate(2026, 7, 5),
			'en'
		);
		expect(label).toContain('29');
		expect(label).toContain('5');
		expect(label).toContain('2026');
		expect(label).toMatch(/Jun|Jul/);
	});
});

describe('formatWeekdayName', () => {
	it('formats short and long weekday names', () => {
		expect(formatWeekdayName(jul2, 'en')).toMatch(/^Thu/);
		expect(formatWeekdayName(jul2, 'en', 'long')).toBe('Thursday');
		expect(formatWeekdayName(jul2, 'pl', 'long')).toBe('czwartek');
	});
});

describe('formatDayHeading', () => {
	it('includes weekday, day and month', () => {
		const heading = formatDayHeading(jul2, 'en');
		expect(heading).toContain('Thursday');
		expect(heading).toContain('2');
		expect(heading).toContain('July');
	});
});

describe('formatTime', () => {
	it('formats a time per locale', () => {
		expect(formatTime(new CalendarDateTime(2026, 7, 2, 9, 0), 'en')).toMatch(/9:00\sAM/);
		expect(formatTime(new CalendarDateTime(2026, 7, 2, 15, 30), 'pl')).toBe('15:30');
	});
});

describe('formatTimeRange', () => {
	it('joins start and end', () => {
		const range = formatTimeRange(
			new CalendarDateTime(2026, 7, 2, 9, 0),
			new CalendarDateTime(2026, 7, 2, 10, 30),
			'pl'
		);
		expect(range).toContain('09:00');
		expect(range).toContain('10:30');
	});
});

describe('formatHourLabel', () => {
	it('formats a bare hour', () => {
		expect(formatHourLabel(9, 'en')).toMatch(/9\sAM/);
		expect(formatHourLabel(15, 'fr')).toContain('15');
	});
});

describe('formatDateRange', () => {
	it('collapses an equal start and end to a single date', () => {
		expect(formatDateRange(jul2, jul2, 'en')).toBe('Jul 2');
	});

	it('formats a multi-day range with month and days', () => {
		const label = formatDateRange(jul2, new CalendarDate(2026, 7, 7), 'en');
		expect(label).toContain('2');
		expect(label).toContain('7');
		expect(label).toMatch(/Jul/);
	});

	it('formats a multi-day range in fr', () => {
		const label = formatDateRange(jul2, new CalendarDate(2026, 7, 7), 'fr');
		expect(label).toContain('2');
		expect(label).toContain('7');
		expect(label).toMatch(/juil/);
	});
});

describe('formatDateTimeRange', () => {
	it('shows the date once for a same-day range', () => {
		const label = formatDateTimeRange(
			new CalendarDateTime(2026, 7, 2, 9, 0),
			new CalendarDateTime(2026, 7, 2, 10, 30),
			'en'
		);
		expect(label).toContain('9:00');
		expect(label).toContain('10:30');
		expect(label.match(/Jul/g)).toHaveLength(1);
	});

	it('shows both dates when the range crosses midnight', () => {
		const label = formatDateTimeRange(
			new CalendarDateTime(2026, 7, 2, 21, 0),
			new CalendarDateTime(2026, 7, 3, 2, 0),
			'en'
		);
		expect(label.match(/Jul/g)).toHaveLength(2);
	});

	it('shows the date once for a same-day range in fr', () => {
		const label = formatDateTimeRange(
			new CalendarDateTime(2026, 7, 2, 9, 0),
			new CalendarDateTime(2026, 7, 2, 10, 30),
			'fr'
		);
		expect(label).toContain('09:00');
		expect(label).toContain('10:30');
		expect(label).toMatch(/juil/);
	});
});
