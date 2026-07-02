import { describe, expect, it } from 'vitest';
import { resolveEventAudience, resolveVisibleOwners } from './sharing';

const org = (organizationId: string, ...userIds: string[]) =>
	userIds.map((userId) => ({ organizationId, userId }));

describe('resolveVisibleOwners', () => {
	it('sees teammates via shared org membership', () => {
		const owners = resolveVisibleOwners('me', org('t1', 'me', 'bob', 'eve'), []);
		expect(owners.get('bob')).toBe('team');
		expect(owners.get('eve')).toBe('team');
		expect(owners.has('me')).toBe(false);
	});

	it('sees a user who shared directly with viewer', () => {
		const shares = [
			{ id: 's1', sharerUserId: 'ann', sharerOrgId: null, targetUserId: 'me', targetOrgId: null }
		];
		expect(resolveVisibleOwners('me', [], shares).get('ann')).toBe('share');
	});

	it('sees all members of a team that shared its calendar with viewer', () => {
		const shares = [
			{ id: 's1', sharerUserId: null, sharerOrgId: 't2', targetUserId: 'me', targetOrgId: null }
		];
		const owners = resolveVisibleOwners('me', org('t2', 'ann', 'bob'), shares);
		expect(owners.get('ann')).toBe('share');
		expect(owners.get('bob')).toBe('share');
	});

	it('sees a user who shared with a team the viewer belongs to', () => {
		const shares = [
			{ id: 's1', sharerUserId: 'ann', sharerOrgId: null, targetUserId: null, targetOrgId: 't1' }
		];
		expect(resolveVisibleOwners('me', org('t1', 'me'), shares).get('ann')).toBe('share');
	});

	it('ignores shares targeting other people or other teams', () => {
		const shares = [
			{ id: 's1', sharerUserId: 'ann', sharerOrgId: null, targetUserId: 'bob', targetOrgId: null },
			{ id: 's2', sharerUserId: 'eve', sharerOrgId: null, targetUserId: null, targetOrgId: 't9' }
		];
		expect(resolveVisibleOwners('me', org('t1', 'me'), shares).size).toBe(0);
	});

	it('team visibility wins over share visibility', () => {
		const shares = [
			{ id: 's1', sharerUserId: 'bob', sharerOrgId: null, targetUserId: 'me', targetOrgId: null }
		];
		expect(resolveVisibleOwners('me', org('t1', 'me', 'bob'), shares).get('bob')).toBe('team');
	});

	it('never includes the viewer, even via an org share', () => {
		const shares = [
			{ id: 's1', sharerUserId: null, sharerOrgId: 't1', targetUserId: 'me', targetOrgId: null }
		];
		expect(resolveVisibleOwners('me', org('t1', 'me', 'bob'), shares).has('me')).toBe(false);
	});
});

describe('resolveEventAudience', () => {
	it('includes teammates of the owner', () => {
		const audience = resolveEventAudience('me', org('t1', 'me', 'bob'), [], []);
		expect(audience.has('bob')).toBe(true);
		expect(audience.has('me')).toBe(false);
	});

	it('includes direct share recipients', () => {
		const shares = [
			{ id: 's1', sharerUserId: 'me', sharerOrgId: null, targetUserId: 'ann', targetOrgId: null }
		];
		expect(resolveEventAudience('me', [], shares, []).has('ann')).toBe(true);
	});

	it('includes members of a target team, minus those who hid the share', () => {
		const shares = [
			{ id: 's1', sharerUserId: 'me', sharerOrgId: null, targetUserId: null, targetOrgId: 't2' }
		];
		const audience = resolveEventAudience('me', org('t2', 'ann', 'bob'), shares, [
			{ userId: 'bob', shareId: 's1' }
		]);
		expect(audience.has('ann')).toBe(true);
		expect(audience.has('bob')).toBe(false);
	});

	it('includes recipients of a share made by a team the owner belongs to', () => {
		const shares = [
			{ id: 's1', sharerUserId: null, sharerOrgId: 't1', targetUserId: 'ann', targetOrgId: null }
		];
		expect(resolveEventAudience('me', org('t1', 'me'), shares, []).has('ann')).toBe(true);
	});

	it('a hide only silences the hidden share, not another route', () => {
		const shares = [
			{ id: 's1', sharerUserId: 'me', sharerOrgId: null, targetUserId: 'ann', targetOrgId: null },
			{ id: 's2', sharerUserId: null, sharerOrgId: 't1', targetUserId: 'ann', targetOrgId: null }
		];
		const audience = resolveEventAudience('me', org('t1', 'me'), shares, [
			{ userId: 'ann', shareId: 's1' }
		]);
		expect(audience.has('ann')).toBe(true);
	});
});
