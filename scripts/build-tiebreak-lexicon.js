#!/usr/bin/env node
/**
 * Build tiebreak-lexicon.json for Petko challenge word duel.
 *
 * Source (default): https://github.com/turanjanin/spisak-srpskih-reci
 *   serbian-words.txt — Cyrillic list (see repo LICENSE.md).
 * Fallback: pass --dic=path/to/sr.dic (Hunspell/LibreOffice; strips /flags).
 *
 * Output: tiebreak-lexicon.json (+ optional .gz if > ~2MB uncompressed JSON).
 * Words: lowercase Serbian Cyrillic only, length MIN..MAX inclusive (default 2–12).
 * Does NOT touch public.words (5-letter game).
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const zlib = require("zlib");
const { pipeline } = require("stream/promises");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_URL =
  "https://raw.githubusercontent.com/turanjanin/spisak-srpskih-reci/master/serbian-words.txt";

const MIN_LEN = 2;
const MAX_LEN = 12;
const CYRILLIC = /^[абвгдђежзијклљмнњопрстћуфхцчџш]+$/u;
const DIGRAPH_LATIN = [
  ["dž", "џ"],
  ["dj", "ђ"],
  ["lj", "љ"],
  ["nj", "њ"]
];
const LATIN_MAP = {
  a: "а", b: "б", c: "ц", č: "ч", ć: "ћ", d: "д", đ: "ђ", e: "е", f: "ф", g: "г", h: "х",
  i: "и", j: "ј", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", r: "р", s: "с", š: "ш",
  t: "т", u: "у", v: "в", z: "з", ž: "ж"
};

function parseArgs(argv) {
  const out = { url: DEFAULT_URL, local: "", dic: "", outDir: ROOT };
  argv.forEach((arg) => {
    if (arg.startsWith("--url=")) out.url = arg.slice(6);
    else if (arg.startsWith("--local=")) out.local = arg.slice(8);
    else if (arg.startsWith("--dic=")) out.dic = arg.slice(6);
    else if (arg.startsWith("--out=")) out.outDir = path.resolve(arg.slice(6));
    else if (arg.startsWith("--min=")) out.min = Number(arg.slice(6));
    else if (arg.startsWith("--max=")) out.max = Number(arg.slice(6));
  });
  out.min = Number.isFinite(out.min) ? out.min : MIN_LEN;
  out.max = Number.isFinite(out.max) ? out.max : MAX_LEN;
  return out;
}

function normalizeLine(raw) {
  let text = String(raw || "").trim().toLowerCase();
  if (!text) return "";
  if (text.includes("/")) text = text.split("/")[0];
  for (const [from, to] of DIGRAPH_LATIN) text = text.replaceAll(from, to);
  text = text.replace(/[a-zčćšđž]/g, (ch) => LATIN_MAP[ch] || "");
  text = text.replace(/[^абвгдђежзијклљмнњопрстћуфхцчџш]/g, "");
  return text;
}

function acceptWord(word, minLen, maxLen) {
  if (!word || word.length < minLen || word.length > maxLen) return false;
  if (/^\d+$/.test(word)) return false;
  return CYRILLIC.test(word);
}

async function downloadToFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

async function processLines(inputPath, minLen, maxLen, onWord) {
  const stream = fs.createReadStream(inputPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const word = normalizeLine(line);
    if (acceptWord(word, minLen, maxLen)) onWord(word);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tmpDir = path.join(args.outDir, ".tmp-tiebreak-lexicon");
  fs.mkdirSync(tmpDir, { recursive: true });

  let sourcePath = args.local ? path.resolve(args.local) : "";
  if (!sourcePath && args.dic) {
    sourcePath = path.resolve(args.dic);
  }
  if (!sourcePath) {
    sourcePath = path.join(tmpDir, "serbian-words.txt");
    if (!fs.existsSync(sourcePath)) {
      console.log("Downloading Cyrillic word list…");
      await downloadToFile(args.url, sourcePath);
    }
  }

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source not found: ${sourcePath}`);
  }

  const set = new Set();
  const lengthCounts = Array.from({ length: args.max + 1 }, () => 0);

  await processLines(sourcePath, args.min, args.max, (word) => {
    if (set.has(word)) return;
    set.add(word);
    lengthCounts[word.length] += 1;
  });

  const words = [...set].sort((a, b) => a.localeCompare(b, "sr"));
  const jsonPath = path.join(args.outDir, "tiebreak-lexicon.json");
  const jsonBody = JSON.stringify(words);
  fs.writeFileSync(jsonPath, jsonBody, "utf8");

  const bytes = Buffer.byteLength(jsonBody, "utf8");
  const mb = (bytes / (1024 * 1024)).toFixed(2);
  let gzPath = "";
  if (bytes > 2 * 1024 * 1024) {
    gzPath = `${jsonPath}.gz`;
    await pipeline(
      fs.createReadStream(jsonPath),
      zlib.createGzip({ level: 9 }),
      fs.createWriteStream(gzPath)
    );
  }

  const sqlNote = path.join(args.outDir, "sql", "2026-09-23-tiebreak-lexicon.sql");
  fs.mkdirSync(path.dirname(sqlNote), { recursive: true });
  const sqlLines = [
    "-- Petko tiebreak lexicon: client-side JSON only (tiebreak-lexicon.json).",
    "-- Do NOT bulk-insert into public.words — that would break the 5-letter game.",
    `-- Generated: ${new Date().toISOString()}`,
    `-- Word count: ${words.length}, JSON size: ~${mb} MB`,
    "-- Optional (only if count < ~200k):",
    "-- CREATE TABLE IF NOT EXISTS public.tiebreak_lexicon (word text PRIMARY KEY);",
    "-- \\copy public.tiebreak_lexicon(word) FROM 'tiebreak-lexicon.json' WITH (FORMAT text);",
    ""
  ];
  fs.writeFileSync(sqlNote, sqlLines.join("\n"), "utf8");

  console.log(JSON.stringify({
    total: words.length,
    minLen: args.min,
    maxLen: args.max,
    jsonBytes: bytes,
    jsonMB: Number(mb),
    gzip: gzPath ? path.basename(gzPath) : null,
    lengthCounts: Object.fromEntries(
      lengthCounts.map((n, len) => (len >= args.min && len <= args.max && n ? [String(len), n] : null)).filter(Boolean)
    )
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
