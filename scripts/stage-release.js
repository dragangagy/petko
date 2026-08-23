/**
 * Copy store/install artifacts into release/<platform>/ without deleting originals.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const copies = [
  {
    from: "android/app/build/outputs/bundle/release/app-release.aab",
    to: "release/android-play-store/app-release.aab"
  },
  {
    from: "android/app/build/outputs/apk/debug/app-debug.apk",
    to: "release/android-play-store/app-debug.apk"
  },
  {
    from: "build/ios-export/App.ipa",
    to: "release/ios-app-store/App.ipa"
  },
  {
    from: "dist/Petko-Setup-1.4.0.exe",
    to: "release/windows-direct/Petko-Setup-1.4.0.exe"
  }
];

function copyFile(fromRel, toRel) {
  const from = path.join(root, fromRel);
  const to = path.join(root, toRel);
  if (!fs.existsSync(from)) {
    console.warn(`skip (missing): ${fromRel}`);
    return false;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log(`copied ${fromRel} → ${toRel}`);
  return true;
}

function copyDir(fromRel, toRel) {
  const from = path.join(root, fromRel);
  const to = path.join(root, toRel);
  if (!fs.existsSync(from)) {
    console.warn(`skip (missing): ${fromRel}`);
    return false;
  }
  fs.cpSync(from, to, { recursive: true });
  console.log(`copied ${fromRel} → ${toRel}`);
  return true;
}

function copyLatestAppx() {
  const dist = path.join(root, "dist");
  if (!fs.existsSync(dist)) {
    console.warn("skip (missing): dist/*.appx");
    return false;
  }
  const files = fs
    .readdirSync(dist)
    .filter((name) => name.endsWith(".appx") || name.endsWith(".msix"))
    .map((name) => ({ name, mtime: fs.statSync(path.join(dist, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) {
    console.warn("skip (missing): dist/*.appx");
    return false;
  }
  const destDir = path.join(root, "release", "windows-microsoft-store");
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, files[0].name);
  fs.copyFileSync(path.join(dist, files[0].name), dest);
  console.log(`copied dist/${files[0].name} → release/windows-microsoft-store/${files[0].name}`);
  return true;
}

for (const item of copies) {
  copyFile(item.from, item.to);
}

copyDir("build/Petko.xcarchive", "release/ios-app-store/Petko.xcarchive");
copyLatestAppx();
