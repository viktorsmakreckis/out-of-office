import { z } from 'zod';
import { m } from '$lib/paraglide/messages.js';

export const createTeamSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, { error: () => m.validation_team_name_required() })
		.max(100, { error: () => m.validation_team_name_too_long() })
});

export const renameTeamSchema = createTeamSchema;

export const inviteMemberSchema = z.object({
	email: z.email({ error: () => m.validation_email_invalid() }),
	role: z.enum(['member', 'admin'], { error: () => m.error_generic() })
});

export const memberIdSchema = z.object({
	memberId: z.string().min(1, { error: () => m.error_generic() })
});

export const updateRoleSchema = z.object({
	memberId: z.string().min(1, { error: () => m.error_generic() }),
	role: z.enum(['member', 'admin'], { error: () => m.error_generic() })
});

export const invitationActionSchema = z.object({
	invitationId: z.string().min(1, { error: () => m.error_generic() })
});
