import type { ReactNode } from "react";

// Centered card used by the password reset pages (same look as the small
// login card on phones).
export function AuthCard({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <main className="safe-bottom flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-3xl bg-surface p-8 shadow-sm ring-1 ring-border">
        <div className="mb-6 text-center">
          <span className="font-serif text-2xl font-bold text-text">PeerCo</span>
          <span className="ml-2 font-serif text-xl font-semibold text-muted">Daybook</span>
        </div>
        <h1 className="mb-4 text-xl font-semibold text-text">{heading}</h1>
        {children}
      </div>
    </main>
  );
}
