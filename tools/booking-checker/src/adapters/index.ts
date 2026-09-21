import type { Adapter } from "./types.js";
import { swiggyAdapter } from "./swiggy.js";

const ADAPTERS: Record<string, Adapter> = {
  swiggy: swiggyAdapter,
};

export function getAdapter(platform: string): Adapter | undefined {
  return ADAPTERS[platform];
}
