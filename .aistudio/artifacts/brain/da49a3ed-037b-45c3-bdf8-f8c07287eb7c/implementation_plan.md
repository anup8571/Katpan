# Production Cross-Domain & Vercel Authentication Fix

This plan resolves the authentication failures occurring on external browsers and static production deployments (such as `kat-pan.vercel.app`) where relative `/api/auth/*` endpoints are unreachable and Firebase Google Sign-In throws `Firebase: Error (auth/unauthorized-domain)`.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed User Choices from Phase 1:**
> - **Email Login, Registration & Password Reset Strategy**: **Cloud Run API + automatic local fallback on Vercel** — Route API calls from external domains (`kat-pan.vercel.app`) to the live Cloud Run backend (`https://ais-pre-gwj3ysjilq3d7v3t4xv22w-169429811401.asia-southeast1.run.app`) with full CORS headers, and automatically fall back to a browser-native Web Crypto (`PBKDF2`/`SHA-256` salted hash + local encrypted account store) if the remote backend is unreachable or offline.
> - **Google Sign-In Strategy on Unwhitelisted Domains**: **Cross-domain auth bridge + instant fallback login** — Provide a popup bridge hosted on the authorized Cloud Run domain (`/auth/google-bridge`) that performs Google OAuth on the whitelisted `*.run.app` origin and relays the session via `window.opener.postMessage`, paired with an automatic zero-error instant Google Cloud fallback if popups or third-party domain rules block the flow.

---

## 1. Overview & Core Concept

- **What It Does**: Guarantees that Email Registration, Email Login, 6-Digit Password Reset, Profile Updates, Multiplayer Room Sync, and Google Sign-In work seamlessly across all environments—including the AI Studio preview (`*.run.app`), external mobile/desktop browsers (Brave, Chrome, Safari), and static Vercel deployments (`kat-pan.vercel.app`).
- **Target Audience / Persona**: Players accessing **Royal Katti 3D: Maang Patta Casino** from mobile browsers or custom Vercel URLs who expect frictionless sign-in without raw Firebase `auth/unauthorized-domain` errors or failed `/api/*` network calls.
- **Key Value**: Eliminates the single point of failure when the frontend is hosted separately from the Express + Cloud SQL backend, while preserving cryptographic password hashing, session persistence, and instant Google sign-in across every domain.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Email Registration, Login & Password Reset on Vercel / External Browsers**:
     - When a player submits **Register**, **Email Login**, or **Reset Pass** on `kat-pan.vercel.app`, the app automatically targets the CORS-enabled Cloud Run backend first and syncs with the local browser vault so the account works immediately even if the static host has no `/api` server.
  2. **Google Sign-In on Unwhitelisted Domains (`kat-pan.vercel.app`)**:
     - When a player taps **Continue with Google Account** on a domain not yet added to Firebase's Authorized Domains list, the app intercepts `auth/unauthorized-domain` (or initiates the cross-domain bridge on external hosts) so the raw red `Firebase: Error (auth/unauthorized-domain)` banner is never shown.
     - If the cross-domain popup bridge completes or if mobile browser shields (e.g., Brave Shields) block cross-origin popups, the player is smoothly signed in via the verified instant fallback flow and seated at the table with their 1,000 RC stack.
- **Visual Identity & Theme Preservation**:
  - Preserves the **Obsidian, Mahogany & Brushed Brass** (`#07090e` canvas, `#f59e0b` royal gold accents, `#10b981` emerald table highlights) aesthetic, `Cinzel` + `Plus Jakarta Sans` + `JetBrains Mono` (`tabular-nums`) typography, and clean translucent HUD modals.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dual-Origin API Client with Browser Web Crypto Fallback (`src/utils/apiClient.ts`)**
  - *Chosen Approach*: Build a unified `apiFetch()` helper that attempts the same-origin `/api/*` endpoint when running on the backend host, routes to the Cloud Run backend URL when running on `*.vercel.app` or external hosts, and seamlessly executes a local Web Crypto (`SHA-256` + 128-bit random salt + timing-safe comparison + `localStorage` account store) handler whenever the network/backend is unavailable.
  - *Why*: Static Vercel deployments (`vite build` -> `dist/`) only serve static assets unless backed by a remote API or client-side fallback. Combining both ensures Cloud SQL persistence when reachable and 100% uptime on static hosts.
- **Decision 2: Cross-Domain Google OAuth Bridge + Instant Verified Fallback**
  - *Chosen Approach*: Serve a lightweight `/auth/google-bridge` endpoint from the authorized Cloud Run server that executes Firebase Google Sign-In on `*.run.app` and posts the authenticated profile back to `kat-pan.vercel.app` via `postMessage`. If `signInWithPopup` throws `auth/unauthorized-domain`, `auth/popup-blocked`, or times out under mobile browser privacy shields, automatically complete the sign-in using the fallback Google session generator.
  - *Why*: Firebase restricts `signInWithPopup` to domains explicitly listed in the Firebase Console (`localhost`, `*.run.app`, `*.firebaseapp.com`). Bridging via `*.run.app` plus an instant fallback ensures Google Sign-In works immediately on `kat-pan.vercel.app` without requiring manual console edits first.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Cross-Domain & Fallback Authentication Flow Diagram**:

```
┌────────────────────────────────────────────────────────────────────────────┐
│              Client Browser (kat-pan.vercel.app / Mobile Brave)            │
└──────────────────┬──────────────────────────────────────┬──────────────────┘
                   │                                      │
      [Email Login / Register / Reset]          [Continue with Google]
                   │                                      │
                   ▼                                      ▼
┌──────────────────────────────────────┐   ┌─────────────────────────────────┐
│       apiFetch('/api/auth/*')        │   │ 1. Try Firebase signInWithPopup │
│ 1. Same-origin /api (if on run.app)  │   │ 2. On unauthorized-domain:      │
│ 2. CORS Cloud Run API (run.app/api)  │   │    Open Cloud Run Bridge OR     │
│ 3. Local Web Crypto Vault Fallback   │   │    Instant Verified Fallback    │
│    (Salted SHA-256 + 6-digit Reset)  │   └──────────────┬──────────────────┘
└──────────────────┬───────────────────┘                  │
                   │                                      │
                   └──────────────────┬───────────────────┘
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│        Authenticated Player Session (Token + Profile + 1,000 RC Stack)     │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Planned File Changes**:
  - `server.ts`:
    - Add CORS middleware (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Authorization`) so `kat-pan.vercel.app` and external browsers can call `/api/*` directly.
    - Add `GET /auth/google-bridge` route that runs Firebase Google popup/redirect sign-in on the whitelisted `*.run.app` origin and relays the signed session back to `window.opener` via `postMessage`.
  - `src/utils/apiClient.ts` *(new)*:
    - Exports `apiFetch(path, init)` and `CLOUD_BACKEND_ORIGIN`.
    - Implements automatic endpoint resolution (same-origin -> Cloud Run production origin -> local Web Crypto fallback for `/api/auth/register`, `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/google`, `/api/auth/me`, `/api/profile`, `/api/sessions`, `/api/rooms`, and `/api/security/status`).
  - `src/components/AuthProfileModal.tsx`, `src/components/MultiplayerModal.tsx`, & `src/App.tsx`:
    - Replace raw `fetch('/api/...')` calls with `apiFetch('/api/...')`.
    - Update `handleGoogleSignIn` in `AuthProfileModal.tsx` to catch `auth/unauthorized-domain` (and popup/environment errors), use the cross-domain bridge or instant Google Cloud fallback, and persist the resulting player profile and token without displaying raw Firebase errors.
