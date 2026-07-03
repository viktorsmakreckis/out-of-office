import { describe, expect, it } from 'vitest';
import {
	DEFAULT_CHANNEL_PREFS,
	recipientsForChannel,
	type ChannelPrefs
} from './notification-preferences';

const R = (id: string) => ({ id, email: `${id}@x.test` });
const prefs = (overrides: Partial<ChannelPrefs>): ChannelPrefs => ({
	...DEFAULT_CHANNEL_PREFS,
	...overrides
});

describe('recipientsForChannel', () => {
	it('includes a recipient with no prefs row (defaults all-on)', () => {
		const result = recipientsForChannel([R('a')], new Map(), 'oooEmail');
		expect(result.map((r) => r.id)).toEqual(['a']);
	});

	it('excludes a recipient who disabled that one channel', () => {
		const map = new Map([['a', prefs({ oooEmail: false })]]);
		expect(recipientsForChannel([R('a')], map, 'oooEmail')).toEqual([]);
	});

	it('keeps other channels of the same recipient unaffected', () => {
		const map = new Map([['a', prefs({ oooEmail: false })]]);
		expect(recipientsForChannel([R('a')], map, 'oooInApp').map((r) => r.id)).toEqual(['a']);
	});

	it('treats categories independently', () => {
		const map = new Map([['a', prefs({ sharedInApp: false })]]);
		expect(recipientsForChannel([R('a')], map, 'oooInApp').map((r) => r.id)).toEqual(['a']);
		expect(recipientsForChannel([R('a')], map, 'sharedInApp')).toEqual([]);
	});

	it('filters a mixed list on the requested channel', () => {
		const map = new Map([
			['a', prefs({ oooEmail: false })],
			['b', prefs({})]
		]);
		expect(recipientsForChannel([R('a'), R('b')], map, 'oooEmail').map((r) => r.id)).toEqual(['b']);
	});

	it('returns an empty array for no recipients', () => {
		expect(recipientsForChannel([], new Map(), 'oooInApp')).toEqual([]);
	});
});
