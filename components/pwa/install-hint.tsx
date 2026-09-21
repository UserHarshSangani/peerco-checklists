"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { APP_NAME } from "@/lib/brand";

const DISMISS_KEY = "peerco:install-hint-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function noopSubscribe() {
  return () => {};
}
function getTrue() {
  return true;
}
function getFalse() {
  return false;
}

// True once we're safely past hydration. Everything this component checks
// (user agent, display-mode, localStorage) only exists in the browser, so
// there is nothing meaningful to render on the server.
function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, getTrue, getFalse);
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true
  );
}

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function InstallHint() {
  const { t } = useLanguage();
  const mounted = useMounted();
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt,
    );
    return () =>
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Not remembered, but dismissing still works for this session.
    }
  }

  if (!mounted || dismissed || isStandalone() || wasDismissed()) return null;

  const iosHint = isIOS();
  if (!iosHint && !deferredPrompt) return null;

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    dismiss();
  }

  return (
    <div className="safe-bottom fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-surface p-4 shadow-lg ring-1 ring-border">
      <p className="flex-1 text-sm text-text">
        {iosHint
          ? t("install.iosHint", { name: APP_NAME })
          : t("install.prompt", { name: APP_NAME })}
      </p>
      {!iosHint && (
        <button
          type="button"
          onClick={install}
          className="min-h-[40px] shrink-0 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg"
        >
          {t("install.installAction", { name: APP_NAME })}
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("common.close")}
        className="flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center text-muted hover:text-text"
      >
        ✕
      </button>
    </div>
  );
}
