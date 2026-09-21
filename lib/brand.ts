// Single source of truth for the product's name and voice. Every place that
// shows the product name (page titles, metadata, header, login, settings,
// empty/success states, the install prompt, Apple/Android PWA meta) reads
// from here — never hardcode "PeerCo Daybook" or "Daybook" elsewhere.
//
// Feature and navigation labels like "Checklists" are NOT the product name
// and are unaffected by this file.
export const APP_NAME = "PeerCo Daybook";
export const APP_SHORT_NAME = "Daybook";
export const APP_TAGLINE = "Better Operations. Stronger Restaurants.";
export const APP_SIGNOFF = "Good Food Happens Consistently";
