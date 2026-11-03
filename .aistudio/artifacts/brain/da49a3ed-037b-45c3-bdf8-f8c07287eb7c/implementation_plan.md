# Implementation Plan - In-Game Header Cleanup, Table Glow Lights & Balanced Betting System

This plan details the implementation of a streamlined game header, realistic player names, 3D table glowing seat indicators (Red for Shuffler, Blue for Cutter, Yellow for other players transitioning to their bet choice), and a balanced two-sided betting workflow where dealing cannot start until Red and Blue sides match.

### User Review Required
> [!IMPORTANT]
> - **Header Items Confirmed**: As requested, only RC Balance, Hukam card, Profile button, and Settings button will remain in the top header. The redundant seat tabs (A–F) and repetitive pills will be removed.
> - **Bet Balancing Mechanism**: Dealing is locked until total bets on Red (Shuffler's side) and Blue (Cutter's side) are strictly equal (`redTotal === blueTotal`). An interactive Pool Balance Bar with live difference indicators and quick-adjust (+ / - / Match) controls will allow players and bots to balance the pool.
> - **Skip Bet Option**: Other players can opt to "Skip Bet", which keeps their seat light glowing Yellow while others who bet switch to Red or Blue.

---

### Proposed Changes

#### 1. Real Player Names & Game Rules (`src/game/types.ts`, `src/game/rules.ts`)
- Replace generic "Player A", "Player B", etc. with realistic player names:
  - Human user's seat uses their authenticated profile name (`displayName` / `username`, e.g., "Anup").
  - Bot seats receive distinguished, authentic names (e.g., "Vikram", "Kabir", "Aarav", "Meera", "Rohan").
- Extend player seat state with:
  - `side`: `'red'` | `'blue'` | `'none'`
  - `betStatus`: `'pending'` | `'placed'` | `'skipped'`
- Update the phased betting workflow state machine:
  1. `shuffling` (Shuffler shuffles)
  2. `cutting` (Cutter cuts & reveals Hukam)
  3. `betting_cutter` (Cutter places initial Blue bet)
  4. `betting_shuffler` (Shuffler places initial Red bet)
  5. `betting_players` (Other players bet on Red, Blue, or Skip)
  6. `balancing` (System checks `redTotal === blueTotal`; if unequal, prompts adjustments; if equal, allows `dealing`)
  7. `dealing` (Cards dealt to Andar/Bahar)
  8. `round_over`

#### 2. 3D Table Seat Glowing Lights (`src/3d/CasinoScene.ts`)
- Add dynamic glowing halo rings and point light accents under each player seat marker:
  - **Shuffler**: Vibrant glowing Red (`#ef4444`)
  - **Cutter**: Vibrant glowing Blue (`#3b82f6`)
  - **Other Players**: Warm glowing Yellow (`#eab308`)
  - **Bet Reaction**: When any player places a bet on Red, their table halo changes to Red; when placed on Blue, halo changes to Blue; if they skip, halo stays Yellow.
- Render actual player names (instead of letters A–F) on 3D seat placards/canvases.

#### 3. In-Game Header Streamlining (`src/components/HUD.tsx`)
- Remove cluttered elements:
  - Remove center desktop seat selector tabs (A, B, C, D, E, F).
  - Remove redundant Under/Cutter mini pills (now clearly conveyed by 3D glowing lights and seat badges).
- Retain only the essentials:
  - **Left**: RC Balance & Room Code chip (if in multiplayer).
  - **Center**: Current Hukam Point Card.
  - **Right**: Profile Button (opens profile modal) & Settings Button (opens audio/game settings).

#### 4. Balanced Pool Display & Controls (`src/components/ControlDock.tsx`, `src/components/BettingDock.tsx`)
- Implement a dedicated **Two-Sided Pool Tracker**:
  - Live **Red Side (Shuffler)** total vs **Blue Side (Cutter)** total with distinct visual gauges.
  - Status banner: "Balanced (X RC each) - Ready to Deal!" vs "Unbalanced (Difference: Y RC) - Adjust bets to match".
- Add sequential turn prompt:
  - Step indicator showing whose turn it is (Cutter -> Shuffler -> Table Players -> Pool Balancing).
  - Betting options: "Bet Red", "Bet Blue", "Skip Bet", and "+/-" adjustment buttons during balancing.
  - Bots automatically make realistic wagers and assist in balancing the remaining difference so games flow smoothly.

#### 5. Main Coordination (`src/App.tsx`)
- Integrate user profile state directly into active seat naming.
- Connect the new phased flow to the 3D scene lights and deal triggers.
- Ensure audio and visual cues celebrate balanced pools and phase changes.

---

### Verification Plan

#### Automated Tests
- Run `npm run lint` / `tsc --noEmit` to verify type safety and build integrity.
- Run `compile_applet` to ensure Vite production bundle builds without errors.

#### Manual Verification
1. **Header Verification**:
   - Inspect top header: Confirm only RC Balance, Hukam card, Profile button, and Settings button are visible.
   - Click Profile button -> verify ProfileModal opens.
   - Click Settings button -> verify SettingsModal opens.
2. **Player Names Verification**:
   - Check table: Confirm real human name ("Anup") appears on user's seat, and names like Vikram, Kabir, Aarav appear on bot seats (no generic "Player A/B/C/D").
3. **Table Glow Lights Verification**:
   - Verify Shuffler seat has glowing Red light.
   - Verify Cutter seat has glowing Blue light.
   - Verify other seats have glowing Yellow lights.
   - Have a player bet Red -> confirm indicator switches to Red.
   - Have a player bet Blue -> confirm indicator switches to Blue.
   - Have a player click "Skip Bet" -> confirm indicator remains Yellow.
4. **Betting & Dealing Workflow**:
   - Confirm Shuffler shuffles first, then Cutter cuts.
   - Confirm Cutter bets first, followed by Shuffler.
   - Confirm Red & Blue totals appear clearly on screen.
   - Confirm dealing button is disabled when `redTotal !== blueTotal`.
   - Adjust bets until `redTotal === blueTotal` -> confirm dealing unlocks and round proceeds smoothly.
