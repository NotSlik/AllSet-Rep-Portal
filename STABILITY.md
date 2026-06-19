# AllSet CRM Stability Notes

This file documents the current split of responsibilities while the CRM is being stabilized. It is intentionally not a feature roadmap.

## Current Owners

- `app.js` owns the login gate, basic navigation switching, basic modals, basic tables, and core Firebase reads/writes.
- `ops.js` owns enhancement behavior: role-based navigation, admin/equipment lock prompts, cleaner job claim/start/complete actions, Leaderboard, cleaner Board, dashboard chat, unclaimed-job badges, and temporary map fallback behavior.
- `payment-images.js` owns public payment image display and admin payment image upload/update behavior.
- `map-bridge.js` only bridges Leaflet map/layer references for enhancement scripts.
- `map-rebuild.js` stays disabled until a future dedicated map rebuild pass.
- `map-fullscreen.css` stays disabled until a future dedicated fullscreen map pass.
- `map-ui-guard.js` is a small safety guard for hiding repeated map-mode-off toast noise and preventing saved-login sessions from staying trapped behind the gate.

## Stabilization Rules

- Do not re-enable fullscreen Live Map behavior until login, navigation, payments, chat, and cleaner jobs are verified stable.
- Do not merge map responsibilities deeper into `ops.js` while the current emergency `app.js` is still in place.
- Do not replace `app.js` with a stub or remove Firebase config/collections.
- Prefer small guards or isolated fixes over broad rewrites until the app is stable.
