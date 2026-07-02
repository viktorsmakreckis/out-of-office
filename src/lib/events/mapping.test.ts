import { describe, expect, it } from 'vitest';
import { m } from '$lib/paraglide/messages.js';
import {
	changeRangeToInstants,
	eventTypeColors,
	eventTypeLabel,
	formValuesToRange,
	toCalendarEvent,
	toFormValues,
	type EventRecord
} from './index';

const RIGA = 'Europe/Riga'; // UTC+3 in July 2026

const allDayRecord: EventRecord = {
	id: 'evt-1',
	type: 'vacation',
	title: null,
	allDay: true,
	start: new Date('2026-07-02T00:00:00Z'),
	end: new Date('2026-07-04T00:00:00Z')
};

const timedRecord: EventRecord = {
	id: 'evt-2',
	type: 'other',
	title: 'Dentist',
	allDay: false,
	start: new Date('2026-07-02T06:00:00Z'),
	end: new Date('2026-07-02T07:30:00Z')
};

describe('toCalendarEvent', () => {
	it('reads all-day rows as UTC dates (end-inclusive)', () => {
		const event = toCalendarEvent(allDayRecord, RIGA);
		expect(event.allDay).toBe(true);
		expect(event.start.toString()).toBe('2026-07-02');
		expect(event.end.toString()).toBe('2026-07-04');
	});

	it('converts timed rows to the profile timezone', () => {
		const event = toCalendarEvent(timedRecord, RIGA);
		expect(event.allDay).toBe(false);
		expect(event.start.toString()).toBe('2026-07-02T09:00:00');
		expect(event.end.toString()).toBe('2026-07-02T10:30:00');
	});

	it('falls back to the localized type label when title is null', () => {
		const event = toCalendarEvent(allDayRecord, RIGA);
		expect(event.title).toBe(m.calendar_event_type_vacation());
	});

	it('keeps a custom title and derives color from type', () => {
		const event = toCalendarEvent(timedRecord, RIGA);
		expect(event.title).toBe('Dentist');
		expect(event.color).toBe(eventTypeColors.other);
		expect(event.data).toBe(timedRecord);
	});
});

describe('toFormValues', () => {
	it('splits a timed record into date and time strings in the profile timezone', () => {
		expect(toFormValues(timedRecord, RIGA)).toEqual({
			id: 'evt-2',
			type: 'other',
			title: 'Dentist',
			allDay: false,
			startDate: '2026-07-02',
			endDate: '2026-07-02',
			startTime: '09:00',
			endTime: '10:30'
		});
	});

	it('uses UTC date parts and default times for all-day records', () => {
		const values = toFormValues(allDayRecord, RIGA);
		expect(values.startDate).toBe('2026-07-02');
		expect(values.endDate).toBe('2026-07-04');
		expect(values.startTime).toBe('09:00');
		expect(values.endTime).toBe('17:00');
		expect(values.title).toBe('');
	});
});

describe('formValuesToRange', () => {
	it('pins all-day values to UTC midnight', () => {
		const range = formValuesToRange(
			{ allDay: true, startDate: '2026-07-02', endDate: '2026-07-04', startTime: '', endTime: '' },
			RIGA
		);
		expect(range.start.toISOString()).toBe('2026-07-02T00:00:00.000Z');
		expect(range.end.toISOString()).toBe('2026-07-04T00:00:00.000Z');
	});

	it('interprets timed values in the profile timezone', () => {
		const range = formValuesToRange(
			{
				allDay: false,
				startDate: '2026-07-02',
				endDate: '2026-07-02',
				startTime: '09:00',
				endTime: '10:30'
			},
			RIGA
		);
		expect(range.start.toISOString()).toBe('2026-07-02T06:00:00.000Z');
		expect(range.end.toISOString()).toBe('2026-07-02T07:30:00.000Z');
	});

	it('handles a DST-crossing range (America/New_York spring forward)', () => {
		const range = formValuesToRange(
			{
				allDay: false,
				startDate: '2026-03-08',
				endDate: '2026-03-08',
				startTime: '01:00',
				endTime: '04:00'
			},
			'America/New_York'
		);
		expect(range.start.toISOString()).toBe('2026-03-08T06:00:00.000Z'); // 01:00 EST
		expect(range.end.toISOString()).toBe('2026-03-08T08:00:00.000Z'); // 04:00 EDT
	});
});

describe('changeRangeToInstants', () => {
	it('converts all-day change strings to UTC midnight', () => {
		const range = changeRangeToInstants(
			{ allDay: true, start: '2026-07-06', end: '2026-07-08' },
			RIGA
		);
		expect(range.start.toISOString()).toBe('2026-07-06T00:00:00.000Z');
		expect(range.end.toISOString()).toBe('2026-07-08T00:00:00.000Z');
	});

	it('converts timed change strings via the profile timezone', () => {
		const range = changeRangeToInstants(
			{ allDay: false, start: '2026-07-02T09:00:00', end: '2026-07-02T10:30:00' },
			RIGA
		);
		expect(range.start.toISOString()).toBe('2026-07-02T06:00:00.000Z');
		expect(range.end.toISOString()).toBe('2026-07-02T07:30:00.000Z');
	});
});

describe('eventTypeLabel', () => {
	it('maps every type to its localized label', () => {
		expect(eventTypeLabel('sick_leave')).toBe(m.calendar_event_type_sick_leave());
		expect(eventTypeLabel('other')).toBe(m.calendar_event_type_other());
	});
});
