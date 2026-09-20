import Script from "next/script";
import { THEME_STORAGE_KEY } from "@/lib/theme-storage-key";

// Runs before paint (blocking, in <head>) so the correct theme class is on
// <html> before React hydrates — avoids a flash of the wrong theme.
const script = `
(function () {
  try {
    var stored = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var theme = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    var isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var root = document.documentElement;
    root.classList.toggle("dark", isDark);
    root.style.colorScheme = isDark ? "dark" : "light";
  } catch (e) {}
})();
`;

export function ThemeScript() {
  // The no-before-interactive-script-outside-document rule predates the App
  // Router; beforeInteractive in a root layout is the documented pattern
  // there (see app/guides/scripts and api-reference/components/script).
  return (
    // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document
    <Script
      id="theme-init"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
