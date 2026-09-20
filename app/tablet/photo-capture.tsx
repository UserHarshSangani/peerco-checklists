"use client";

import { useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import {
  checkCameraAvailability,
  checklistPhotoPath,
  processPhoto,
  uploadChecklistPhoto,
} from "@/lib/photo-upload";

export type ItemPhotoState =
  | { status: "camera_blocked" }
  | { status: "uploading"; previewUrl: string; file: File; path: string }
  | { status: "uploaded"; previewUrl: string; file: File; path: string }
  | { status: "failed"; previewUrl: string; file: File; path: string };

export function isPhotoUploaded(
  state: ItemPhotoState | undefined,
): state is Extract<ItemPhotoState, { status: "uploaded" }> {
  return state?.status === "uploaded";
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
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke the object URL this component previously owned whenever it's
  // replaced, and on unmount — never read back from Storage, never leaked.
  const previewUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const nextUrl = state && "previewUrl" in state ? state.previewUrl : null;
    if (previewUrlRef.current && previewUrlRef.current !== nextUrl) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = nextUrl;
  }, [state]);
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  async function runUpload(file: File, path: string, previewUrl: string) {
    try {
      const blob = await processPhoto(file);
      const { error } = await uploadChecklistPhoto(supabase, path, blob);
      onChange({
        status: error ? "failed" : "uploaded",
        previewUrl,
        file,
        path,
      });
    } catch {
      onChange({ status: "failed", previewUrl, file, path });
    }
  }

  async function handleTakePhotoTap() {
    const availability = await checkCameraAvailability();
    if (availability !== "ok") {
      onChange({ status: "camera_blocked" });
      return;
    }
    inputRef.current?.click();
  }

  function handleFileSelected(file: File) {
    const previewUrl = URL.createObjectURL(file);
    const path = checklistPhotoPath(outletId, businessDate);
    onChange({ status: "uploading", previewUrl, file, path });
    void runUpload(file, path, previewUrl);
  }

  function handleRetry() {
    if (!state || state.status !== "failed") return;
    onChange({ ...state, status: "uploading" });
    void runUpload(state.file, state.path, state.previewUrl);
  }

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) handleFileSelected(file);
      }}
    />
  );

  if (!state) {
    return (
      <div className="mt-3">
        {hiddenInput}
        <button
          type="button"
          onClick={handleTakePhotoTap}
          className="min-h-[44px] rounded-full bg-bg px-4 text-sm font-medium text-text ring-1 ring-border active:scale-[0.98]"
        >
          📷 {t("tablet.takePhoto")}
        </button>
      </div>
    );
  }

  if (state.status === "camera_blocked") {
    return (
      <div className="mt-3">
        {hiddenInput}
        <p className="mb-2 text-sm text-danger">{t("tablet.cameraBlocked")}</p>
        <button
          type="button"
          onClick={handleTakePhotoTap}
          className="min-h-[44px] rounded-full bg-bg px-4 text-sm font-medium text-text ring-1 ring-border active:scale-[0.98]"
        >
          📷 {t("tablet.takePhoto")}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-3">
      {hiddenInput}
      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, never re-fetched */}
      <img
        src={state.previewUrl}
        alt={t("tablet.photoPreviewAlt")}
        className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-border"
      />
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
        <div className="flex flex-wrap gap-2">
          {state.status === "failed" && (
            <button
              type="button"
              onClick={handleRetry}
              className="min-h-[36px] rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-white"
            >
              {t("common.retry")}
            </button>
          )}
          <button
            type="button"
            disabled={state.status === "uploading"}
            onClick={handleTakePhotoTap}
            className="min-h-[36px] rounded-full px-3 py-1.5 text-sm font-medium text-muted ring-1 ring-border disabled:opacity-50"
          >
            {t("tablet.retakePhoto")}
          </button>
        </div>
      </div>
    </div>
  );
}
