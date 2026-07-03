import { describe, expect, it } from 'vitest';
import { createTeamSchema, inviteMemberSchema } from './team';

describe('createTeamSchema', () => {
	it('accepts a normal name and trims it', () => {
		expect(createTeamSchema.parse({ name: '  Design  ' }).name).toBe('Design');
	});
	it('rejects empty and overlong names', () => {
		expect(createTeamSchema.safeParse({ name: '   ' }).success).toBe(false);
		expect(createTeamSchema.safeParse({ name: 'x'.repeat(101) }).success).toBe(false);
	});
});

describe('inviteMemberSchema', () => {
	it('accepts valid email + role', () => {
		expect(inviteMemberSchema.safeParse({ email: 'a@b.co', role: 'member' }).success).toBe(true);
	});
	it('rejects bad email and owner role', () => {
		expect(inviteMemberSchema.safeParse({ email: 'nope', role: 'member' }).success).toBe(false);
		expect(inviteMemberSchema.safeParse({ email: 'a@b.co', role: 'owner' }).success).toBe(false);
	});
});
