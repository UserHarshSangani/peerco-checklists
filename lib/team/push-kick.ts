// After an action that creates notifications, ask the server to send the
// phone pushes now instead of waiting for the once-a-minute run. Never
// blocks or fails the action.
export function kickPush(): void {
  if (typeof fetch === "undefined") return;
  fetch("/api/cron/push", { method: "POST", keepalive: true }).catch(() => {});
}
