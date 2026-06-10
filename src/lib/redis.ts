import { getBoolEnv, getEnv } from '@/lib/env';
import debug from 'debug';

const log = debug('umami:redis-client');

// Cloudflare Workers 环境下用内存缓存替代 Redis（TCP 不可用）
const cache = new Map<string, { value: any; expires: number }>();

export const DELETED = '__DELETED__';
export const DEFAULT_TTL = 3600;

class UmamiRedisClient {
  url: string;
  isConnected: boolean;

  constructor(url: string) {
    this.url = url;
    this.isConnected = true; // 内存缓存始终可用
  }

  async connect() {
    // 内存缓存无需连接
    this.isConnected = true;
  }

  async get(key: string) {
    const item = cache.get(key);
    if (!item) return null;
    if (item.expires !== Infinity && Date.now() > item.expires) {
      cache.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: any, time?: number) {
    const ttl = time && time > 0 ? time : DEFAULT_TTL;
    cache.set(key, {
      value,
      expires: ttl > 0 ? Date.now() + ttl * 1000 : Infinity,
    });
  }

  async del(key: string) {
    cache.delete(key);
  }

  async incr(key: string) {
    const item = cache.get(key);
    const value = (item?.value as number) || 0;
    const newValue = value + 1;
    cache.set(key, {
      value: newValue,
      expires: item?.expires ?? Infinity,
    });
    return newValue;
  }

  async expire(key: string, seconds: number) {
    const item = cache.get(key);
    if (item) {
      item.expires = Date.now() + seconds * 1000;
    }
  }

  async rateLimit(key: string, limit: number, seconds: number): Promise<boolean> {
    const res = await this.incr(key);

    if (res === 1) {
      await this.expire(key, seconds);
    }

    return res >= limit;
  }

  async fetch(key: string, query: () => Promise<any>, time?: number) {
    const result = await this.get(key);

    if (result === DELETED) return null;

    if (!result && query) {
      const data = await query();
      if (data) {
        await this.set(key, data, time);
      }
      return data;
    }

    return result;
  }

  async remove(key: string, soft = false) {
    return soft ? this.set(key, DELETED) : this.del(key);
  }
}

const REDIS = 'redis';
const enabled = !!getEnv('REDIS_URL', '');

function getClient() {
  const redis = new UmamiRedisClient(getEnv('REDIS_URL', ''));

  if (getEnv('NODE_ENV', 'development') !== 'production') {
    globalThis[REDIS] = redis;
  }

  return redis;
}

const client: UmamiRedisClient = globalThis[REDIS] || getClient();

export default { client, enabled };
