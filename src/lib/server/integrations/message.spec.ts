import { describe, expect, it } from 'vitest';
import { buildEventMessage, composeLine, formatDateRange, testMessage } from './message';

describe('formatDateRange', () => {
	it('formats a single all-day date without a range dash', () => {
		const day = new Date('2026-07-06T00:00:00Z');
		expect(formatDateRange(day, day, true, 'en-GB')).toBe('6 Jul');
	});

	it('formats a multi-day all-day range end-inclusively', () => {
		const start = new Date('2026-07-06T00:00:00Z');
		const end = new Date('2026-07-08T00:00:00Z');
		expect(formatDateRange(start, end, true, 'en-GB')).toBe('6 Jul – 8 Jul');
	});

	it('orders the date parts per locale', () => {
		const day = new Date('2026-07-06T00:00:00Z');
		expect(formatDateRange(day, day, true, 'en-US')).toBe('Jul 6');
		expect(formatDateRange(day, day, true, 'pl')).toBe('6 lip');
	});

	it('formats timed events with UTC times', () => {
		const start = new Date('2026-07-06T09:00:00Z');
		const end = new Date('2026-07-06T17:00:00Z');
		const result = formatDateRange(start, end, false, 'en-GB');
		expect(result).toContain('09:00');
		expect(result).toContain('17:00');
		expect(result).toContain('UTC');
	});
});

describe('buildEventMessage', () => {
	const range = {
		allDay: true,
		start: new Date('2026-07-06T00:00:00Z'),
		end: new Date('2026-07-08T00:00:00Z')
	};

	it('uses the event title as the label when present', () => {
		const message = buildEventMessage(
			'Alice',
			'created',
			'Trip to Paris',
			'vacation',
			range,
			'en-GB'
		);
		expect(message.eventLabel).toBe('Trip to Paris');
		expect(message.emoji).toBe('🌴');
	});

	it('falls back to the type label in the given locale', () => {
		const en = buildEventMessage('Alice', 'created', null, 'sick_leave', range, 'en-GB');
		expect(en.eventLabel).toBe('Sick leave');
		expect(en.emoji).toBe('🤒');

		const pl = buildEventMessage('Alice', 'created', null, 'sick_leave', range, 'pl');
		expect(pl.eventLabel).toBe('Zwolnienie lekarskie');
	});
});

describe('composeLine', () => {
	const range = {
		allDay: true,
		start: new Date('2026-07-06T00:00:00Z'),
		end: new Date('2026-07-06T00:00:00Z')
	};

	it('wraps the actor name with the provided bold marker', () => {
		const message = buildEventMessage('Alice', 'created', null, 'vacation', range, 'en-GB');
		const line = composeLine(message, (s) => `*${s}*`);
		expect(line).toContain('*Alice*');
		expect(line).toContain('6 Jul');
	});

	it('renders the message template in the message locale', () => {
		const message = buildEventMessage('Alice', 'created', null, 'vacation', range, 'pl');
		const line = composeLine(message, (s) => `*${s}*`);
		// Polish template: "{emoji} {name} jest nieobecny(-a) {range} ({label})"
		expect(line).toContain('jest nieobecny');
		expect(line).toContain('Urlop');
	});

	it('renders the test message copy in the given locale', () => {
		expect(composeLine(testMessage('en-GB'), (s) => `*${s}*`)).toContain('Test message');
		expect(composeLine(testMessage('pl'), (s) => `*${s}*`)).toContain('Wiadomość testowa');
	});

	it('renders the deleted template', () => {
		const message = buildEventMessage('Alice', 'deleted', null, 'vacation', range, 'en-GB');
		const line = composeLine(message, (s) => `*${s}*`);
		expect(line).toContain('*Alice*');
		expect(line).toContain('cancelled');
	});
});
