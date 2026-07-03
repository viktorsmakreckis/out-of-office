import IORedis from 'ioredis';
import { env } from '$env/dynamic/private';

let connection: IORedis | null | undefined;

/**
 * Single lazily-created Redis connection shared by the queue and the worker.
 * Returns null when REDIS_URL is unset (dev without Redis, tests, the
 * better-auth CLI) so importing the module never opens a socket.
 * `maxRetriesPerRequest: null` is required by BullMQ's blocking commands.
 */
export function getRedisConnection(): IORedis | null {
	if (connection !== undefined) return connection;
	connection = env.REDIS_URL ? new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null }) : null;
	return connection;
}
