import assert from "node:assert";
import { RedisBloomFilterClient } from "../src/bloom.ts";

const filterName = Date.now().toString();

const client = await RedisBloomFilterClient.create({ url: "redis://localhost:6379" });

// Intentionally keeping the line below to show how to connect to a Redis server with TLS but skipping certificate verification.
// const client = await RedisBloomFilterClient.create({ url: "rediss://localhost:6380", checkServerIdentity: false });

// Intentionally keeping the line below to show how to connect to a AWS Redis server with TLS
// const client = await RedisBloomFilterClient.create({ url: "rediss://master.test-redis-service-to-replace.tl83oi.use1.cache.amazonaws.com:6379" });

await client.clearAll();

// 1. Test creation then using the filter
const filter1 = await client.get(filterName);
await filter1.add("foo", "bar");

const matches1 = await filter1.extractContainedItems("foo", "bar", "baz");
assert(matches1.has("foo"));
assert(matches1.has("bar"));
assert(!matches1.has("baz"));

// 2. Test clearing the filter
await client.clear(filterName);
const matches2 = await filter1.extractContainedItems("foo", "bar", "baz");
assert(!matches2.has("foo"));

// 3. Test getting the filter again
const filter2 = await client.get(filterName);
await filter2.add("baz");
const matches3 = await filter1.extractContainedItems("foo", "bar", "baz");
assert(!matches3.has("foo"));
assert(!matches3.has("bar"));
assert(matches3.has("baz"));

await client.close();

console.log("Node TypeScript test passed.");
