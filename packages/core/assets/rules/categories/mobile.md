# Category Rules: Mobile

1. Offline Resilience: Handle intermittent network connectivity gracefully with cached data and background sync.
2. Battery & Memory: Avoid polling loops; release hardware listeners and native bridges when components unmount.
3. Safe Storage: Store sensitive credentials and tokens exclusively in Keychain / Keystore / SecureStore.
4. Screen Adaptability: Support multiple device densities, notch insets, and orientation changes.
