// Copies the shared extraction engine (../lib/engine) into the Actor's build context.
// The Apify build only sees this folder, so the engine is vendored at build time, never edited here.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "lib", "engine");
const dest = join(here, "src", "engine");
if (!existsSync(src)) {
  if (existsSync(dest)) {
    console.log("engine source not found; using the already vendored copy in src/engine");
    process.exit(0);
  }
  throw new Error(`Engine not found at ${src}`);
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`engine synced -> ${dest}`);
