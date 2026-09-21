import type { Page } from "playwright";
import type { ServiceClient } from "../supabase-client.js";
import type { DateResult, DueSource } from "../types.js";

export type AdapterContext = {
  page: Page;
  supabase: ServiceClient;
  dryRun: boolean;
  outDir: string;
  // Enforces the "wait at least 3 seconds between navigations" rule across
  // the whole run (one browser context per run, shared by every source).
  onBeforeNavigate: () => Promise<void>;
};

export type Adapter = {
  platform: string;
  checkSource: (source: DueSource, dates: string[], ctx: AdapterContext) => Promise<DateResult[]>;
};
