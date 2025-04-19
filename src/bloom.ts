import { NodeRedisAdapter } from "./redis.ts";

/**
 * The interface for class that manages Bloom filters.
 */
export interface BloomFilterClient {
  /**
   * Creates a new Bloom filter with the given name.
   */
  get(name: string): Promise<BloomFilter>;

  /**
   * Clears the Bloom filter of the given name.
   */
  clear(name: string): Promise<void>;

  /**
   * Closes the Bloom filter client.
   */
  close(): Promise<void>;
}

/**
 * The interface for a Bloom filter.
 */
export interface BloomFilter {
  /**
   * Adds items to the Bloom filter.
   */
  add(...items: string[]): Promise<void>;

  /**
   * Extracts items in the given list that are contained (a match) in the Bloom filter.
   */
  extractContainedItems(...items: string[]): Promise<Set<string>>;
}

/**
 * Platform-agnostic Redis client interface with only the methods
 * required by the Bloom filter implementation.
 */
export interface RedisClient {
  close(): Promise<void>;
  pipeline(): RedisPipeline;
  getbit(key: string, offset: number): Promise<number>;
  del(key: string): Promise<number>;
}

export interface RedisPipeline {
  setbit(key: string, offset: number, value: 0 | 1): RedisPipeline;
  exec(): Promise<Array<any>>;
}


/**
 * Bloom filter implementation using native Redis bitmap operations.
 * This makes it compatible with managed Redis services like AWS ElastiCache
 * that don't support custom Redis modules.
 */
export class RedisBloomFilterClient implements BloomFilterClient {

  public static async create(url: string): Promise<BloomFilterClient> {
    const redis = await NodeRedisAdapter.create(url);
    return new RedisBloomFilterClient(redis);
  }

  private redis: RedisClient; // Redis client
  private readonly numHashes: number;
  private readonly bitSize: number;
  
  /**
   * Creates a new Redis Bloom filter manager.
   * 
   * @param redis Redis client instance
   * @param bitSize The size of the bit array (m)
   * @param numHashes Number of hash functions to use (k)
   */
  private constructor(redis: RedisClient, bitSize = 100000, numHashes = 3) {
    this.redis = redis;
    this.bitSize = bitSize;
    this.numHashes = numHashes;
  }

  public async close(): Promise<void> {
    await this.redis.close();
  }

  /**
   * Gets or creates a Bloom filter with the given name.
   */
  async get(name: string): Promise<BloomFilter> {
    return new RedisBloomFilter(this.redis, name, this.bitSize, this.numHashes);
  }

  /**
   * Clears the Bloom filter with the given name by deleting the Redis key.
   */
  async clear(name: string): Promise<void> {
    await this.redis.del(name);
  }
}

/**
 * Implementation of a Bloom filter using Redis bitmap operations.
 */
class RedisBloomFilter implements BloomFilter {
  private redis: RedisClient;
  private readonly key: string;
  private readonly bitSize: number;
  private readonly numHashes: number;
  
  constructor(redis: RedisClient, key: string, bitSize: number, numHashes: number) {
    this.redis = redis;
    this.key = key;
    this.bitSize = bitSize;
    this.numHashes = numHashes;
  }

  /**
   * Generate hash values for an item
   */
  private getHashValues(item: string): number[] {
    const hashValues: number[] = [];
    
    // Simple hash functions using string charCode values
    // In production, use better hash functions
    for (let i = 0; i < this.numHashes; i++) {
      let hash = 0;
      for (let j = 0; j < item.length; j++) {
        // Different seed for each hash function
        hash = ((hash << 5) + hash) + item.charCodeAt(j) + i * 17;
        hash &= hash; // Convert to 32bit integer
      }
      // Make sure hash is positive and within bit range
      hashValues.push(Math.abs(hash) % this.bitSize);
    }
    
    return hashValues;
  }
  
  /**
   * Add items to the Bloom filter
   */
  async add(...items: string[]): Promise<void> {
    // Batch operations for performance
    const pipeline = this.redis.pipeline();
    
    for (const item of items) {
      const hashes = this.getHashValues(item);
      for (const hash of hashes) {
        pipeline.setbit(this.key, hash, 1);
      }
    }
    
    await pipeline.exec();
  }

  /**
   * Check if items might exist in the filter
   * Returns items that are potential matches
   */
  async extractContainedItems(...items: string[]): Promise<Set<string>> {
    const result = new Set<string>();
    
    for (const item of items) {
      const hashes = this.getHashValues(item);
      let isMatch = true;
      
      // Check if all bits are set
      for (const hash of hashes) {
        // Use await inside loop for simplicity, but in production
        // consider batching these operations
        const bit = await this.redis.getbit(this.key, hash);
        if (bit === 0) {
          isMatch = false;
          break;
        }
      }
      
      if (isMatch) {
        result.add(item);
      }
    }
    
    return result;
  }
}
