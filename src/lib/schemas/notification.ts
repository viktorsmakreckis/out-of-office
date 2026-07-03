import { z } from 'zod';

export const notificationPreferencesSchema = z.object({
	oooInApp: z.boolean(),
	oooEmail: z.boolean(),
	sharedInApp: z.boolean(),
	sharedEmail: z.boolean()
});
