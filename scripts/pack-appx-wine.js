/**
 * Pack dist/win-unpacked into an APPX for Microsoft Store.
 *
 * On Windows, uses makeappx.exe when the Windows SDK / electron-builder kit
 * is present. On macOS/Linux, Wine's makeappx is tried first; if Wine cannot
 * load (broken on some newer macOS builds), a spec-compliant uncompressed
 * APPX is written in-process (ZIP STORE + AppxBlockMap).
 *
 * Publisher defaults to electron-builder's local/test identity CN=ms.
 * Set APPX_PUBLISHER to the Partner Center CN=... before a Store upload build.
 */
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const appOutDir = path.join(root, "dist", "win-unpacked");
const version = String(pkg.version || "1.0.0");
const versionParts = version.split(".").map((part) => parseInt(part, 10) || 0);
const windowsVersion = `${versionParts[0] || 0}.${versionParts[1] || 0}.${versionParts[2] || 0}.0`;

const identityName = process.env.APPX_IDENTITY_NAME || "Petko";
const applicationId = process.env.APPX_APPLICATION_ID || "Petko";
const publisherDisplayName = process.env.APPX_PUBLISHER_DISPLAY || "G-Lab";
const displayName = "Petko";
const publisher = process.env.APPX_PUBLISHER || "CN=ms";
const artifactName = `Petko-${version}.appx`;
const artifactPath = path.join(root, "dist", artifactName);

const BLOCK = 65536;
const requiredAssets = [
  "StoreLogo.png",
  "Square44x44Logo.png",
  "Square150x150Logo.png",
  "Wide310x150Logo.png"
];

const CONTENT_TYPES = {
  appx: "application/vnd.ms-appx",
  asar: "application/octet-stream",
  bin: "application/octet-stream",
  css: "text/css",
  dat: "application/octet-stream",
  dll: "application/x-msdownload",
  exe: "application/x-msdownload",
  gif: "image/gif",
  html: "text/html",
  ico: "image/x-icon",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  js: "application/javascript",
  json: "application/json",
  node: "application/octet-stream",
  pak: "application/octet-stream",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain",
  xml: "application/xml",
  yml: "text/yaml"
};

function toWinePath(absPath) {
  return "Z:" + absPath.replace(/\//g, "\\");
}

function walkFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      out.push(...walkFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function findMakeAppx() {
  const envKit = process.env.ELECTRON_BUILDER_WINDOWS_KITS_PATH;
  if (envKit && fs.existsSync(path.join(envKit, "makeappx.exe"))) {
    return path.join(envKit, "makeappx.exe");
  }
  const cache = path.join(os.homedir(), "Library", "Caches", "electron-builder");
  if (!fs.existsSync(cache)) {
    return "";
  }
  const stack = [cache];
  while (stack.length) {
    const dir = stack.pop();
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const full = path.join(dir, name);
      if (name.toLowerCase() === "makeappx.exe" && full.includes(`${path.sep}x64${path.sep}`)) {
        return full;
      }
      try {
        if (fs.statSync(full).isDirectory() && !name.startsWith(".")) {
          stack.push(full);
        }
      } catch {
        /* skip */
      }
    }
  }
  return "";
}

function writeManifest(outFile) {
  const template = path.join(
    root,
    "node_modules",
    "app-builder-lib",
    "templates",
    "appx",
    "appxmanifest.xml"
  );
  const macros = {
    identityName,
    arch: "x64",
    publisher,
    version: windowsVersion,
    displayName,
    publisherDisplayName,
    description: pkg.description || displayName,
    logo: "assets\\StoreLogo.png",
    resourceLanguages: '<Resource Language="en-US" />',
    minVersion: "10.0.14316.0",
    maxVersionTested: "10.0.14316.0",
    capabilities:
      "<Capabilities>\n  <rescap:Capability Name=\"runFullTrust\" />\n</Capabilities>",
    applicationId,
    executable: "app\\Petko.exe",
    backgroundColor: "#0f172a",
    square150x150Logo: "assets\\Square150x150Logo.png",
    square44x44Logo: "assets\\Square44x44Logo.png",
    lockScreen: "",
    defaultTile: '<uap:DefaultTile Wide310x150Logo="assets\\Wide310x150Logo.png" />',
    splashScreen: "",
    extensions: ""
  };
  let xml = fs.readFileSync(template, "utf8");
  xml = xml.replace(/\${([a-zA-Z0-9]+)}/g, (match, key) => {
    if (!(key in macros)) {
      throw new Error(`Unknown AppX manifest macro: ${key}`);
    }
    return macros[key];
  });
  fs.writeFileSync(outFile, xml);
}

function collectPayload(manifestFile) {
  const assetsDir = path.join(root, "electron", "appx");
  const files = [];
  for (const file of walkFiles(appOutDir)) {
    const rel = path.relative(appOutDir, file).replace(/\//g, "\\");
    files.push({ abs: file, zip: `app\\${rel}` });
  }
  for (const name of requiredAssets) {
    const abs = path.join(assetsDir, name);
    if (!fs.existsSync(abs)) {
      throw new Error(`Missing electron/appx/${name} — run node scripts/make-appx-assets.js`);
    }
    files.push({ abs, zip: `assets\\${name}` });
  }
  files.push({ abs: manifestFile, zip: "AppxManifest.xml" });
  return files;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function blockMapXml(entries) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<BlockMap xmlns="http://schemas.microsoft.com/appx/2010/blockmap" HashMethod="http://www.w3.org/2001/04/xmlenc#sha256">'
  ];
  for (const entry of entries) {
    lines.push(
      `  <File Name="${escapeXml(entry.zip)}" Size="${entry.data.length}" LfhSize="${entry.lfhSize}">`
    );
    if (entry.data.length === 0) {
      const hash = crypto.createHash("sha256").update(Buffer.alloc(0)).digest("base64");
      lines.push(`    <Block Hash="${hash}"/>`);
    } else {
      for (let offset = 0; offset < entry.data.length; offset += BLOCK) {
        const chunk = entry.data.subarray(offset, Math.min(offset + BLOCK, entry.data.length));
        const hash = crypto.createHash("sha256").update(chunk).digest("base64");
        lines.push(`    <Block Hash="${hash}" Size="${chunk.length}"/>`);
      }
    }
    lines.push("  </File>");
  }
  lines.push("</BlockMap>");
  return Buffer.from(lines.join("\r\n"), "utf8");
}

function contentTypesXml(zipNames) {
  const exts = new Set();
  for (const name of zipNames) {
    const base = name.split("\\").pop() || name;
    const dot = base.lastIndexOf(".");
    if (dot > 0) {
      exts.add(base.slice(dot + 1).toLowerCase());
    }
  }
  const defaults = [...exts]
    .sort()
    .map((ext) => {
      const type = CONTENT_TYPES[ext] || "application/octet-stream";
      return `  <Default Extension="${escapeXml(ext)}" ContentType="${type}"/>`;
    })
    .join("\r\n");
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    defaults,
    '  <Override PartName="/AppxManifest.xml" ContentType="application/vnd.ms-appx.manifest+xml"/>',
    '  <Override PartName="/AppxBlockMap.xml" ContentType="application/vnd.ms-appx.blockmap+xml"/>',
    "</Types>"
  ].join("\r\n");
  return Buffer.from(xml, "utf8");
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function localHeader(nameBuf, data, crc, stamp) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(stamp.dosTime, 10);
  header.writeUInt16LE(stamp.dosDate, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBuf.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBuf]);
}

function centralHeader(nameBuf, data, crc, stamp, offset) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(stamp.dosTime, 12);
  header.writeUInt16LE(stamp.dosDate, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(data.length, 20);
  header.writeUInt32LE(data.length, 24);
  header.writeUInt16LE(nameBuf.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, nameBuf]);
}

function endOfCentral(count, centralSize, centralOffset) {
  const header = Buffer.alloc(22);
  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(0, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(count, 8);
  header.writeUInt16LE(count, 10);
  header.writeUInt32LE(centralSize, 12);
  header.writeUInt32LE(centralOffset, 16);
  header.writeUInt16LE(0, 20);
  return header;
}

function writeAppxZip(outPath, files) {
  const stamp = dosDateTime(new Date());
  const prepared = files.map((file) => {
    const data = Buffer.isBuffer(file.data) ? file.data : fs.readFileSync(file.abs);
    const nameBuf = Buffer.from(file.zip, "utf8");
    return {
      zip: file.zip,
      data,
      nameBuf,
      crc: zlib.crc32(data) >>> 0,
      lfhSize: 30 + nameBuf.length
    };
  });

  const payload = prepared.filter((file) => file.zip !== "AppxBlockMap.xml" && file.zip !== "[Content_Types].xml");
  const blockMap = blockMapXml(payload);
  const types = contentTypesXml(prepared.map((file) => file.zip).concat(["AppxBlockMap.xml", "[Content_Types].xml"]));

  const all = prepared.concat([
    {
      zip: "AppxBlockMap.xml",
      data: blockMap,
      nameBuf: Buffer.from("AppxBlockMap.xml", "utf8"),
      crc: zlib.crc32(blockMap) >>> 0,
      lfhSize: 30 + "AppxBlockMap.xml".length
    },
    {
      zip: "[Content_Types].xml",
      data: types,
      nameBuf: Buffer.from("[Content_Types].xml", "utf8"),
      crc: zlib.crc32(types) >>> 0,
      lfhSize: 30 + "[Content_Types].xml".length
    }
  ]);

  const chunks = [];
  const centrals = [];
  let offset = 0;
  for (const file of all) {
    const local = localHeader(file.nameBuf, file.data, file.crc, stamp);
    chunks.push(local, file.data);
    centrals.push(centralHeader(file.nameBuf, file.data, file.crc, stamp, offset));
    offset += local.length + file.data.length;
  }
  const central = Buffer.concat(centrals);
  chunks.push(central, endOfCentral(all.length, central.length, offset));
  fs.writeFileSync(outPath, Buffer.concat(chunks));
}

async function tryMakeAppx(manifestFile, payload) {
  const makeappx = findMakeAppx();
  if (!makeappx) {
    return false;
  }
  if (process.platform === "win32") {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pwq-appx-"));
    const mappingFile = path.join(tmp, "mapping.txt");
    const lines = ["[Files]"];
    for (const file of payload) {
      lines.push(`"${file.abs}" "${file.zip}"`);
    }
    fs.writeFileSync(mappingFile, lines.join("\r\n"));
    execFileSync(makeappx, ["pack", "/o", "/f", mappingFile, "/p", artifactPath], {
      stdio: "inherit",
      timeout: 15 * 60 * 1000
    });
    return true;
  }

  try {
    const { getWineToolset } = require("app-builder-lib/out/toolsets/wine");
    const toolset = await getWineToolset("1.0.1");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pwq-appx-"));
    const mappingFile = path.join(tmp, "mapping.txt");
    const lines = ["[Files]"];
    for (const file of payload) {
      lines.push(`"${toWinePath(file.abs)}" "${file.zip}"`);
    }
    fs.writeFileSync(mappingFile, lines.join("\r\n"));
    execFileSync(toolset.execPath, [
      makeappx,
      "pack",
      "/o",
      "/f",
      toWinePath(mappingFile),
      "/p",
      toWinePath(artifactPath)
    ], {
      stdio: "inherit",
      timeout: 3 * 60 * 1000,
      env: { ...process.env, ...toolset.env }
    });
    return true;
  } catch (err) {
    console.warn("[appx] Wine/makeappx failed; packing APPX in-process.");
    console.warn(`[appx] ${err instanceof Error ? err.message.split("\n")[0] : err}`);
    return false;
  }
}

async function main() {
  if (!fs.existsSync(path.join(appOutDir, "Petko.exe"))) {
    throw new Error("Missing dist/win-unpacked/Petko.exe — run npm run win:dir first.");
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pwq-appx-"));
  const manifestFile = path.join(tmp, "AppxManifest.xml");
  writeManifest(manifestFile);
  const payload = collectPayload(manifestFile);

  console.log(`[appx] publisher=${publisher} identityName=${identityName} version=${windowsVersion}`);
  if (publisher === "CN=ms") {
    console.log(
      "[appx] Using electron-builder test publisher CN=ms. Set APPX_PUBLISHER='CN=...' from Partner Center before Store upload."
    );
  }

  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  if (fs.existsSync(artifactPath)) {
    fs.unlinkSync(artifactPath);
  }

  const packedWithMakeappx = await tryMakeAppx(manifestFile, payload);
  if (!packedWithMakeappx) {
    writeAppxZip(artifactPath, payload);
  }

  const st = fs.statSync(artifactPath);
  console.log(`Wrote dist/${artifactName} (${Math.round(st.size / 1024 / 1024)} MB)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
