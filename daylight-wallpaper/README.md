# Daylight

A small, offline React Native app for **Android 9 and newer**. Pick up to four still images and let your home-screen wallpaper follow the local time of day.

| Moment | Local time |
| --- | --- |
| Morning | 6:00 AM–12:00 PM |
| Afternoon | 12:00 PM–6:00 PM |
| Evening | 6:00 PM–9:00 PM |
| Night | 9:00 PM–6:00 AM |

Four built-in sample landscapes make the app usable immediately. Each slot stores exactly one image; replacing it removes the old copy. Portrait photos work best. Images are center-cropped to fill the home screen, preserve their orientation during import, and are resized to a maximum dimension of 2560 pixels. Imports are limited to 50 MB.

## Use it

1. Install the APK on an Android phone that supports live wallpapers.
2. Tap a moment to preview it, then tap the photo icon on the preview or **Add photo** to choose your own image using Android's file picker.
3. Repeat for the other moments, or keep any sample images.
4. Tap **Set as wallpaper**, then confirm **Set wallpaper** in Android's preview. Choose home screen, or home and lock screen if your device offers that option.
5. Close the app. The native wallpaper service continues following the schedule.

**Flow with the day** pauses or resumes switching. Pausing freezes the currently scheduled moment, regardless of which preview is selected. **Disable wallpaper** in the bottom bar stops automatic changes and replaces Daylight with the current image as a still wallpaper. If another app already controls your wallpaper, its wallpaper is left untouched. Tap **Set as wallpaper** to activate Daylight again. Lock-screen behavior and available destinations depend on the phone's launcher. The app does not promise independent lock-screen scheduling.

This is a 24-hour wallpaper with four images, rather than a catalog of 24 different wallpapers. There are no accounts, ads, downloads, or paid services.

## Interface

A dark wallpaper gallery with mint accents, four compact moment previews, a photo shortcut directly on the main preview, and a fixed wallpaper activation button. **Daily schedule** shows every local time boundary; tap a schedule row to edit that moment. **Restore original wallpaper** returns a custom slot to its offline dune artwork.

## Battery behavior

Android hosts a native `WallpaperService` that draws a static bitmap. There is no animation loop, foreground service, background JavaScript task, polling, network request, exact alarm, wake lock, or battery-optimization exemption. While the wallpaper is visible, it schedules one callback at the next time boundary. While hidden or the screen is off, the callback is removed; the correct image is drawn when the wallpaper becomes visible again. Android may also ask for redraws after surface changes. Clock and timezone changes trigger a recalculation.

Only one downsampled bitmap is kept in the wallpaper engine. Photo decoding happens outside the React Native UI thread. Actual power usage depends on the device and has not been measured on physical hardware.

Android maintains the chosen live wallpaper across normal app closure and reboot. Android's **Force stop**, uninstall, or choosing another wallpaper can stop it; reopen and select Daylight again if necessary.

## Development

Requirements: Node 20.19.4+, JDK 17, Android SDK 36, Build Tools 36.0.0, and NDK 27.1.12297006. Set `ANDROID_HOME`, or put `sdk.dir=/absolute/path/to/Android/sdk` in `android/local.properties`.

```sh
cd daylight-wallpaper
npm ci
npm start
```

In a second terminal, with a device or emulator connected:

```sh
cd daylight-wallpaper
npm run android
```

This app includes native Android code and cannot run in Expo Go. The project is Android-only.

```sh
npm run typecheck
npm run lint
npm test -- --runInBand
npm run test:android
npm run build:android
```

The release APK is generated at `android/app/build/outputs/apk/release/app-release.apk`. It embeds the JavaScript bundle, so Metro is not needed after installation. The included release build uses the React Native template's development signing key for local testing. Configure your own release signing key before publishing to a store. By default, source builds support the template's four Android ABIs; the supplied test APK may be built for ARM64 only.

## Source

- `App.tsx`: preview, four photo slots, automatic toggle, activation and errors.
- `android/app/src/main/java/com/daylightwallpaper/wallpaper/DaySchedule.kt`: local time boundaries.
- `WallpaperModule.kt`: React Native bridge, Android picker, bounded/normalized photo imports and persistence.
- `DaylightWallpaperService.kt`: static rendering, boundary callbacks and lifecycle handling.
- `WallpaperStore.kt`: four slots and offline sample artwork.

Android's [WallpaperService.Engine lifecycle documentation](https://developer.android.com/reference/android/service/wallpaper/WallpaperService.Engine) describes visibility callbacks used to suspend work while the wallpaper is hidden.
