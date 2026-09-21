const LOCATION_EXPLAINER_KEY = "peerco:location-explainer-seen";

export function hasSeenLocationExplainer(): boolean {
  try {
    return window.localStorage.getItem(LOCATION_EXPLAINER_KEY) === "1";
  } catch {
    return true; // storage unavailable — don't block the flow on it
  }
}

export function markLocationExplainerSeen() {
  try {
    window.localStorage.setItem(LOCATION_EXPLAINER_KEY, "1");
  } catch {
    // ignore
  }
}
