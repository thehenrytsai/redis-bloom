import { helloWorld } from "../src/bloom.ts";
import { assertEquals } from "https://deno.land/std@0.215.0/assert/mod.ts";

Deno.test("Hello world", () => {
  assertEquals(helloWorld("Henry"), "Hello, Henry");
});