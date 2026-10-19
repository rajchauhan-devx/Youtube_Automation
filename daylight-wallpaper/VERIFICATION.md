# Verification — 17 October 2026

The ARM64 release APK was built and installed on the local Android emulator (`Medium_Phone`). The release embeds its JavaScript bundle and was run without Metro.

Passed:

- TypeScript compilation and ESLint.
- Three React Native tests: four previews, selection/import bridge, wallpaper activation, pause bridge, boundary refresh, stopping refresh in the background, and refresh on reopening.
- Three native JUnit tests: all 24 local hours, exact boundaries and midnight rollover, and daylight-saving transition to the next local morning.
- Native Android system preview and home-screen wallpaper activation.
- Morning, afternoon, evening and night wallpaper rendering while the app was in the background, verified using screenshot colors.
- A real scheduled 11:59:58 AM → 12:00 PM switch with no broadcast or manual refresh at noon.
- Import through Android's document picker, immediate home-screen update, and reset to a built-in sample. Imported JPEG output differed by one channel value due to normal compression.
- Pausing at afternoon, moving the clock to evening, and verifying the afternoon image remained. Resuming followed the current period.
- Screen off, time change to night, and wake: correct night image appeared.

The emulator clock and automatic-time settings were restored after testing, and the temporary import fixture was deleted. Sample wallpapers and automatic switching were left enabled.

Not measured: physical-device power consumption, phone-specific lock-screen behavior, and long-duration overnight use. This is a locally installable development-signed APK, not a store-signed distribution.

Screenshots from the checks are in the ignored `artifacts/` folder. The source lives entirely inside `daylight-wallpaper/`; the pre-existing app was not edited.

## UI redesign verification

- TypeScript, ESLint and all six React Native/native tests passed after the redesign.
- Built and installed the redesigned ARM64 release APK without Metro.
- Inspected the collection and schedule layouts on the emulator, including the fixed activation dock and visible moment labels.
- Verified night selection, navigation from schedule rows to the matching preview, and the preview's photo shortcut opening Android's document picker.
- Retained existing photo slots and wallpaper preferences across the app update.
- Added cached, static dune artwork and vector icons; no animation loop or background polling was introduced.

The redesigned APK is `artifacts/Daylight-v2-android-arm64.apk`. Preview images are `artifacts/redesign-collection.png` and `artifacts/redesign-schedule.png`.

## Disable wallpaper update

Added an always-visible disable control that persists automatic switching off and replaces only Daylight-owned home/lock wallpapers with a still image. Other apps' wallpapers are left alone. Re-activation resumes automatic switching. Release version: 1.1 (code 2). Tests and emulator checks were intentionally skipped at the user's request; an ARM64 release APK was compiled.
