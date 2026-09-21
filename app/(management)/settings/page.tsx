"use client";

import packageJson from "../../../package.json";
import { APP_NAME } from "@/lib/brand";
import { LanguageSwitcher } from "@/components/language/language-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LogoutButton } from "@/components/logout-button";
import { Card } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <main className="flex-1 p-4 sm:p-6">
      <h2 className="mb-6 text-xl font-semibold text-text">Settings</h2>

      <div className="flex max-w-md flex-col gap-4">
        <Card>
          <p className="mb-2 text-sm font-semibold text-text">Language</p>
          <LanguageSwitcher />
        </Card>

        <Card>
          <p className="mb-2 text-sm font-semibold text-text">Theme</p>
          <ThemeToggle />
        </Card>

        <Card className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-text">{APP_NAME}</p>
            <p className="text-xs text-muted">Version {packageJson.version}</p>
          </div>
          <LogoutButton />
        </Card>
      </div>
    </main>
  );
}
