/**
 * Prepare Windows Authenticode env for electron-builder, then run it.
 *
 * Signs when CSC_LINK / WIN_CSC_LINK is set, or when the gitignored local
 * file certs/windows-code-signing.pfx exists. Password: CSC_KEY_PASSWORD
 * (or WIN_CSC_KEY_PASSWORD). Never commit the .pfx or the password.
 *
 * Without a certificate, the NSIS installer is still built unsigned.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const localPfx = path.join(root, "certs", "windows-code-signing.pfx");

function envTrim(name) {
  const value = process.env[name];
  if (value == null) {
    return "";
  }
  return String(value).trim();
}

function hasLink() {
  return !!(envTrim("WIN_CSC_LINK") || envTrim("CSC_LINK"));
}

function hasPassword() {
  return !!(envTrim("WIN_CSC_KEY_PASSWORD") || envTrim("CSC_KEY_PASSWORD"));
}

if (!hasLink() && fs.existsSync(localPfx)) {
  process.env.CSC_LINK = localPfx;
}

if (process.env.CSC_IDENTITY_AUTO_DISCOVERY == null || process.env.CSC_IDENTITY_AUTO_DISCOVERY === "") {
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
}

const link = envTrim("WIN_CSC_LINK") || envTrim("CSC_LINK");
if (link) {
  let label = link;
  if (/^(https?:|data:)/i.test(link)) {
    label = link.startsWith("data:") ? "base64 CSC_LINK" : link;
  } else {
    const filePath = link.startsWith("file://") ? link.slice("file://".length) : link;
    label = path.basename(filePath);
  }
  console.log(`[win-sign] Authenticode: signing with ${label}`);
  if (!hasPassword()) {
    console.warn(
      "[win-sign] CSC_KEY_PASSWORD / WIN_CSC_KEY_PASSWORD is unset; electron-builder will try an empty password."
    );
  }
} else {
  console.log(
    "[win-sign] No .pfx (set CSC_LINK or place certs/windows-code-signing.pfx); building unsigned. SmartScreen will warn until you use an OV/EV Authenticode certificate."
  );
}

const cli = require.resolve("electron-builder/cli.js");
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code == null ? 1 : code);
});
