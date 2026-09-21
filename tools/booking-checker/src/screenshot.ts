import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import type { ServiceClient } from "./supabase-client.js";

const BUCKET = "checklist-photos";
const MAX_BYTES = 1_000_000;
const QUALITIES = [70, 55, 40, 25, 15];

// Steps quality down until the JPEG is under ~1MB, same idea as the app's
// own client-side photo compression.
export async function captureScreenshotUnder1MB(page: Page): Promise<Buffer> {
  let last: Buffer | null = null;
  for (const quality of QUALITIES) {
    const buffer = await page.screenshot({ type: "jpeg", quality, fullPage: false });
    last = buffer;
    if (buffer.byteLength < MAX_BYTES) return buffer;
  }
  return last!;
}

export function bookingScreenshotPath(outletId: string): string {
  return `${outletId}/booking/${randomUUID()}.jpg`;
}

export async function uploadScreenshot(
  supabase: ServiceClient,
  outletId: string,
  buffer: Buffer,
): Promise<string> {
  const storagePath = bookingScreenshotPath(outletId);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error(`Screenshot upload failed: ${error.message}`);
  return storagePath;
}

export async function saveScreenshotLocally(
  buffer: Buffer,
  outDir: string,
  filename: string,
): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, filename);
  await writeFile(filePath, buffer);
  return filePath;
}
