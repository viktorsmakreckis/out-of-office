import { describe, expect, it } from 'vitest';
import { buildEventMessage, composeLine, formatDateRange, testMessage } from './message';

describe('formatDateRange', () => {
	it('formats a single all-day date without a range dash', () => {
		const day = new Date('2026-07-06T00:00:00Z');
		expect(formatDateRange(day, day, true)).toBe('Jul 6');
	});

	it('formats a multi-day all-day range end-inclusively', () => {
		const start = new Date('2026-07-06T00:00:00Z');
		const end = new Date('2026-07-08T00:00:00Z');
		expect(formatDateRange(start, end, true)).toBe('Jul 6 – Jul 8');
	});

	it('formats timed events with UTC times', () => {
		const start = new Date('2026-07-06T09:00:00Z');
		const end = new Date('2026-07-06T17:00:00Z');
		const result = formatDateRange(start, end, false);
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
		const message = buildEventMessage('Alice', 'created', 'Trip to Paris', 'vacation', range);
		expect(message.eventLabel).toBe('Trip to Paris');
		expect(message.emoji).toBe('🌴');
	});

	it('falls back to the localized type label', () => {
		const message = buildEventMessage('Alice', 'created', null, 'sick_leave', range);
		expect(message.eventLabel).toBe('Sick leave');
		expect(message.emoji).toBe('🤒');
	});
});

describe('composeLine', () => {
	it('wraps the actor name with the provided bold marker', () => {
		const message = buildEventMessage('Alice', 'created', null, 'vacation', {
			allDay: true,
			start: new Date('2026-07-06T00:00:00Z'),
			end: new Date('2026-07-06T00:00:00Z')
		});
		const line = composeLine(message, (s) => `*${s}*`);
		expect(line).toContain('*Alice*');
		expect(line).toContain('Jul 6');
	});

	it('renders the test message copy regardless of other fields', () => {
		const line = composeLine(testMessage(), (s) => `*${s}*`);
		expect(line).toContain('Test message');
	});
});
