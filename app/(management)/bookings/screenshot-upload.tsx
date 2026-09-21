"use client";

import { useMemo } from "react";
import { Camera, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { bookingScreenshotPath, processPhoto, uploadChecklistPhoto } from "@/lib/photo-upload";
import { useToast } from "@/components/ui/toast";

export type ScreenshotState =
  | { status: "uploading"; previewUrl: string; path: string }
  | { status: "uploaded"; previewUrl: string; path: string }
  | { status: "failed"; previewUrl: string; path: string };

export function isScreenshotUploaded(
  state: ScreenshotState | undefined,
): state is Extract<ScreenshotState, { status: "uploaded" }> {
  return state?.status === "uploaded";
}

// A plain file picker (not the tablet's camera-only component) for
// managers to attach an existing screenshot from their computer — reuses
// the same compress/upload pipeline and Storage path convention.
export function ScreenshotUpload({
  outletId,
  state,
  onChange,
}: {
  outletId: string;
  state: ScreenshotState | undefined;
  onChange: (state: ScreenshotState | undefined) => void;
}) {
  const { showError } = useToast();
  const supabase = useMemo(() => createClient(), []);

  async function runUpload(path: string, previewUrl: string, file: File) {
    try {
      const blob = await processPhoto(file);
      const { error } = await uploadChecklistPhoto(supabase, path, blob);
      if (error) {
        showError(error);
        onChange({ status: "failed", previewUrl, path });
        return;
      }
      onChange({ status: "uploaded", previewUrl, path });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showError(message);
      onChange({ status: "failed", previewUrl, path });
    }
  }

  function handleFile(file: File) {
    const previewUrl = URL.createObjectURL(file);
    const path = bookingScreenshotPath(outletId);
    onChange({ status: "uploading", previewUrl, path });
    void runUpload(path, previewUrl, file);
  }

  if (!state) {
    return (
      <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full bg-bg px-4 text-sm font-medium text-text ring-1 ring-border">
        <Camera className="h-4 w-4" aria-hidden="true" />
        Upload screenshot
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) handleFile(file);
          }}
        />
      </label>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-16 w-16 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, never re-fetched */}
        <img
          src={state.previewUrl}
          alt="Screenshot preview"
          className="h-16 w-16 rounded-lg object-cover ring-1 ring-border"
        />
        {state.status === "uploaded" && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-success-fg text-white"
          >
            <Check className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span
          className={`text-sm font-medium ${
            state.status === "uploaded"
              ? "text-success"
              : state.status === "failed"
                ? "text-danger"
                : "text-muted"
          }`}
        >
          {state.status === "uploading" && "Uploading…"}
          {state.status === "uploaded" && "Uploaded"}
          {state.status === "failed" && "Upload failed"}
        </span>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="flex w-fit items-center gap-1 text-xs font-medium text-muted hover:text-text"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Remove
        </button>
      </div>
    </div>
  );
}
