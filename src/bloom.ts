import { testing } from "./testing.ts";

export function helloWorld(name: string): string {
  return testing(name);
}