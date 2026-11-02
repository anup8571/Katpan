# Vercel Agent Onboarding & Production SPA Setup

This plan executes the official Vercel onboarding playbook (`https://vercel.com/get-started.md`) to install and authenticate the Vercel CLI, install Vercel platform guidance, configure the global Vercel MCP connection, and add production single-page application (SPA) routing configuration for **Royal Katti 3D: Maang Patta Casino**.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed User Choices from Phase 1:**
> - **Setup Scope**: Execute the full global Vercel agent onboarding playbook **plus** add production Vercel SPA configuration for this 3D casino application.
> - **CLI Authentication**: Authenticate using an existing Vercel account via `vercel login` (pausing during execution if interactive device/browser verification is required).
> - **Project Linking & Deployment**: Keep setup strictly global as instructed in the playbook—do not link or deploy the project automatically during global onboarding.

---

## 1. Overview & Core Concept

- **What It Does**: Prepares the workspace and coding agent environment for seamless Vercel operations across projects while making the **Royal Katti 3D** Vite application zero-config ready for Vercel static/SPA hosting and temporary previews (`vercel deploy --temporary`).
- **Target Audience / Persona**: Developers and creators managing and deploying the 3D WebGL casino experience through Vercel CLI and MCP-enabled workflows.
- **Key Value**: Establishes a verified, reusable global Vercel toolchain (CLI, agent guidance, and shared MCP configuration) alongside clean SPA rewrite rules and immutable asset caching headers.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **CLI Installation & Account Verification**: The global `vercel` CLI is installed/updated and checked via `vercel whoami`. When unauthenticated, `vercel login` initiates the device/browser authorization flow and pauses for user confirmation.
  2. **Platform Guidance Installation**: Installs the official Vercel plugin (`npx plugins add vercel/vercel-plugin`), or falls back automatically to standalone global skills (`npx skills add vercel-labs/agent-skills --global`) if the plugin environment reports unsupported.
  3. **Global MCP Configuration**: Configures the shared `https://mcp.vercel.com` endpoint using the appropriate user-scoped configuration without overwriting existing settings.
  4. **Verified Readiness Report**: Outputs the exact verified status block required by the playbook (`CLI`, `Guidance`, `MCP`, `MCP config`, `Authenticated MCP check`, and `Reload`).
- **Visual Identity & Theme Preservation (Royal Katti 3D)**:
  - *Aesthetic Direction*: Retains the photorealistic **Obsidian, Mahogany & Brushed Brass** 3D casino aesthetic (`Cinzel` display typography paired with `Plus Jakarta Sans` HUD controls and `JetBrains Mono` tabular numerals).
  - *Viewport & HUD Integrity*: Full-viewport 3D WebGL canvas (`w-full h-full`) with aspect-ratio adaptive camera presets (`Top Felt`, `VIP Seat`, `Pedestal`, `Wide View`) and non-overlapping top/bottom HUD overlays obeying the 15% mobile sticky cap.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Global Agent Setup Without Premature Project Linking**
  - *Chosen Approach*: Install the Vercel CLI, platform skills, and global MCP config at the machine/user scope without running `vercel link` during onboarding.
  - *Why*: Directly follows the official `vercel.com/get-started.md` mandate (*"Do not create or link a Vercel project during global setup. Link a project later when a deployment or project-specific operation requires it"*).
  - *Alternatives Considered*: Automatically linking and deploying during setup—passed over per your confirmation and playbook rules.
- **Decision 2: Plugin-First with Standalone Skills Fallback**
  - *Chosen Approach*: Attempt `npx plugins add vercel/vercel-plugin` first, and fall back to `npx skills add vercel-labs/agent-skills --global` if plugin installation is unsupported in the current runtime.
  - *Why*: Ensures Vercel deployment and platform best-practice skills are installed reliably regardless of host agent plugin support.
- **Decision 3: Production SPA Routing & Asset Caching Configuration**
  - *Chosen Approach*: Configure build output directory (`dist`), clean SPA history fallback rewrites, and long-lived cache headers for static hashed bundles while keeping the existing 3D application code untouched.
  - *Why*: Ensures direct deep-links and query parameters (such as `?autostart=1`) resolve cleanly to the Vite entry point when hosted on Vercel.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Onboarding Workflow Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Vercel Onboarding Playbook Flow                      │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────────┐     ┌───────────────────┐     ┌─────────────────────┐
│ 1. Vercel CLI     │     │ 2. Agent Guidance │     │ 3. Vercel MCP       │
│ • Global install  │     │ • Try plugin      │     │ • Shared endpoint   │
│   vercel@latest   │     │   vercel-plugin   │     │   mcp.vercel.com    │
│ • Check whoami    │     │ • Fallback to     │     │ • Merge user-scoped │
│ • Run vercel login│     │   agent-skills    │     │   settings safely   │
└─────────┬─────────┘     └─────────┬─────────┘     └──────────┬──────────┘
          │                         │                          │
          └─────────────────────────┼──────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│             4. App Production Readiness & Verified Report               │
│ • SPA Rewrite Rules & Static Asset Cache Headers                        │
│ • Verified Status Summary (CLI / Guidance / MCP / Auth State)           │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Interactive Component & State Mapping**:
  - **CLI & Auth State**: Checks `vercel --version` and `vercel whoami`. If unauthenticated, triggers `vercel login` and surfaces the verification URL/code for the user to approve in their browser.
  - **Guidance & MCP State**: Verifies installed skills via `npx skills list` and merges the `vercel` MCP server entry (`npx mcp-remote https://mcp.vercel.com`) into user settings without clobbering existing keys.
  - **Build & Routing Verification**: Validates that the Vite production build (`npm run build`) compiles cleanly with the SPA configuration.
