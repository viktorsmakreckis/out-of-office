import { Queue } from 'bullmq';
import { getRedisConnection } from './connection';
import {
	QUEUE_NAME,
	toEventDeliveryJob,
	type EventDeliveryJobData,
	type EventDeliveryPayload
} from './job';

let queue: Queue<EventDeliveryJobData> | null | undefined;

function getQueue(): Queue<EventDeliveryJobData> | null {
	if (queue !== undefined) return queue;
	const connection = getRedisConnection();
	if (!connection) {
		queue = null;
		return queue;
	}
	queue = new Queue<EventDeliveryJobData>(QUEUE_NAME, { connection });
	// Prevent an unhandled 'error' event (Redis blip) from throwing out of the process.
	queue.on('error', (err) => console.error('[queue] queue error:', err));
	return queue;
}

/**
 * Enqueue the external delivery of an event change. Best-effort: when Redis is
 * not configured this is a no-op (delivery is skipped, same posture as a
 * swallowed email failure). Callers already run this inside a try/catch.
 */
export async function enqueueEventDelivery(payload: EventDeliveryPayload): Promise<void> {
	const q = getQueue();
	if (!q) return;
	await q.add('event-delivery', toEventDeliveryJob(payload), {
		// Whole-job retry: a failed job re-runs ALL emails/webhooks (in-app rows are written
		// in-band and never retried, so they can't duplicate). Accepted at-least-once v1 semantics.
		attempts: 3,
		backoff: { type: 'exponential', delay: 2000 },
		removeOnComplete: 100,
		removeOnFail: 500
	});
}
