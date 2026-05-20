# Conversation Summary for Handoff

## User goals (chronological)

1. **Multitask / deploy / GitHub** — Deploy all functionality; update GitHub with corrected code.
2. **PWA safe area** — ~1 cm top and bottom padding when app is installed; content was getting cropped.
3. **Audit items** — Gemini server-only, dispute→ticket, EUR payouts, weekly points reset, E2E tests (partial).
4. **Notifications** — Sound works but not in system tray; assistenza chat re-notifies on open for own/read messages.
5. **PWA layout iPhone 15 Pro Max** — White band pushes UI up; logo/ACCEDI under status bar; Samsung S13 OK; Safari OK; PWA on iPhone broken.
6. **Navbar/SOS** — Samsung: space pushes navbar halfway up over SOS buttons.
7. **Latest** — User: "hai combinato un casino" — landing has large teal block at bottom; map has white band pushing nav up.

---

## What was implemented

### Backend (Cloud Functions, `functions/src/`)
- **Fees**: `platformFees.ts` — peer 5%, mechanic plan 5/10/15%.
- **Gemini**: `gemini.ts` — `askBikeDoctor`, `analyzeBikeIssue` (API key server-side only).
- **Disputes**: `disputes.ts` — `disputeSOS` creates SOS `DISPUTED` + support ticket.
- **Payouts**: `payouts.ts` — `requestEurPayout`, `processEurPayout` (admin).
- **Loyalty sanitize**: `loyaltySanitize.ts` — `sanitizeAllLoyaltyPoints` (admin batch).
- **Weekly reset**: `leaderboard.ts` scheduled job.
- **Production reset**: `productionReset.ts` — admin callable.
- **Notifications**: SW FCM in PWA SW; `NotificationManager` / `GlobalNotifications` — no self-notify, no replay on chat open; `Chat.tsx` marks read with `lastReadAt` / `lastMessageSenderId`.

### Frontend
- **Config**: Removed `VITE_GEMINI_API_KEY` from required client env; `.env.example` documents `GEMINI_API_KEY` in functions.
- **PWA CSS** (`src/index.css`): `--app-viewport-bg`, `.pwa-fixed-shell` (fixed inset with safe-area), `.home-nav-stack`, `.top-pwa-safe`.
- **Landing**: `--app-viewport-bg` dark; header `top-pwa-safe`; footer no longer a full-width teal bar pinned to viewport bottom (uses `min-h` + `pb-[8.75rem]` on last slide).
- **Homes** (`CyclistHome`, `MechanicHome`, `PeerMechanicHome`): `home-nav-stack`, SOS row at `bottom: calc(5.75rem + safe-area)`.
- **Auth**: `pwa-fixed-shell`, white background.
- **App shell**: `pwa-fixed-shell` on logged-in app (was `bg-white` + `height: 100dvh` — contributes to white gap below nav).
- **Service worker**: `firebase-messaging-sw-import.js`, skipWaiting in Vite PWA config.
- **Admin**: "Strumenti admin" in STATS — sanitize points, production reset.
- **ProfileView**: production reset via `runProductionReset`; EUR payout UI; sanitize on login.

### Deployments (Firebase Hosting + Functions)
- Project: **doctorbike-v2**
- Hosting URL: https://doctorbike-v2.web.app
- Functions deployed include: `sanitizeAllLoyaltyPoints`, `productionReset`, `askBikeDoctor`, `analyzeBikeIssue`, `disputeSOS`, payouts, etc.
- **NOT fully deployed in summary state**: some iPhone PWA layout fixes may be committed (`843a395`, `eb4e311`, `b3db772`) but user still sees issues until PWA cache cleared.

### Git
- Repo: https://github.com/doctorbike34-rgb/360
- Notable commits: `208f30c` (features), `f07015d` (loyalty points), `eb4e311` (iOS viewport bg), `843a395` (pwa-fixed-shell), `ac23cbc` (notifications SW).

---

## Root causes of current layout mess

| Issue | Likely cause |
|--------|----------------|
| White band below nav (map) | App shell `bg-white` + `pwa-fixed-shell` not painting bottom; OR `pb-safe` on nav but parent still white; OR double safe-area padding |
| Landing teal block | Footer was `absolute bottom-0` with CTA; combined with scroll layout + `pb-[8.75rem]` may still look like a bar; user wants CTA integrated in scroll, not a pinned footer bar |
| Nav pushed up (Samsung) | Was `-mt-12` on center FAB; now `home-nav-stack` + SOS at `bottom: calc(5.75rem + safe-area)` |
| iPhone-only white | PWA cache (old SW); `100dvh` gap; `body`/`#initial-loader` white; `pwa-standalone` class timing |

---

## Key files to read first

| Area | Paths |
|------|--------|
| PWA layout | `src/index.css`, `src/App.tsx`, `index.html`, `src/main.tsx`, `src/lib/pwaInstall.ts` |
| Landing | `src/components/LandingPage.tsx` |
| Map / nav | `src/components/CyclistHome.tsx` (lines ~1067 nav, ~1420 SOS, ~1452 nav) |
| Auth | `src/components/Auth.tsx` |
| SW | `public/firebase-messaging-sw-import.js`, `vite.config.ts` (VitePWA) |
| Admin tools | `src/components/AdminHome.tsx` (STATS tab) |

---

## Recommended next fixes (for continuing assistant)

1. **Single layout system for PWA**
   - One wrapper: `position: fixed; inset: env(safe-area); `background: var(--app-viewport-bg)`.
   - Logged-in app: `--app-viewport-bg: #ffffff` (map) or `#020f0e` (landing only via route/body class).
   - Remove conflicting `pwa-shell-padding` + `height: 100dvh` on inner content.

2. **Landing**
   - Remove `absolute bottom-0` footer bar pattern; put CTA + pagination inside scroll area with `padding-bottom` only (e.g. `pb-8`), not a second fixed footer layer.
   - Ensure last slide section is NOT `min-h-screen` with empty space below content.

3. **Map home**
   - Nav: `bottom: 0`, `paddingBottom: env(safe-area-inset-bottom)` only (no extra 1cm on shell bottom).
   - Map tab content: `flex-1 min-h-0` with `paddingBottom: calc(var(--home-nav-height) + env(safe-area))` so map fills space above nav.
   - SOS row: `bottom: calc(var(--home-nav-height) + env(safe-area-inset-bottom))` — verify no overlap with nav icons.

4. **iPhone PWA cache**
   - User must delete PWA and reinstall from https://doctorbike-v2.web.app
   - Confirm reload when "Nuova versione disponibile" appears
   - Optional: bump SW version in `vite.config.ts` to force refresh

5. **Revert risky combinations**
   - Do not stack: `pwa-fixed-shell` bottom:0 + `pb-safe` on child + white parent + teal footer absolute bottom.
   - Test matrix: iPhone 15 Pro Max PWA, Samsung S13 PWA, Safari, desktop.

---

## User device matrix

| Device | Browser | PWA installed | Notes |
|--------|---------|---------------|--------|
| iPhone 15 Pro Max | OK | Broken layout (white push) | Primary focus |
| Samsung S13 | OK | OK | Navbar overlap reported, may be fixed in latest nav stack |
| Chrome/Safari | OK | N/A | Reference |

---

## Open / not done (from audit)

- Full E2E test suite
- EUR payout production (Stripe Connect)
- Gemini behind corporate proxy only (user must set `GEMINI_API_KEY` in functions env)
- Some audit P0/P1 items (full i18n, admin email in rules, dispute auto-ticket, weekly points reset verification in prod)

---

## Tone

User is frustrated with layout regression ("casino"). Prioritize a **minimal, coherent layout** over adding more layers. Test on real devices after each change.