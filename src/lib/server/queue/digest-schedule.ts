import { Queue } from 'bullmq';
import { listEnabledDigestConfigs } from '$lib/server/integrations/digest-config';
import { getRedisConnection } from './connection';
import {
	DIGEST_QUEUE_NAME,
	digestCronPattern,
	digestSchedulerId,
	type DigestJobData
} from './digest-cron';

let queue: Queue<DigestJobData> | null | undefined;

function getDigestQueue(): Queue<DigestJobData> | null {
	if (queue !== undefined) return queue;
	const connection = getRedisConnection();
	if (!connection) {
		queue = null;
		return queue;
	}
	queue = new Queue<DigestJobData>(DIGEST_QUEUE_NAME, { connection });
	queue.on('error', (err) => console.error('[digest] queue error:', err));
	return queue;
}

export type DigestScheduleConfig = {
	orgId: string;
	weekday: number;
	hour: number;
	timezone: string;
};

/** Idempotently (re)creates the team's repeatable job scheduler. No-op without Redis. */
export async function upsertDigestSchedule(config: DigestScheduleConfig): Promise<void> {
	const q = getDigestQueue();
	if (!q) return;
	await q.upsertJobScheduler(
		digestSchedulerId(config.orgId),
		{ pattern: digestCronPattern(config.weekday, config.hour), tz: config.timezone },
		{ name: 'weekly-digest', data: { orgId: config.orgId } }
	);
}

export async function removeDigestSchedule(orgId: string): Promise<void> {
	const q = getDigestQueue();
	if (!q) return;
	await q.removeJobScheduler(digestSchedulerId(orgId));
}

/** Aligns Redis schedulers with the enabled DB configs: upsert missing, remove orphaned. */
export async function reconcileDigestSchedules(): Promise<void> {
	const q = getDigestQueue();
	if (!q) return;
	const configs = await listEnabledDigestConfigs();
	const wanted = new Set(configs.map((c) => digestSchedulerId(c.orgId)));
	const existing = await q.getJobSchedulers(0, -1, true);
	for (const scheduler of existing) {
		if (scheduler.key.startsWith('digest:') && !wanted.has(scheduler.key)) {
			await q.removeJobScheduler(scheduler.key);
		}
	}
	for (const config of configs) await upsertDigestSchedule(config);
}
