import { z } from 'zod';
import { m } from '$lib/paraglide/messages.js';

export const shareTargetSchema = z
	.object({
		targetType: z.enum(['person', 'team'], { error: () => m.error_generic() }),
		email: z.string().trim().toLowerCase().default(''),
		teamId: z.string().default('')
	})
	.check((ctx) => {
		const { targetType, email, teamId } = ctx.value;
		if (targetType === 'person' && !z.email().safeParse(email).success) {
			ctx.issues.push({
				code: 'custom',
				message: m.validation_email_invalid(),
				path: ['email'],
				input: email
			});
		}
		if (targetType === 'team' && teamId === '') {
			ctx.issues.push({
				code: 'custom',
				message: m.validation_share_team_required(),
				path: ['teamId'],
				input: teamId
			});
		}
	});

export const shareIdSchema = z.object({
	id: z.string().min(1, { error: () => m.error_generic() })
});

export const shareBackSchema = z.object({
	notificationId: z.string().min(1, { error: () => m.error_generic() })
});
