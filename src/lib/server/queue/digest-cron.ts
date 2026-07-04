export const DIGEST_QUEUE_NAME = 'digests';

export type DigestJobData = { orgId: string };

/** Stable per-team job-scheduler id, so upserts are idempotent. */
export function digestSchedulerId(orgId: string): string {
	return `digest:${orgId}`;
}

/** Cron pattern firing at minute 0 of `hour` on the given ISO weekday (Sun 7 → cron 0). */
export function digestCronPattern(weekday: number, hour: number): string {
	return `0 ${hour} * * ${weekday % 7}`;
}
