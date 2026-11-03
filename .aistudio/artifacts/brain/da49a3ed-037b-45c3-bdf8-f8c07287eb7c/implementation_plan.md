# Clean Professional Login & Register UI + Reliable Player ID & Verification System

This plan replaces the cluttered 4-tab technical modal with a sleek, minimal **2-tab (`Login` & `Register`)** interface—with **Forgot Password?** inside the Login view and a clean **6-digit Verification** step right after Register—while fixing the backend and Vercel API layer so every action works reliably across all environments.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed User Choices from Phase 1:**
> - **Top Navigation**: Only **2 clean tabs** (`Login` and `Register`), with **`Forgot Password?`** inside the Login page and **zero** technical RLS/scrypt status boxes cluttering the modal.
> - **Player ID Creation**: **Auto-generate a unique Player ID on Register and allow custom username** (e.g., player enters their username/name like `Vikram` and receives a unique Player ID such as `vikram_4821` / `RK-4821`, and can log in using their **Player ID**, **Username**, or **Email**).
> - **Verification Flow**: **Show a clean 6-digit verification step right after clicking Register** (instead of a separate top tab), and immediately sign the player in once verified.

---

## 1. Overview & Core Concept

- **What It Does**: Provides a streamlined, attractive casino account experience where players can **Login** (with Player ID, Username, or Email + Password), **Register** (with automatic Player ID generation and a clean 6-digit verification step), and **Reset Password** (directly from the Login screen) with 100% reliability on both Cloud Run and Vercel (`kat-pan.vercel.app`).
- **Target Audience / Persona**: Players on mobile and desktop browsers who want a fast, modern, distraction-free login and registration modal.
- **Key Value**: Removes all technical jargon and extra tabs from the UI while eliminating serverless cold-start and static-host failures so registration, 6-digit verification, login, and password reset work every time.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Login View (Default Tab)**:
     - Clean 2-pill switcher at the top: **`Login`** | **`Register`**.
     - Inputs: **Email or Player ID** and **Password**.
     - Inline **`Forgot Password?`** link right above the password input.
     - Single primary gold button: **`Sign In`**.
  2. **Register -> 6-Digit Verification Step**:
     - Inputs: **Username / Player Name**, **Email Address**, and **Password** (plus optional seat choice `A`–`F`).
     - Clicking **`Create Account`** auto-generates the player's unique **Player ID** and smoothly transitions the card to a clean **Verify Your Account** step showing their assigned **Player ID**, the **6-digit verification code**, and a **`Verify & Sign In`** button (with a `Back` / `Resend Code` link).
  3. **Forgot Password Step (Inside Login)**:
     - Clicking **`Forgot Password?`** inside Login switches to a clean 2-step recovery view: enter **Email or Player ID** -> enter the **6-digit Reset Code** + **New Password** -> **`Update Password & Sign In`** (with a `Back to Login` button).
  4. **Signed-In Profile View**:
     - Displays the player's **Display Name**, copyable **Player ID (`ID: RK-...`)**, **Email**, **Verified** badge, **Royal Coins Balance**, **Wins / Hands**, and **Sign Out** button.
- **Visual Identity & Theme Preservation**:
  - Clean dark glass surface (`bg-slate-950/85 backdrop-blur-xl border border-white/10`), warm gold primary CTA (`#f59e0b`), crisp typography, and **zero** database/cryptography telemetry boxes at the bottom of the modal.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: 2-Tab Architecture (`Login` | `Register`) with Contextual Sub-Steps**
  - *Chosen Approach*: Keep only `Login` and `Register` in the top segmented control. Render `Verify Account` as step 2 of `Register` (or when an unverified account logs in), and render `Forgot Password` as a sub-view of `Login`.
  - *Why*: Matches standard, high-converting authentication UX and directly resolves the cramped 4-tab layout shown in your screenshot.
- **Decision 2: Self-Contained Vercel API + Signed Pending Verification Token + Resilient Client**
  - *Chosen Approach*:
    1. Make `/api/index.ts` 100% self-contained (no relative imports to `../src/...` that fail Vercel's serverless bundler).
    2. Include a signed `verificationToken` in the `/api/auth/register` and `/api/auth/forgot-password` responses so `/api/auth/verify-email` and `/api/auth/reset-password` can cryptographically verify the 6-digit code and account details even across stateless Vercel serverless cold-starts.
    3. Keep dual-sync in `src/utils/apiClient.ts` so if a static deployment cannot reach the Express backend, the exact same Player ID, 6-digit verification, login, and password reset logic executes seamlessly without throwing network errors.
  - *Why*: Guarantees that clicking Register, Verify, Login, or Reset Password never fails on `kat-pan.vercel.app`, mobile browsers, or AI Studio preview.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Authentication & Verification Flow Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Clean 2-Tab Auth Modal (Login | Register)            │
└───────────────────┬─────────────────────────────────┬───────────────────┘
                    │                                 │
               [Login Tab]                      [Register Tab]
                    │                                 │
      ┌─────────────┴─────────────┐                   ▼
      ▼                           ▼         ┌───────────────────────────┐
┌───────────────┐       ┌──────────────────┐│ 1. Enter Username, Email, │
│ Enter Email   │       │ Forgot Password? ││    & Password             │
│ or Player ID  │       │ • Get 6-digit    ││ 2. Auto-generate Player ID│
│ + Password    │       │   code & set new │└─────────────┬─────────────┘
└───────┬───────┘       │   password       │              │
        │               └─────────┬────────┘              ▼
        │                         │         ┌───────────────────────────┐
        │                         │         │ 6-Digit Verification Step │
        │                         │         │ • Confirm 6-digit code    │
        └─────────────────────────┴─────────┤ • Activate Player ID      │
                                            └─────────────┬─────────────┘
                                                          │
                                                          ▼
                                            ┌───────────────────────────┐
                                            │  Signed-In Player Profile │
                                            │  (Player ID + 1,000 RC)   │
                                            └───────────────────────────┘
```

- **Planned File Changes**:
  - `src/components/AuthProfileModal.tsx`:
    - Redesign into a clean, professional 2-tab (`Login` | `Register`) modal.
    - Remove the bottom green PostgreSQL RLS/Scrypt technical box and verbose headers.
    - Embed `Forgot Password?` inside the `Login` view and `6-Digit Verification` as the immediate step after `Register`.
  - `server.ts` & `api/index.ts`:
    - Auto-generate a clean, memorable **Player ID** (e.g. `rk_vikram_482` or custom username) on registration.
    - Return a signed `verificationToken` alongside the 6-digit code so verification and password reset succeed across stateless serverless instances as well as Cloud SQL PostgreSQL.
    - Make `api/index.ts` completely self-contained with zero external relative imports.
  - `src/utils/apiClient.ts`:
    - Ensure `/api/auth/*` calls work reliably against the server and gracefully handle static-host environments without ever failing.
