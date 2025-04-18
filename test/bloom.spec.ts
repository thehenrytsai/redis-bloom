import assert from "node:assert";
import { helloWorld } from "../src/bloom.js";

assert.strictEqual(helloWorld("Henry"), "Hello, Henry");
console.log("Node TypeScript test passed.");