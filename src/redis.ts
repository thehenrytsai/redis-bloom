import { createClient, RedisClientType } from 'redis';
import { RedisClient, RedisPipeline } from "./bloom.ts";

/**
 * Adapter for the Node.js 'redis' package
 */
export class NodeRedisAdapter implements RedisClient {

  public static async create(url: string): Promise<NodeRedisAdapter> {
    const redis = new NodeRedisAdapter(url);
    await redis.connect();
    return redis;
  }

  private client: RedisClientType;
  
  constructor(url: string) {
    this.client = createClient({ url });
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
  
  async getBit(key: string, offset: number): Promise<number> {
    return await this.client.getBit(key, offset);
  }
  
  async del(key: string): Promise<number> {
    return await this.client.del(key);
  }
}