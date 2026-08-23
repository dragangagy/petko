/**
 * Generate Microsoft Store tile PNGs in electron/appx/ from app-icon-store.png.
 * Uses macOS sips, or ImageMagick if sips is missing.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const src = path.join(root, "app-icon-store.png");
const destDir = path.join(root, "electron", "appx");

const tiles = [
  { name: "StoreLogo.png", w: 50, h: 50 },
  { name: "Square44x44Logo.png", w: 44, h: 44 },
  { name: "Square150x150Logo.png", w: 150, h: 150 },
  { name: "Wide310x150Logo.png", w: 310, h: 150 }
];

function which(cmd) {
  try {
    return execFileSync("which", [cmd], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function resizeCover(srcPng, destPng, w, h) {
  const sips = which("sips");
  if (sips) {
    const side = Math.max(w, h);
    execFileSync(sips, ["-z", String(side), String(side), srcPng, "--out", destPng], {
      stdio: "pipe"
    });
    if (w !== h) {
      execFileSync(
        sips,
        ["--padToHeightWidth", String(h), String(w), "--padColor", "0F172A", destPng],
        { stdio: "pipe" }
      );
    }
    return;
  }
  const magick = which("magick") || which("convert");
  if (magick) {
    execFileSync(
      magick,
      [
        srcPng,
        "-resize",
        `${Math.max(w, h)}x${Math.max(w, h)}`,
        "-gravity",
        "center",
        "-background",
        "#0f172a",
        "-extent",
        `${w}x${h}`,
        destPng
      ],
      { stdio: "pipe" }
    );
    return;
  }
  throw new Error("Need sips (macOS) or ImageMagick to build AppX tile assets.");
}

function main() {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing ${src}`);
  }
  fs.mkdirSync(destDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pwq-appx-"));
  try {
    for (const tile of tiles) {
      const out = path.join(destDir, tile.name);
      const scratch = path.join(tmp, tile.name);
      resizeCover(src, scratch, tile.w, tile.h);
      fs.copyFileSync(scratch, out);
      console.log(`Wrote electron/appx/${tile.name} (${tile.w}x${tile.h})`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
