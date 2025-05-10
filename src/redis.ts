import { createClient, RedisClientType } from 'redis';
import { RedisClient, RedisPipeline } from "./bloom.ts";

/**
 * Adapter for the Node.js 'redis' package
 */
export class NodeRedisAdapter implements RedisClient {

  /**
   * Creates a new Redis client.
   * @param checkServerIdentity Only used if `url` starts with `rediss://`. Set to `false` to skip server identity verification.
   */
  public static async create(url: string, checkServerIdentity: boolean): Promise<NodeRedisAdapter> {
    const redis = new NodeRedisAdapter(url, checkServerIdentity);
    await redis.connect();
    return redis;
  }

  private client: RedisClientType;
  
  constructor(url: string, checkServerIdentity: boolean) {
    
    const useTls = url.startsWith('rediss://');

    if (!useTls || useTls && checkServerIdentity) {
      this.client = createClient({
        url,
        socket: { tls: useTls },
      });
    } else {
      // This is the special case when we are using TLS but want to skip server identity verification.

      this.client = createClient({
        url,
        socket: {
          tls: useTls, // `useTls` is `true`
          checkServerIdentity: () => undefined, // Skip server identity verification
        },
      });
    }
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  public async close(): Promise<void> {
    await this.client.quit();
  }
  
  pipeline(): RedisPipeline {
    const multi = this.client.multi();
    return {
      setBit(key: string, offset: number, value: 0 | 1): RedisPipeline {
        multi.setBit(key, offset, value);
        return this;
      },

      getBit(key: string, offset: number): RedisPipeline {
        multi.getBit(key, offset);
        return this;
      },

      async exec(): Promise<Array<any>> {
        return await multi.exec();
      }
    };
  }
  
  async del(key: string): Promise<number> {
    return await this.client.del(key);
  }

  async flushAll(): Promise<void> {
    await this.client.flushAll();
  }
}