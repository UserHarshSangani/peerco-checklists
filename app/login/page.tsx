"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
      >
        <h1 className="mb-6 text-center text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          PeerCo Checklists
        </h1>

        <label
          htmlFor="email"
          className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-300"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          name="email"
          required
          autoComplete="username"
          className="mb-4 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 text-base text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />

        <label
          htmlFor="password"
          className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-300"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="mb-4 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 text-base text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />

        {state.error && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-2xl bg-zinc-900 py-3 text-base font-semibold text-white transition disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
