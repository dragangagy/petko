import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "www");
const excluded = new Set([".git", "android", "ios", "node_modules", "resources", "scripts", "sql", "www"]);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of await readdir(root)) {
  if (excluded.has(entry)) continue;
  await cp(resolve(root, entry), resolve(output, entry), { recursive: true });
}
