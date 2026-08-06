---
title: Change Detection
summary: Comparing SHA-256 digests of every source against the digests recorded by the previous run to classify each file as new, changed, or deleted
sources:
  - incremental-builds.md
kind: concept
createdAt: "2026-07-14T09:22:20.007Z"
updatedAt: "2026-07-30T13:55:41.220Z"
tags:
  - incremental
  - core
aliases:
  - change-detection
  - CD
confidence: 0.94
provenanceState: derived
modelId: claude-sonnet-4-6
promptVersion: v1
---

# Change Detection

**Change detection** is the second stage of the [[Compilation Pipeline]] and the one that makes [[Incremental Compilation]] possible: every source is hashed with SHA-256 after a successful run, and the digest is recorded in the project state file alongside the concepts that source produced. ^[incremental-builds.md:16-19]

## Three outcomes

A file with no recorded hash is **new**. A file whose hash differs from the record has **changed**. A file that is recorded but no longer on disk has been **deleted**, and the pages it owned are now unsupported. ^[incremental-builds.md:21-23]

## Why not timestamps

Timestamps were the obvious alternative and were rejected: checkouts, syncs, and format-on-save all move a modification time without changing a single byte, which would make the pipeline re-bill the entire corpus after a fresh clone. ^[incremental-builds.md:25-27]

## What it feeds

The classification decides which sources reach concept extraction — the expensive stage — and it is the same digest comparison that [[Page Freshness]] later replays to decide whether an already-compiled page still matches its sources. ^[incremental-builds.md:31-33]

## Sources

incremental-builds.md
