/**
 * @file examples/profile-newsroom/seed.mjs
 * @description Generates this example's working state — the installed
 * `newsroom` profile, the typed wiki, the relation graph, and five workflow
 * runs — so a profile-driven project has real typed data on every surface. Run
 * it once after cloning; run it again whenever you like.
 *
 * WHY a script rather than committed files: `.gitignore` ignores `.llmwiki/`
 * everywhere in this repo, so the example cannot ship its profile, its template
 * lock, its run records, or its lint cache as tracked content. And `wiki/` is
 * generated rather than committed because `llmwiki template init` refuses to
 * install a profile over a non-empty typed corpus — so the pages live in
 * `content/` and are materialized after the install. The example ships the
 * recipe, not the output.
 *
 * WHY no LLM: nothing here is generated prose. The profile comes from a builtin
 * template, the pages are committed under `content/`, the filings and run plans
 * are written down in `seed-data.mjs`, and `llmwiki lint` is a pure static pass.
 * Nobody needs an API key or a network to see a populated profile project.
 *
 * WHY it reuses llmwiki's own writers: the profile install goes through the real
 * `llmwiki template init` command; runs go through `startWorkflow`/`advance`/
 * `submit`/`approveGate`/`cancel`; relations go through `appendRelation`; state
 * goes through `writeState`; the lint cache is written by a real `llmwiki lint`.
 * Every one of those formats belongs to the compiler, and a run record is
 * HMAC-signed over its own bytes, so hand-rolled JSON would be unreadable at
 * worst and silently rotting at best.
 *
 * Idempotent: the profile install is skipped when `newsroom` is already active,
 * the content copy overwrites with identical bytes, `appendRelation` dedups on
 * content hash, each run is pinned to a fixed id and skipped whole when that id
 * already exists, and state/lint are single overwritten files. Every write lands
 * inside this directory.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { materializeWiki, resetWiki } from "./seed-content.mjs";
import { COMPILED_AT, RUN_PLANS, SOURCE_CONCEPTS, STANDING_FILINGS } from "./seed-data.mjs";
import { seedRuns } from "./seed-runs.mjs";

const SELF = fileURLToPath(import.meta.url);
const EXAMPLE_DIR = path.dirname(SELF);
const REPO_ROOT = path.resolve(EXAMPLE_DIR, "..", "..");
const EXPECTED_PACKAGE_NAME = "llm-wiki-compiler";
const TEMPLATE_ID = "newsroom";

/**
 * Node flags this script re-execs itself with.
 *
 * Node 24 STRIPS TypeScript types but does not TRANSFORM them, and llmwiki's
 * sources use constructor parameter properties (`constructor(readonly x: T)`),
 * which have no strip-only form — importing `src/workflows/start.ts` without the
 * transform is a hard `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. The warning is
 * disabled because it is about the flag, not about this project, and an example
 * that greets you with an experimental-feature warning reads like a fault.
 */
const TRANSFORM_FLAGS = ["--experimental-transform-types", "--disable-warning=ExperimentalWarning"];

/**
 * Re-exec this script once with {@link TRANSFORM_FLAGS} when they are absent, so
 * `node seed.mjs` works without the reader having to remember them. Returns
 * `true` when it re-exec'd (the caller must then do nothing else).
 */
async function reExecWithTransform() {
  if (TRANSFORM_FLAGS.every((flag) => process.execArgv.includes(flag))) return false;
  const child = spawn(process.execPath, [...TRANSFORM_FLAGS, SELF, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
  process.exitCode = await new Promise((resolve) => child.on("exit", (code) => resolve(code ?? 1)));
  return true;
}

/** Paths that must exist for this to be the example we think it is. */
const REQUIRED_EXAMPLE_PATHS = [
  "sources",
  "content/index.md",
  "content/concepts",
  "content/articles",
  "content/desks",
  "content/bylines",
];

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
  if (missing) throw new Error(`missing ${missing} — seed.mjs must live in examples/profile-newsroom/`);
  const name = await repoPackageName();
  if (name !== EXPECTED_PACKAGE_NAME) {
    throw new Error(`${REPO_ROOT} is not the ${EXPECTED_PACKAGE_NAME} repo (found: ${name ?? "no package.json"})`);
  }
}

/** Load llmwiki's own writers from source, via the `.js`→`.ts` resolve hook. */
async function loadWriters() {
  register("./ts-loader.mjs", import.meta.url);
  const [profile, state, hasher, relations, start, advance, submit, gate, cancel, store] =
    await Promise.all([
      import(`${REPO_ROOT}/src/profile/load.ts`),
      import(`${REPO_ROOT}/src/utils/state.ts`),
      import(`${REPO_ROOT}/src/compiler/hasher.ts`),
      import(`${REPO_ROOT}/src/relations/store.ts`),
      import(`${REPO_ROOT}/src/workflows/start.ts`),
      import(`${REPO_ROOT}/src/workflows/advance.ts`),
      import(`${REPO_ROOT}/src/workflows/stage-output.ts`),
      import(`${REPO_ROOT}/src/workflows/gate.ts`),
      import(`${REPO_ROOT}/src/workflows/cancel.ts`),
      import(`${REPO_ROOT}/src/workflows/store.ts`),
    ]);
  return {
    loadProfile: profile.loadProfile,
    writeState: state.writeState,
    hashFile: hasher.hashFile,
    appendRelation: relations.appendRelation,
    startWorkflow: start.startWorkflow,
    advanceWorkflow: advance.advanceWorkflow,
    submitStageOutput: submit.submitStageOutput,
    approveGate: gate.approveGate,
    cancelWorkflow: cancel.cancelWorkflow,
    runExists: store.runExists,
  };
}

/** Spawn the built CLI in this example directory, resolving on `code <= maxCode`. */
function runCli(args, maxCode = 0) {
  const cli = path.join(REPO_ROOT, "dist", "cli.js");
  if (!existsSync(cli)) {
    throw new Error(`${cli} not found — run \`npm run build\` in the repo root first`);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: EXAMPLE_DIR,
      stdio: ["ignore", "ignore", "inherit"],
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code !== null && code <= maxCode ? resolve() : reject(new Error(`llmwiki ${args.join(" ")} exited ${code}`)),
    );
  });
}

/**
 * Install the `newsroom` profile through the REAL `llmwiki template init`, which
 * is offline and needs no key.
 *
 * Skipped when `newsroom` is already active — `template init` will not overwrite
 * a profile, and rightly so. On the from-scratch path the generated `wiki/` tree
 * is cleared FIRST, because the install refuses a non-empty typed corpus and
 * that corpus is entirely regenerated later in this same run. A DIFFERENT
 * profile on disk is reported rather than forced: swapping a profile under live
 * typed pages is a migration, not a re-seed.
 */
async function installProfile(loadProfile) {
  const loaded = await loadProfile(EXAMPLE_DIR);
  if (loaded.profile.profileId === TEMPLATE_ID) return "already installed";
  if (loaded.loadedFrom !== null) {
    throw new Error(
      `.llmwiki/profile.json already holds the ${JSON.stringify(loaded.profile.profileId)} profile; ` +
        `delete .llmwiki/ to re-seed this example`,
    );
  }
  await resetWiki(EXAMPLE_DIR);
  await runCli(["template", "init", TEMPLATE_ID]);
  return "installed";
}

/**
 * Write `.llmwiki/state.json` through the compiler's own writer, recording the
 * two sources and the concept pages each produced. Real digests throughout, so
 * every concept page resolves to `fresh`.
 */
async function seedState({ writeState, hashFile }) {
  const sources = {};
  for (const [file, concepts] of Object.entries(SOURCE_CONCEPTS)) {
    const hash = await hashFile(path.join(EXAMPLE_DIR, "sources", file));
    sources[file] = { hash, concepts, compiledAt: COMPILED_AT[file] };
  }
  await writeState(EXAMPLE_DIR, { version: 1, indexHash: "", sources });
  return Object.keys(sources).length;
}

/**
 * Append the standing filings through the relation store's own writer. Each
 * append validates the endpoints against the profile's `filed-under` def first,
 * so a filing naming something that is not an article or a desk fails loudly
 * here rather than becoming a dangling edge later.
 */
async function seedFilings({ appendRelation, loadProfile }) {
  const { profile } = await loadProfile(EXAMPLE_DIR);
  for (const filing of STANDING_FILINGS) await appendRelation(EXAMPLE_DIR, profile, filing);
  return STANDING_FILINGS.length;
}

/**
 * Run the real `llmwiki lint` so `.llmwiki/last-lint.json` is written by the
 * command that owns its format. Exit code 1 is the SUCCESS case: this example
 * deliberately contains two profile-identity errors, and `lint` exits non-zero
 * when it finds any. Only a code above 1 means the run itself went wrong.
 */
function runLint() {
  return runCli(["lint"], 1);
}

async function main() {
  if (await reExecWithTransform()) return;
  await assertLayout();
  const writers = await loadWriters();
  const profileState = await installProfile(writers.loadProfile);
  const pageCount = await materializeWiki(EXAMPLE_DIR);
  const sourceCount = await seedState(writers);
  const filingCount = await seedFilings(writers);
  const runs = await seedRuns(EXAMPLE_DIR, RUN_PLANS, writers);
  await runLint();
  process.stdout.write(
    `Seeded examples/profile-newsroom — newsroom profile ${profileState}, ` +
      `${pageCount} pages materialized into wiki/, ${sourceCount} source entries in state.json, ` +
      `${filingCount} standing filings, ${runs.created} workflow run(s) created ` +
      `(${runs.skipped} already present), lint cache written.\n` +
      `Now run:  cd ${path.relative(process.cwd(), EXAMPLE_DIR) || "."} && llmwiki view --open\n`,
  );
}

await main();
