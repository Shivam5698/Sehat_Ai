import IORedis from 'ioredis';
import type { Redis as IoredisClient } from 'ioredis';
import { config } from '../config/index.js';

const Redis = (IORedis as any).default ?? IORedis;
const redisOptions = {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: 3000,
  lazyConnect: true,
  retryStrategy: (attempt: number) => (attempt > 3 ? null : Math.min(attempt * 250, 1000)),
};

const clients = new Set<IoredisClient>();

function createClient(): IoredisClient {
  const client = new Redis(config.redisUrl, redisOptions);
  client.on('error', (error: Error) => {
    console.error('Redis client error:', error.message);
  });
  clients.add(client);
  return client;
}

export const redisClient = createClient();

export function createRedisPublisher() {
  return createClient();
}

export function createRedisSubscriber() {
  return createClient();
}

export async function closeRedisClients(): Promise<void> {
  await Promise.all(
    [...clients].map(async (client) => {
      if (client.status === 'ready') {
        await client.quit();
      } else {
        client.disconnect();
      }
    }),
  );
  clients.clear();
}
