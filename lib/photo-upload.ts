import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

const BUCKET = "checklist-photos";
const MAX_DIMENSION = 1280;
const MAX_BYTES = 900 * 1024;
const MIN_QUALITY = 0.1;
const QUALITY_STEP = 0.1;

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not encode image")),
      "image/jpeg",
      quality,
    );
  });
}

// Fixes EXIF orientation, downsizes so the long side is at most 1280px, and
// re-encodes as JPEG, stepping quality down until the file is under 900 KB.
export async function processPhoto(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not supported in this browser.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = 0.7;
    let blob = await canvasToJpegBlob(canvas, quality);
    while (blob.size > MAX_BYTES && quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - QUALITY_STEP);
      blob = await canvasToJpegBlob(canvas, quality);
    }
    return blob;
  } finally {
    bitmap.close();
  }
}

export function checklistPhotoPath(
  outletId: string,
  businessDate: string,
): string {
  return `${outletId}/${businessDate}/${crypto.randomUUID()}.jpg`;
}

export async function uploadChecklistPhoto(
  supabase: Supabase,
  path: string,
  blob: Blob,
): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false,
  });
  return { error: error?.message ?? null };
}

export type CameraAvailability = "ok" | "denied" | "unavailable";

// Best-effort check via the Permissions API (Chrome/Android support
// querying "camera"; Safari doesn't, and just returns "ok" — the OS camera
// sheet triggered by the file input's `capture` attribute handles its own
// permission prompt in that case, outside our control either way).
export async function checkCameraAvailability(): Promise<CameraAvailability> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    return "unavailable";
  }
  try {
    if (!navigator.permissions?.query) return "ok";
    const status = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    return status.state === "denied" ? "denied" : "ok";
  } catch {
    return "ok";
  }
}
