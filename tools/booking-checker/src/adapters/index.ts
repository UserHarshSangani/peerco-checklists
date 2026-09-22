import type { Adapter } from "./types.js";
import { swiggyAdapter } from "./swiggy.js";
import { eazydinerAdapter } from "./eazydiner.js";

const ADAPTERS: Record<string, Adapter> = {
  swiggy: swiggyAdapter,
  eazydiner: eazydinerAdapter,
};

export function getAdapter(platform: string): Adapter | undefined {
  return ADAPTERS[platform];
}
