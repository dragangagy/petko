/**
 * Copy static PWA assets into www/ for Capacitor / Electron packaging.
 * Keeps node_modules, .git, SQL, and native projects out of the web bundle.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "www");

const ROOT_FILES = [
  "index.html",
  "privacy.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "sw.js",
  "icon.svg",
  ".nojekyll"
];

const ROOT_MEDIA_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".mp3",
  ".wav",
  ".ogg",
  ".webm"
]);

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir) {
  ensureDir(destDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, entry.name);
    const to = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else if (entry.isFile()) {
      copyFile(from, to);
    }
  }
}

function main() {
  rmrf(outDir);
  ensureDir(outDir);

  for (const name of ROOT_FILES) {
    const src = path.join(root, name);
    if (fs.existsSync(src)) {
      copyFile(src, path.join(outDir, name));
    }
  }

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!ROOT_MEDIA_EXT.has(ext)) continue;
    copyFile(path.join(root, entry.name), path.join(outDir, entry.name));
  }

  const avatarSrc = path.join(root, "avatar");
  if (fs.existsSync(avatarSrc)) {
    copyDir(avatarSrc, path.join(outDir, "avatar"));
  }

  const count = (function walk(dir) {
    let n = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) n += walk(p);
      else n += 1;
    }
    return n;
  })(outDir);

  console.log(`Built www/ with ${count} files for Capacitor.`);
}

main();
