---
scope: "mobile"
---

# Mobile Application Rules

- [MOB-001] Minimize battery drain and CPU wakeups by batching network requests and deferring non-critical telemetry to Wi-Fi charging windows.
- [MOB-002] Provide seamless offline operation with local database persistence, optimistic UI updates, and idempotent background sync.
- [MOB-003] Adhere to platform interface guidelines (Apple Human Interface Guidelines and Android Material Design) for standard navigation gestures and controls.
- [MOB-004] Store sensitive authentication credentials and tokens exclusively in platform-secure hardware storage (Keychain on iOS, Keystore/EncryptedSharedPreferences on Android).
- [MOB-005] Handle transient network drops, airplane mode, and slow cell connections gracefully with clear visual connection status indicators.
- [MOB-006] Respect platform background execution limits: register proper background task handlers and never leave runaway background timers alive.
- [MOB-007] Optimize memory footprints and prevent retention leaks: profile views, cancel active subscriptions when unmounting, and recycle long scrollable lists.
- [MOB-008] Request hardware and OS permissions (camera, location, microphone, notifications) contextually with clear user-facing justification dialogs.
- [MOB-009] Integrate automated crash and unhandled exception reporting without capturing PII or user screen contents.
- [MOB-010] Ensure touch targets across all interactive elements meet the minimum physical touch dimension of at least 48x48dp.
- [MOB-011] Bundle high-resolution asset density variants (@1x, @2x, @3x, mdpi, xhdpi, xxhdpi) or scalable vector assets to prevent blurry visuals.
- [MOB-012] Keep cold application launch time under 2 seconds by lazy-initializing non-essential SDKs and deferring heavy disk I/O.
- [MOB-013] Support deep linking and universal links with robust fallback routing to handle unauthenticated or missing content states.
- [MOB-014] Support dynamic screen dimensions, landscape/portrait rotations, foldables, and display cutouts (notches and dynamic islands).
- [MOB-015] Preserve user form entries and navigation navigation stack state across process terminations and low-memory app suspensions.
