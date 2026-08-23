# Store packaging — Petko

**appId:** `rs.glab.petko`  
**App name:** Petko  
**Version name:** 1.4  
**Version code / build:** 5  
**Web assets:** copied into `www/` then synced into native projects (local files, not remote GitHub Pages).

GitHub: this repo (`dragangagy/petko`).  
Supabase: Petko project `https://kfpyrajlxrucmrlhyvgr.supabase.co` (not Word Quest).

Multi-device continue needs `sql/2026-08-23-game-sessions.sql` run once in **this** Supabase SQL editor.

## Release folders

Staged copies live under `release/`. Originals are not deleted. Refresh with `npm run release:stage`.

| Folder | File | Store | Version |
|--------|------|-------|---------|
| `release/android-play-store/` | **`app-release.aab`** | Google Play Console | 1.4 / versionCode 5 |
| `release/ios-app-store/` | **`App.ipa`** | Transporter / App Store Connect | 1.4 build 5 |
| `release/windows-microsoft-store/` | **`Petko-*.appx`** | Microsoft Partner Center | 1.4.0 |
| `release/windows-direct/` | `Petko-Setup-1.4.0.exe` | **Not a store** (sideload) | 1.4.0 |

- Play: upload only the `.aab` (`app-debug.apk` is local test only).
- App Store: upload only the `.ipa` (the `.xcarchive` is for re-export, not Transporter).
- Microsoft Store: **APPX/MSIX only**. The NSIS `.exe` cannot be submitted.
- Bundle id (Play + Apple): `rs.glab.petko`. Windows Store identity: `Petko`.

## Prerequisites

| Platform | Required |
|----------|----------|
| Both | Node.js 20+, npm |
| Android | Android Studio or SDK + **JDK 21**, Play Console account |
| iOS | **macOS + Xcode** (cannot archive/upload from Windows), Apple Developer account |
| Windows | Node.js 20+; `npm run win:appx` (Microsoft Store APPX) and/or `npm run win:build` (NSIS sideload) |

## Daily build / sync

```bash
npm install
npm run build          # copies static PWA files into www/
npx cap sync           # or: npm run cap:sync
```

Open native IDEs:

```bash
npm run cap:open:android   # Android Studio
npm run cap:open:ios       # Xcode (macOS only)
```

## Icons & splash

- `app-icon-store.png` — 1024×1024 (Play / App Store master)
- `app-icon-maskable-v2.png` — maskable Android adaptive
- `petko-splash.png` — in-app splash art

```bash
npm run assets
npx cap sync
```

## Android — signed AAB (Google Play)

1. Sync: `npm run cap:sync:android`
2. Copy `android/keystore.properties.example` → `android/keystore.properties` and fill paths/passwords (use the existing Petko `.jks` from USB `kljucevi/`, do not commit it).
3. Build:

```bash
npm run android:bundle
# output: android/app/build/outputs/bundle/release/app-release.aab
```

4. Upload the `.aab` in Play Console. A copy is staged at `release/android-play-store/app-release.aab`.

Versioning: `versionCode` / `versionName` in `android/app/build.gradle` (currently **5** / **1.4**).

## iOS — App Store archive (macOS only)

```bash
npm install
npm run build
npx cap sync ios
npx cap open ios
```

In Xcode:

1. App target → Signing & Capabilities → Team + bundle id `rs.glab.petko`
2. Marketing 1.4 / Build 5
3. Device → Any iOS Device (arm64)
4. Product → Archive
5. Distribute App → App Store Connect → Upload

Staged copy: `release/ios-app-store/App.ipa`.

## Windows — Microsoft Store (APPX)

```bash
npm run win:appx
# output: dist/Petko-1.4.0.appx
# staged: release/windows-microsoft-store/
```

Set Partner Center `publisher` CN in `electron-builder.yml` under `appx:` before certification. Leave unset for a local/test pack (`CN=ms`).

## Windows — NSIS installer (sideload only)

```bash
npm run win:build
# output: dist/Petko-Setup-1.4.0.exe
# staged: release/windows-direct/
```

Do **not** upload the `.exe` to Partner Center.

## Cross-device continue

Same nickname, or profile link code `PK-...`. Newest `updatedAt` wins. Apply `sql/2026-08-23-game-sessions.sql` in Petko Supabase first.

## What not to commit

- `*.jks` / `*.keystore` / `android/keystore.properties`
- `android/local.properties`
- Apple `.p12` / provisioning private keys
- Windows Authenticode `*.pfx` / `certs/`
- Service-role Supabase keys
