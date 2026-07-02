import { describe, expect, it } from 'vitest';
import { m } from '$lib/paraglide/messages.js';
import { deleteEventSchema, eventSchema, moveEventSchema } from './event';

const validCreate = {
	id: '',
	type: 'vacation',
	title: '',
	allDay: true,
	startDate: '2026-07-02',
	endDate: '2026-07-04',
	startTime: '09:00',
	endTime: '17:00'
};

describe('eventSchema', () => {
	it('accepts a valid all-day event', () => {
		const result = eventSchema.safeParse(validCreate);
		expect(result.success).toBe(true);
	});

	it('accepts a one-day all-day event (end-inclusive)', () => {
		const result = eventSchema.safeParse({ ...validCreate, endDate: '2026-07-02' });
		expect(result.success).toBe(true);
	});

	it('accepts a valid timed event', () => {
		const result = eventSchema.safeParse({ ...validCreate, allDay: false, endDate: '2026-07-02' });
		expect(result.success).toBe(true);
	});

	it('requires a title for "other" events', () => {
		const result = eventSchema.safeParse({ ...validCreate, type: 'other' });
		expect(result.success).toBe(false);
		const issue = result.error?.issues.find((candidate) => candidate.path[0] === 'title');
		expect(issue?.message).toBe(m.validation_event_title_required());
	});

	it('accepts "other" with a title and a non-other event without one', () => {
		expect(
			eventSchema.safeParse({ ...validCreate, type: 'other', title: 'Conference' }).success
		).toBe(true);
	});

	it('rejects an all-day event ending before it starts', () => {
		const result = eventSchema.safeParse({ ...validCreate, endDate: '2026-07-01' });
		expect(result.success).toBe(false);
		const issue = result.error?.issues.find((candidate) => candidate.path[0] === 'endDate');
		expect(issue?.message).toBe(m.validation_event_end_before_start());
	});

	it('rejects a timed event with zero duration (end-exclusive)', () => {
		const result = eventSchema.safeParse({
			...validCreate,
			allDay: false,
			endDate: '2026-07-02',
			endTime: '09:00'
		});
		expect(result.success).toBe(false);
	});

	it('rejects malformed dates and times', () => {
		expect(eventSchema.safeParse({ ...validCreate, startDate: 'not-a-date' }).success).toBe(false);
		expect(
			eventSchema.safeParse({ ...validCreate, allDay: false, startTime: '25:99' }).success
		).toBe(false);
	});

	it('rejects an unknown type', () => {
		expect(eventSchema.safeParse({ ...validCreate, type: 'party' }).success).toBe(false);
	});
});

describe('deleteEventSchema', () => {
	it('requires an id', () => {
		expect(deleteEventSchema.safeParse({ id: '' }).success).toBe(false);
		expect(deleteEventSchema.safeParse({ id: 'evt-1' }).success).toBe(true);
	});
});

describe('moveEventSchema', () => {
	it('accepts an all-day change', () => {
		const result = moveEventSchema.safeParse({
			id: 'evt-1',
			allDay: true,
			start: '2026-07-02',
			end: '2026-07-04'
		});
		expect(result.success).toBe(true);
	});

	it('accepts a timed change', () => {
		const result = moveEventSchema.safeParse({
			id: 'evt-1',
			allDay: false,
			start: '2026-07-02T09:00:00',
			end: '2026-07-02T10:30:00'
		});
		expect(result.success).toBe(true);
	});

	it('rejects a change ending before it starts', () => {
		const result = moveEventSchema.safeParse({
			id: 'evt-1',
			allDay: true,
			start: '2026-07-04',
			end: '2026-07-02'
		});
		expect(result.success).toBe(false);
	});

	it('rejects malformed values for the variant', () => {
		const result = moveEventSchema.safeParse({
			id: 'evt-1',
			allDay: false,
			start: '2026-07-02',
			end: '2026-07-04'
		});
		expect(result.success).toBe(false);
	});
});
