"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Camera, Check, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import {
  checklistPhotoPath,
  processPhoto,
  uploadChecklistPhoto,
} from "@/lib/photo-upload";

export type ItemPhotoState =
  | { status: "uploading"; previewUrl: string; file: File; path: string }
  | { status: "uploaded"; previewUrl: string; file: File; path: string }
  | { status: "failed"; previewUrl: string; file: File; path: string };

export function isPhotoUploaded(
  state: ItemPhotoState | undefined,
): state is Extract<ItemPhotoState, { status: "uploaded" }> {
  return state?.status === "uploaded";
}

function noopSubscribe() {
  return () => {};
}
function getTrue() {
  return true;
}
function getFalse() {
  return false;
}

// True once we're safely past hydration — touch-capability is client-only.
function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, getTrue, getFalse);
}

function isTouchDevice(): boolean {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

export function PhotoCapture({
  outletId,
  businessDate,
  state,
  onChange,
}: {
  outletId: string;
  businessDate: string;
  state: ItemPhotoState | undefined;
  onChange: (state: ItemPhotoState | undefined) => void;
}) {
  const { t } = useLanguage();
  const { showError } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const mounted = useMounted();

  // A photo just captured but not yet confirmed — shown full-screen with
  // Retake/Use photo before it's compressed and uploaded.
  const [pending, setPending] = useState<{ file: File; previewUrl: string } | null>(
    null,
  );

  // Revoke the object URL this component previously owned whenever it's
  // replaced, and on unmount — never read back from Storage, never leaked.
  const previewUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const nextUrl = state ? state.previewUrl : null;
    if (previewUrlRef.current && previewUrlRef.current !== nextUrl) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = nextUrl;
  }, [state]);
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      if (pending) URL.revokeObjectURL(pending.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runUpload(file: File, path: string, previewUrl: string) {
    try {
      const blob = await processPhoto(file);
      const { error } = await uploadChecklistPhoto(supabase, path, blob);
      if (error) {
        console.error("Checklist photo upload failed:", error);
        showError(error);
        onChange({ status: "failed", previewUrl, file, path });
        return;
      }
      onChange({ status: "uploaded", previewUrl, file, path });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Checklist photo processing failed:", err);
      showError(message);
      onChange({ status: "failed", previewUrl, file, path });
    }
  }

  function handleFileSelected(file: File) {
    const previewUrl = URL.createObjectURL(file);
    setPending({ file, previewUrl });
  }

  function handleRetake() {
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    setPending(null);
  }

  function handleUsePhoto() {
    if (!pending) return;
    const { file, previewUrl } = pending;
    setPending(null);
    const path = checklistPhotoPath(outletId, businessDate);
    onChange({ status: "uploading", previewUrl, file, path });
    void runUpload(file, path, previewUrl);
  }

  function handleRetry() {
    if (!state || state.status !== "failed") return;
    onChange({ ...state, status: "uploading" });
    void runUpload(state.file, state.path, state.previewUrl);
  }

  const showNonTouchHint = mounted && !isTouchDevice();
  const isUploading = state?.status === "uploading";

  const trigger = (
    <div className="flex flex-col items-start gap-1">
      <label
        className={`relative inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-full bg-bg px-4 text-sm font-medium text-text ring-1 ring-border active:scale-[0.98] ${
          isUploading ? "opacity-50" : ""
        }`}
      >
        {/*
          Native <label>+<input> association (not a JS input.click()) so the
          browser treats opening the camera as part of this click's own
          user activation — a programmatic .click() after any await loses
          that activation in most browsers and silently no-ops. No gallery
          fallback: capture="environment" opens the camera directly.
          sr-only via position/opacity (not display:none or hidden) keeps
          the input focusable and keyboard-operable.
        */}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={isUploading}
          className="absolute h-px w-px opacity-0"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset so choosing the same file again still fires onChange,
            // and so a cancelled picker (no file) leaves nothing behind.
            event.target.value = "";
            if (file) handleFileSelected(file);
          }}
        />
        <Camera className="h-4 w-4" aria-hidden="true" />
        {t(state ? "tablet.retakePhoto" : "tablet.takePhoto")}
      </label>
      {showNonTouchHint && (
        <p className="text-xs text-muted">{t("tablet.nonTouchHint")}</p>
      )}
    </div>
  );

  return (
    <>
      {!state ? (
        <div className="mt-3">{trigger}</div>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <div className="relative h-16 w-16 shrink-0">
            {state.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview, never re-fetched
              <img
                src={state.previewUrl}
                alt={t("tablet.photoPreviewAlt")}
                className="h-16 w-16 rounded-lg object-cover ring-1 ring-border"
              />
            ) : (
              // Restored from a draft — the file itself isn't persisted, so
              // there's no local preview to show. It's already uploaded, so
              // this is just a placeholder, not re-fetched from Storage.
              <div
                aria-hidden="true"
                className="flex h-16 w-16 items-center justify-center rounded-lg bg-success-bg ring-1 ring-border"
              >
                <Check className="h-6 w-6 text-success-fg" />
              </div>
            )}
            {state.status === "uploaded" && state.previewUrl && (
              <span
                aria-hidden="true"
                className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-success-fg text-white"
              >
                <Check className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <span
              className={`text-sm font-medium ${
                state.status === "uploaded"
                  ? "text-success"
                  : state.status === "failed"
                    ? "text-danger"
                    : "text-muted"
              }`}
            >
              {state.status === "uploading" && t("tablet.uploadingPhoto")}
              {state.status === "uploaded" && t("tablet.photoUploaded")}
              {state.status === "failed" && t("tablet.photoUploadFailed")}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {state.status === "failed" && (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="min-h-[36px] rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg"
                >
                  {t("common.retry")}
                </button>
              )}
              {trigger}
            </div>
          </div>
        </div>
      )}

      {pending && (
        <div className="fixed inset-0 z-100 flex flex-col bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, never re-fetched */}
          <img
            src={pending.previewUrl}
            alt={t("tablet.photoPreviewAlt")}
            className="flex-1 object-contain"
          />
          <div className="safe-bottom flex gap-3 bg-black/80 p-4">
            <Button
              type="button"
              variant="secondary"
              onClick={handleRetake}
              className="flex-1"
            >
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
              {t("tablet.retake")}
            </Button>
            <Button type="button" onClick={handleUsePhoto} className="flex-1">
              <Check className="h-5 w-5" aria-hidden="true" />
              {t("tablet.usePhoto")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
