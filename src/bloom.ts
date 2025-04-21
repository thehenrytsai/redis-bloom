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
  del(key: string): Promise<number>;
}

export interface RedisPipeline {
  setBit(key: string, offset: number, value: 0 | 1): RedisPipeline;
  getBit(key: string, offset: number): RedisPipeline;
  exec(): Promise<Array<any>>;
}


/**
 * Bloom filter implementation using native Redis bitmap operations.
 * This makes it compatible with managed Redis services like AWS ElastiCache
 * that don't support custom Redis modules.
 * 
 * @param params.url The Redis URL.
 * @param params.sizeInBits The size of the Bloom filter in bits, defaults to 10,000.
 * @param params.numHashes The number of hash functions to use, defaults to 3.
 * @param params.hashFunction1 The first hash function to use, defaults to use SHA-256.
 * @param params.hashFunction2 The first hash function to use, defaults to use SHA-256.
 */
export class RedisBloomFilterClient implements BloomFilterClient {

  public static async create(params: {
    url: string,
    sizeInBits?: number,
    numHashes?: number,
    hashFunction1?: (data: string) => Promise<number>,
    hashFunction2?: (data: string) => Promise<number>,
  }): Promise<BloomFilterClient> {
    const { url, sizeInBits, numHashes, hashFunction1, hashFunction2 } = params;

    const redis = await NodeRedisAdapter.create(url);
    const client = new RedisBloomFilterClient(
      redis,
      sizeInBits || 10000,
      numHashes || 3,
      // NOTE: default of using SHA256 hashing could be optimized to just performing hashing once since SHA256 hash is 32 bytes,
      // but instead of doing such optimization, the better approach is to just use a faster hash function like MurmurHash3 or xxHash
      hashFunction1 || ((data: string) => toUint32UsingSha256(data, 0)),
      hashFunction2 || ((data: string) => toUint32UsingSha256(data, 4)), // 4 bytes offset
    );

    return client;
  }

  /**
   * Creates a new Redis Bloom filter manager.
   * 
   * @param redis Redis client instance
   * @param sizeInBits The size of the Bloom filter (m)
   * @param numHashes Number of hashes (bit positions) to produce (k)
   */
  private constructor(
    private redis: RedisClient,
    private sizeInBits: number,
    private numHashes: number,
    private hashFunction1: (data: string) => Promise<number>,
    private hashFunction2: (data: string) => Promise<number>,
  ) { }

  public async close(): Promise<void> {
    await this.redis.close();
  }

  /**
   * Gets or creates a Bloom filter with the given name.
   */
  async get(name: string): Promise<BloomFilter> {
    return new RedisBloomFilter(
      this.redis,
      name,
      this.sizeInBits,
      this.numHashes,
      this.hashFunction1,
      this.hashFunction2,
    );
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
  constructor(
    private redis: RedisClient,
    private key: string,
    private sizeInBits: number,
    private numHashes: number,
    private hashFunction1: (data: string) => Promise<number>,
    private hashFunction2: (data: string) => Promise<number>,
  ) { }
  
  /**
   * Add items to the Bloom filter
   */
  async add(...items: string[]): Promise<void> {
    // Batch operations for performance
    const pipeline = this.redis.pipeline();
    
    for (const item of items) {
      const setPositions = await computeItemBitPositions(
        item,
        this.numHashes,
        this.sizeInBits,
        this.hashFunction1,
        this.hashFunction2,
      );

      for (const position of setPositions) {
        pipeline.setBit(this.key, position, 1);
      }
    }
    
    await pipeline.exec();
  }

  /**
   * Check if items might exist in the filter
   * Returns items that are potential matches
   */
  async extractContainedItems(...items: string[]): Promise<Set<string>> {
    // Create a cache item -> positions map, and also a set of unique (deduped) positions we need to know across all items for querying Redis
    const positionsToKnow = new Set<number>();
    const itemToPositionsMap = new Map<string, number[]>();
    for (const item of items) {
      const expectedSetPositions = await computeItemBitPositions(
        item,
        this.numHashes,
        this.sizeInBits,
        this.hashFunction1,
        this.hashFunction2,
      );

      itemToPositionsMap.set(item, expectedSetPositions);
      
      for (const position of expectedSetPositions) {
        positionsToKnow.add(position);
      }
    }

    // Convert the set to an array for preserving order when iterating
    const positionsToKnowArray = Array.from(positionsToKnow);

    // Query Redis for all positions at once
    const pipeline = this.redis.pipeline();
    for (const position of positionsToKnowArray) {
      pipeline.getBit(this.key, position);
    }
    const results = await pipeline.exec();

    // construct a set of position that are set to 1 to quickly check if a bit is set
    const setPositions = new Set<number>();
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result === 1) {
        setPositions.add(positionsToKnowArray[i]);
      }
    }

    // Finally check each item against the set positions
    const matchedItems = new Set<string>();
    for (const item of items) {
      const expectedSetPositions = itemToPositionsMap.get(item)!;
      
      // Check if all bits are set
      const allBitsSet = expectedSetPositions.every((position) => setPositions.has(position));
      if (allBitsSet) {
        matchedItems.add(item);
      }
    }
    
    return matchedItems;
  }
}

async function toUint32UsingSha256(data: string, offsetInBytes: number): Promise<number> {
  const dataBytes = new TextEncoder().encode(data);
  const hashBytes = await crypto.subtle.digest("SHA-256", dataBytes);

  // Take first 32 bits (4 bytes) and convert to number
  const hashView = new DataView(hashBytes);
  return hashView.getUint32(offsetInBytes, true); // true = little endian
}

/**
 * Function to extract bit positions from one SHA-256 hash
 * @param item The item to hash.
 * @param positionCount The number of positions in the Bloom filter to set (conventionally k).
 * @param bloomFilterSize The size of the Bloom filter in number of bits (conventionally m).
 */
async function computeItemBitPositions(
  item: string,
  positionCount: number,
  bloomFilterSize: number,
  hashFunction1: (data: string) => Promise<number>,
  hashFunction2: (data: string) => Promise<number>,
): Promise<number[]> {
  // Use the double hashing technique to generate multiple hash values
  const positions: number[] = [];
  
  // Get two independent hashes
  const hash1 = await hashFunction1(item);
  const hash2 = await hashFunction2(item);
  
  // Generate k positions using double hashing technique
  for (let i = 0; i < positionCount; i++) {
    // This is the enhanced double hashing formula: h1(x) + i*h2(x) suggested by original Bloom filter paper
    // It provides k hashes from just 2 hash computations
    // NOTE: ">>> 0" forces the integer to be unsigned, allow one extra bit of precision (32 bits instead of 31 bits)
    const combinedHash = (hash1 + i * hash2) >>> 0;
    positions.push(combinedHash % bloomFilterSize);
  }
  
  return positions;
}
