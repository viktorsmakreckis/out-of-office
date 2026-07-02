import { describe, expect, it } from 'vitest';
import { shareTargetSchema } from './share';

describe('shareTargetSchema', () => {
	it('requires a valid email for person targets', () => {
		expect(
			shareTargetSchema.safeParse({ targetType: 'person', email: 'a@b.co', teamId: '' }).success
		).toBe(true);
		expect(
			shareTargetSchema.safeParse({ targetType: 'person', email: 'nope', teamId: '' }).success
		).toBe(false);
	});
	it('requires a teamId for team targets and ignores email', () => {
		expect(
			shareTargetSchema.safeParse({ targetType: 'team', email: '', teamId: 't1' }).success
		).toBe(true);
		expect(shareTargetSchema.safeParse({ targetType: 'team', email: '', teamId: '' }).success).toBe(
			false
		);
	});
});
