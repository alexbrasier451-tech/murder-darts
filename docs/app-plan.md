# Murder Darts Scoring App Plan

## Goal

Build a simple Android-friendly scorer for the darts game "Murder" that makes turn scoring fast, clear, and hard to mis-tap during a pub game.

## Recommended First Build

Start as a mobile-first web app that can be installed to the Android home screen as a Progressive Web App.

Why this route:

- Fastest path from empty repo to a usable phone scorer.
- No Play Store account required.
- No Android Studio or emulator required for the first version.
- Can work offline once cached.
- Can still be wrapped as a native Android app later if needed.

Native Android is still a good option later if we want deeper phone integration, but the scoring logic and UI can be proven faster in a PWA first.

## Core User Flow

1. Start a new match.
2. Enter or keep default team names.
3. Select the active team.
4. Tap the dart result: number, single/double/treble, or bull.
5. Choose how the hit should be applied when there is a strategic choice.
6. Apply score and hit progress.
7. Move through the turn.
8. End the match automatically when every target is closed.
9. Show winner, final score, and match summary.

## Data Model

### Match

- Team names
- Active team
- Turn number
- Current dart in turn
- Total scores
- Target states
- Dart history
- Match status

### Target State

For each of the 23 targets:

- Team A hits, capped at `3`
- Team B hits, capped at `3`
- Whether Team A has opened it
- Whether Team B has opened it
- Whether it is closed by both teams

### Dart Entry

- Team
- Raw board hit, such as `S20`, `D8`, `T20`, `SB`, or `DB`
- Chosen target, such as `20`, `Doubles`, `Trebles`, or `Bulls`
- Chosen hit count: singles `1`, doubles as number `2`, trebles as number `3`, ring hits `1`, double bull `2`
- Points scored
- Resulting state change

## Rule Engine Requirements

- Generate all legal ways a dart can be assigned to one target.
- Allow the player to choose valid double/treble assignments: number target for multiplied hits, or ring target for one hit.
- Open a target at three hits.
- Close a target when both teams have three hits.
- Score only when the active team has opened the target and it is not closed.
- Keep scoring and hit progress separate so rules can be adjusted later.
- Preserve full dart history so undo is reliable.

## First Version Features

- New match
- Two editable team names
- Scoreboard with large current scores
- 23-target status grid
- Tap-friendly dart input
- Choice sheet for ambiguous hits
- Undo last dart
- End-match winner screen
- Local autosave so refreshes do not lose the match

## Nice-To-Have Later

- Match history
- Player names within each team
- Custom rules toggles
- Sound or haptic feedback
- Shareable match summary
- Landscape tablet mode
- Native Android wrapper or Play Store release

## Suggested Screens

- Match setup
- Live scoring
- Hit choice dialog
- Match summary
- Rules reference

## Android Installation Options

### PWA Install

For the first build, open the app in Chrome on the Android phone and use "Add to Home screen" or "Install app". This is the easiest personal-use option because it avoids APK signing and sideloading.

### Development Install

For a native build, Android Studio can deploy directly to a connected phone after Developer Options and USB debugging are enabled. Android also supports wireless debugging on Android 11 and later.

### APK Sideload

For a self-made APK, build the APK, transfer it to the phone, allow the installing app to install unknown apps, then open the APK. Google Play Protect may scan or warn on apps installed from outside the Play Store.

### Wider Distribution

Publishing through Google Play or distributing APKs broadly needs more setup: signing, release builds, testing, store policy, and developer verification. Android developer verification is becoming more important from September 2026 in selected regions, with a limited-distribution path for hobbyist apps.

## Milestones

### Milestone 1: Rules And Prototype

- Confirm open rules questions.
- Implement the match state model.
- Implement dart application logic.
- Add unit tests for opening, closing, scoring, undo, and end-game detection.

### Milestone 2: Playable Mobile UI

- Build the match setup screen.
- Build the live scoring screen.
- Build the target status grid.
- Build the hit choice flow.
- Add local autosave.

### Milestone 3: Phone Testing

- Test on desktop browser at mobile widths.
- Test on the Android phone through local network.
- Add PWA manifest and offline cache.
- Install to the phone home screen.

### Milestone 4: Polish

- Tune tap targets, contrast, and spacing for pub lighting.
- Add undo confirmation where useful.
- Add rules reference page.
- Add final match summary.

### Milestone 5: Native Path, If Needed

- Decide whether the PWA is enough.
- If native is needed, package the web app in an Android wrapper or rebuild with native Android tooling.
- Produce a signed APK for personal installation.

