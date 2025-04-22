# redis-bloom
This Bloom filter implementation works with managed Redis services like AWS ElastiCache, using native Redis commands for maximum compatibility.

## Basic Usage

```ts
import { RedisBloomFilterClient } from "@thehenrytsai/redis-bloom";

// Connect to Redis
const client = await RedisBloomFilterClient.create({ url: "redis://localhost:6379" });

// Getting or creating a Bloom filter
const filter = await client.get("my-filter-name");

// Adding items to the filter
await filter.add("email1@example.com", "email2@example.com");

// Checking which items exist in the filter
const matches = await filter.extractContainedItems(
  "email1@example.com", 
  "email2@example.com",
  "unknown@example.com"
);

// `matches` is a Set containing the items that might exist
console.log(matches.has("email1@example.com"));  // true
console.log(matches.has("unknown@example.com")); // false

// Clearing a filter
await client.clear("my-filter-name");

// Clearing all filters (mainly for testing purposes)
await client.clearAll();

// Closing the connection when finished
await client.close();
```

## Advanced Configuration
The Redis Bloom filter can be fine-tuned for your specific use case by adjusting its configuration parameters:

```ts
const client = await RedisBloomFilterClient.create({
  url: "rediss://localhost:6379",
  checkServerIdentity: false,     // defaults to true, set to false to skip server cert verification
  bloomFilterSizeInBits: 100_000, // defaults to 10,000 bits
  hashesPerItem: 5,               // defaults to 3 hashes per item
  hashFunction1: customHashFn1,
  hashFunction2: customHashFn2,
});
```

### Custom Hash Functions

You can provide your own hash functions for special requirements or better performance. The provided hash functions should:

- Have the following signature

   ```ts
   (data: string) => Promise<number>
   ```

- Provide uniform distribution across the 32-bit integer range

By default, this library uses SHA-256 slices for the hash functions, but faster alternatives like MurmurHash or xxHash are recommended for production use.



## Dev/Contributor Environment Setup

This guide assumes Mac/Linux environment.

1. Install `hermit`, a tool for bootstrapping platform/environment level dependencies such as `node`:

   `curl -fsSL https://github.com/cashapp/hermit/releases/download/stable/install.sh | /bin/bash`

   This will download and install hermit into ~/bin. You should add this to your `$PATH` if it isn’t already:

   For Zsh (macOS):

   ```
     echo 'export PATH="$HOME/bin:$PATH"' >> ~/.zshrc
     source ~/.zshrc
   ```

   For Bash (Linux):

   ```
     echo 'export PATH="$HOME/bin:$PATH"' >> ~/.zshrc
     source ~/.bashrc
   ```
   
   See `https://cashapp.github.io/hermit/` if you want to learn more.

1. Activate `hermit` (always run this command first when you start your IDE or command prompt):
   `. ./bin/activate-hermit`

1. Now you can install the dev environment dependencies using `hermit`:

   `hermit install`

### Building Node.js bundle

`deno task build:node` or

`npm run build` (calls the above `deno` task)

### Appendix
- To connect to an AWS ElastiCache instance through an EC2 proxy/bastion host:

  - Ensure the EC2 instance's Security Group has been added to allowed Security Groups under ElastiCache's "Connectivity and security" settings.

  - Create SSH tunnel with port forwarding to the ElastiCache:
  
    ```sh
    ssh -i /path/to/ec2-access-key.pem -N -L <local-port>:<elasticache-endpoint>:<elasticache-port> ec2-user@<public-ec2-instance-ip>
    ```

    For example:
    
    ```sh
    ssh -i ec2-access-key.pem -N -L 6380:master.test-service-valkey.tl83oi.use1.cache.amazonaws.com:6379 ec2-user@44.222.66.8
    ```

  - After establishing the tunnel, connect to ElastiCache locally via `rediss://localhost:6380`
    > NOTE: you'll need to disable server identity check: `checkServerIdentity: false` when creating the `RedisBloomFilterClient`.