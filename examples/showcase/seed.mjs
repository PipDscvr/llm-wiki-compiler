/**
 * @file examples/showcase/seed.mjs
 * @description Generates this example's `.llmwiki/` working state so the viewer
 * has real data on every surface. Run it once after cloning; run it again
 * whenever you like.
 *
 * WHY a script rather than committed files: `.gitignore` ignores `.llmwiki/`
 * everywhere in this repo, so the example cannot ship its state file, review
 * queue, or lint cache as tracked content. It ships the recipe instead.
 *
 * WHY no LLM: every artifact here is either mechanical (hashes, ownership) or
 * already written down (the candidate bodies in `seed-data.mjs`). Nothing needs
 * a model, so nobody needs an API key to see the viewer populated.
 *
 * WHY it reuses llmwiki's own writers: `state.json`, the candidate records, and
 * `.llmwiki/last-lint.json` all have formats owned by the compiler. Hand-rolled
 * JSON would drift the first time one of them changes and nobody would notice.
 * So state and candidates go through `writeState` / `writeCandidate` (imported
 * from source via `ts-loader.mjs`), and the lint cache is produced by genuinely
 * running `llmwiki lint`, which needs no model.
 *
 * Idempotent: state is overwritten from fixed inputs, `writeCandidate` dedups on
 * target identity so re-running cannot pile up duplicates, and the lint cache is
 * a single overwritten file. Every write lands inside this directory.
 */

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPILED_AT,
  DELETED_SOURCE,
  EDITED_SOURCE,
  FRESH_SOURCE_CONCEPTS,
} from "./seed-data.mjs";
import { CANDIDATE_DRAFTS } from "./seed-candidates.mjs";

const EXAMPLE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(EXAMPLE_DIR, "..", "..");
const EXPECTED_PACKAGE_NAME = "llm-wiki-compiler";

/** Paths that must exist for this to be the example we think it is. */
const REQUIRED_EXAMPLE_PATHS = ["sources", "wiki/concepts", "wiki/queries", "wiki/index.md"];

/** The first required path that is absent, or `undefined` when all are present. */
function missingExamplePath() {
  return REQUIRED_EXAMPLE_PATHS.find((relative) => !existsSync(path.join(EXAMPLE_DIR, relative)));
}

/** The package name two directories up, or null when there is no manifest there. */
async function repoPackageName() {
  const manifest = path.join(REPO_ROOT, "package.json");
  if (!existsSync(manifest)) return null;
  return JSON.parse(await readFile(manifest, "utf-8")).name;
}

/**
 * Refuse to run unless both roots look right. The script derives every path
 * from its own location rather than the working directory, so a wrong `cd`
 * cannot misdirect a write — but a copied-out script with no repo above it
 * would fail deep inside an import, so it is rejected here with a clear reason.
 */
async function assertLayout() {
  const missing = missingExamplePath();
  if (missing) throw new Error(`missing ${missing} — seed.mjs must live in examples/showcase/`);
  const name = await repoPackageName();
  if (name !== EXPECTED_PACKAGE_NAME) {
    throw new Error(`${REPO_ROOT} is not the ${EXPECTED_PACKAGE_NAME} repo (found: ${name ?? "no package.json"})`);
  }
}

/** Load llmwiki's own writers from source, via the `.js`→`.ts` resolve hook. */
async function loadWriters() {
  register("./ts-loader.mjs", import.meta.url);
  const [{ writeState }, { writeCandidate }, { hashFile }] = await Promise.all([
    import(`${REPO_ROOT}/src/utils/state.ts`),
    import(`${REPO_ROOT}/src/compiler/candidates.ts`),
    import(`${REPO_ROOT}/src/compiler/hasher.ts`),
  ]);
  return { writeState, writeCandidate, hashFile };
}

/**
 * A digest that is deterministic but provably not the file's own content hash.
 * Recording one of these is how a source is marked "edited since compile"
 * (or "deleted") without needing a second copy of the file to hash.
 */
function sentinelDigest(sourceFile) {
  return createHash("sha256").update(`${sourceFile}@pre-compile-revision`).digest("hex");
}

/** One `state.sources` entry. */
function sourceEntry(hash, concepts, file) {
  return { hash, concepts, compiledAt: COMPILED_AT[file] };
}

/**
 * Build the whole source-ownership map: real digests for the sources that are
 * still current, sentinels for the one that was edited and the one that was
 * deleted. Freshness falls out of this map — nothing else has to be arranged.
 */
async function buildSources(hashFile) {
  const sources = {};
  for (const [file, concepts] of Object.entries(FRESH_SOURCE_CONCEPTS)) {
    const hash = await hashFile(path.join(EXAMPLE_DIR, "sources", file));
    sources[file] = sourceEntry(hash, concepts, file);
  }
  for (const { file, concepts } of [EDITED_SOURCE, DELETED_SOURCE]) {
    sources[file] = sourceEntry(sentinelDigest(file), concepts, file);
  }
  return sources;
}

/**
 * Write `.llmwiki/state.json` through the compiler's own writer. `version: 1`
 * and an empty `indexHash` are what a default-profile compile leaves behind.
 */
async function seedState({ writeState, hashFile }) {
  const sources = await buildSources(hashFile);
  await writeState(EXAMPLE_DIR, { version: 1, indexHash: "", sources });
  return Object.keys(sources).length;
}

/** Write the pending review queue through the compiler's own candidate writer. */
async function seedCandidates(writeCandidate) {
  await mkdir(path.join(EXAMPLE_DIR, ".llmwiki", "candidates"), { recursive: true });
  for (const draft of CANDIDATE_DRAFTS) {
    await writeCandidate(EXAMPLE_DIR, draft);
  }
  return CANDIDATE_DRAFTS.length;
}

/**
 * Run the real `llmwiki lint` against the example so `.llmwiki/last-lint.json`
 * is written by the command that owns its format.
 *
 * Exit code 1 is the SUCCESS case here: this example deliberately contains lint
 * errors, and `lint` exits non-zero when it finds any. Only a code above 1 (or a
 * failure to spawn) means the run itself went wrong.
 */
function runLint() {
  const cli = path.join(REPO_ROOT, "dist", "cli.js");
  if (!existsSync(cli)) {
    throw new Error(`${cli} not found — run \`npm run build\` in the repo root first`);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "lint"], {
      cwd: EXAMPLE_DIR,
      stdio: ["ignore", "ignore", "inherit"],
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code !== null && code <= 1 ? resolve() : reject(new Error(`llmwiki lint exited ${code}`)),
    );
  });
}

async function main() {
  await assertLayout();
  const writers = await loadWriters();
  const sourceCount = await seedState(writers);
  const candidateCount = await seedCandidates(writers.writeCandidate);
  await runLint();
  process.stdout.write(
    `Seeded examples/showcase/.llmwiki — ${sourceCount} source entries in state.json, ` +
      `${candidateCount} review candidates, lint cache written.\n` +
      `Now run:  cd ${path.relative(process.cwd(), EXAMPLE_DIR) || "."} && llmwiki view --open\n`,
  );
}

await main();
