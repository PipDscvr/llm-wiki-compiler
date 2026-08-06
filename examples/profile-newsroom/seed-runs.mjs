/**
 * @file examples/profile-newsroom/seed-runs.mjs
 * @description Drives each plan in `RUN_PLANS` through llmwiki's REAL workflow
 * lifecycle operations until the run sits in the state that plan describes.
 *
 * WHY a driver rather than written-out run files: a `WorkflowRun` record carries
 * an integrity HMAC over its own bytes, keyed per project, so a hand-written run
 * file is not merely brittle — it is unreadable. The only way to produce a valid
 * run is to perform the operations that produce one, which is also the only way
 * the example stays honest about how a run reaches `awaitingGate`.
 *
 * IDEMPOTENCE: every plan pins a fixed `runId`, so a run that already exists is
 * SKIPPED WHOLE rather than replayed. That is deliberate on both counts — the
 * lifecycle ops are not individually idempotent (a second `advance` on a
 * completed run throws), and a reader who has approved a gate by hand should not
 * find their work reverted by re-running the seed.
 */

/** The workflow every plan runs; the sole workflow the newsroom profile declares. */
const WORKFLOW_ID = "story-pipeline";

/**
 * Apply one plan step against an existing run. One entry per `do` value in
 * `RUN_PLANS`, each a thin call into the operation that owns that transition —
 * no step reimplements any part of the lifecycle.
 */
const STEP_HANDLERS = {
  advance: (root, runId, _step, ops) => ops.advanceWorkflow(root, runId),
  cancel: (root, runId, _step, ops) => ops.cancelWorkflow(root, runId),
  "approve-gate": (root, runId, step, ops) =>
    ops.approveGate(root, runId, step.gate, { actorKind: "agent", actorLabel: step.actorLabel }),
  "submit-page": (root, runId, step, ops) =>
    ops.submitStageOutput(root, runId, {
      kind: "page",
      entityType: step.entityType,
      slug: step.slug,
      body: step.body,
    }),
  "submit-relation": (root, runId, step, ops) =>
    ops.submitStageOutput(root, runId, {
      kind: "relation",
      input: { type: step.type, from: step.from, to: step.to },
    }),
};

/**
 * Refuse a stage output that did NOT land live. The typed page path is
 * create-only, so a page whose file already exists is a COLLISION: the write is
 * parked for review, `outputs[stage]` stays empty, and the run silently fails to
 * reach the state its plan describes. Surfacing that here turns a confusing
 * "wrong parked state" into a named cause.
 */
function assertApplied(runId, step, result) {
  if (result?.applied !== false) return;
  throw new Error(
    `run ${runId}: ${step.do} was not applied (decision: ${result.decision}). ` +
      `A page write is create-only — if the target page is already on disk, ` +
      `delete it (or its committed copy) and re-run.`,
  );
}

/** Run every step of one plan in order against an already-started run. */
async function applySteps(root, plan, ops) {
  for (const step of plan.steps) {
    const handler = STEP_HANDLERS[step.do];
    if (handler === undefined) throw new Error(`unknown seed step ${JSON.stringify(step.do)}`);
    assertApplied(plan.runId, step, await handler(root, plan.runId, step, ops));
  }
}

/**
 * Start one plan's run at its PINNED id, then drive its steps.
 *
 * `startWorkflow` mints ids through an injectable seam, so passing a constant
 * makes the run file's name — and therefore the seed's idempotence check —
 * deterministic. The seam re-mints only on collision, and the caller has already
 * established this id is free.
 */
async function seedOneRun(root, plan, ops) {
  await ops.startWorkflow(root, WORKFLOW_ID, plan.inputs, () => plan.runId);
  await applySteps(root, plan, ops);
}

/**
 * Seed every plan that is not already on disk, skipping the rest.
 *
 * @param root - Absolute path to this example directory.
 * @param plans - The run plans (from `seed-data.mjs`).
 * @param ops - llmwiki's own workflow operations, imported from source.
 * @returns Counts of the runs created and the runs left alone.
 */
export async function seedRuns(root, plans, ops) {
  let created = 0;
  let skipped = 0;
  for (const plan of plans) {
    if (await ops.runExists(root, plan.runId)) {
      skipped += 1;
      continue;
    }
    await seedOneRun(root, plan, ops);
    created += 1;
  }
  return { created, skipped };
}
