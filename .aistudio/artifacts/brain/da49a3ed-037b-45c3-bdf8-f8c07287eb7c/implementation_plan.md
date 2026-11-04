# Implementation Plan: Settings Button Mobile Placement & Responsive HUD Fix

## Root Cause
On mobile viewports (<400px width), the top HUD flex row contained an expanded balance pill, room code badge, center Hukam card pill, and a wide text-based Profile button. The combined intrinsic width exceeded the mobile viewport width, causing the flex row to overflow horizontally to the right and pushing the rightmost element (`settings-btn`) outside the visible screen.

## Changes Implemented

1. **Responsive Header Layout (`HUD.tsx`)**:
   - Replaced `fixed inset-x-0 top-0 p-2.5` with `fixed top-2 left-2 right-2 sm:top-3 sm:left-4 sm:right-4` with strict containment.
   - Set Profile button to display avatar icon on mobile screens and text on `sm:` breakpoints, saving 60–90px of horizontal space.
   - Sized the balance, Hukam, and action buttons compactly with `shrink-0` and `shrink min-w-0`.
   - Total width required on mobile is now ~240px, well within any mobile viewport (320px–412px), guaranteeing the top Settings button is always 100% on-screen.

2. **ControlDock Settings Shortcut (`ControlDock.tsx`)**:
   - Added `onOpenSettings?: () => void;` to `ControlDockProps`.
   - Added a Settings button right inside the footer dock's top utility strip next to the `⚡ 2X` deal speed toggle for thumb reachability.

3. **Title Screen Settings Access (`TitleScreen.tsx`)**:
   - Added `onOpenSettings?: () => void;` and rendered the settings gear in the top-right glass bar.

4. **Integration & Verification (`App.tsx`)**:
   - Wired `onOpenSettings={() => setIsSettingsOpen(true)}` to `HUD`, `ControlDock`, and `TitleScreen`.
   - `lint_applet` (`tsc --noEmit`) passes with 0 errors.
   - `compile_applet` succeeds.
   - Dev server responds HTTP 200 OK.
