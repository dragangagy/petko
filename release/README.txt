Petko — store / install artifacts
=================================

Svaka platforma ima svoj folder. Originali ostaju gde su buildovani;
ovde su kopije spremne za upload. Verzija: 1.4 (code/build 5).

  android-play-store/       Google Play     →  app-release.aab
  ios-app-store/            App Store       →  App.ipa
  windows-microsoft-store/  Microsoft Store →  .appx / .msix  (NE .exe)
  windows-direct/           Sideload only   →  Petko-Setup-1.4.0.exe

Refresh:
  npm run android:bundle
  npm run win:build
  npm run win:appx
  npm run release:stage

Details: STORE.md
