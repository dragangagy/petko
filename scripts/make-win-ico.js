/**
 * Build electron/icon.ico from app-icon-store.png using macOS sips (or ImageMagick).
 * Embeds PNG images in the ICO container (Windows Vista+).
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const src = path.join(root, "app-icon-store.png");
const dest = path.join(root, "electron", "icon.ico");
const sizes = [16, 24, 32, 48, 64, 128, 256];

function which(cmd) {
  try {
    return execFileSync("which", [cmd], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function resizePng(srcPng, destPng, size) {
  const sips = which("sips");
  if (sips) {
    execFileSync(sips, ["-z", String(size), String(size), srcPng, "--out", destPng], {
      stdio: "pipe"
    });
    return;
  }
  const magick = which("magick") || which("convert");
  if (magick) {
    execFileSync(magick, [srcPng, "-resize", `${size}x${size}`, destPng], { stdio: "pipe" });
    return;
  }
  throw new Error("Need sips (macOS) or ImageMagick to resize the store icon.");
}

function writeIco(images, outPath) {
  const count = images.length;
  const headerSize = 6;
  const entrySize = 16;
  let offset = headerSize + entrySize * count;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const entries = [];
  const blobs = [];
  for (const img of images) {
    const dim = img.size >= 256 ? 0 : img.size;
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(dim, 0);
    entry.writeUInt8(dim, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    blobs.push(img.data);
    offset += img.data.length;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.concat([header, ...entries, ...blobs]));
}

function main() {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing ${src}`);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pwq-ico-"));
  try {
    const images = sizes.map((size) => {
      const out = path.join(tmp, `${size}.png`);
      resizePng(src, out, size);
      return { size, data: fs.readFileSync(out) };
    });
    writeIco(images, dest);
    console.log(`Wrote ${path.relative(root, dest)} (${sizes.join(", ")} px)`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
