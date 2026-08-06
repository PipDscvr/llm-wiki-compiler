---
title: OKF Bundles
summary: Portable Open Knowledge Format archives that carry a compiled wiki, its sources, and its provenance between projects
sources:
  - legacy-import-notes.md
kind: concept
createdAt: "2026-07-14T09:22:31.114Z"
updatedAt: "2026-07-16T09:44:02.550Z"
tags:
  - portability
aliases:
  - okf-bundles
  - OB
confidence: 0.66
provenanceState: derived
modelId: claude-sonnet-4-6
promptVersion: v1
---

# OKF Bundles

An **Open Knowledge Format (OKF) bundle** packages a compiled wiki together with the sources it was built from, so a corpus can move between projects without losing its provenance. ^[legacy-import-notes.md:12-18]

## Import lands in review

Importing a bundle never writes straight into `wiki/`. Every document arrives as a [[Review Candidates|review candidate]] carrying the `imported-okf` held reason, so a reviewer sees what a foreign corpus is proposing before it becomes local truth. See [[Held Reasons]]. ^[legacy-import-notes.md:24-31]

## Citations survive the trip

A bundle carries its own source files, so imported pages keep working [[Claim-Level Citations|citations]] rather than degrading into unverifiable prose on arrival. ^[legacy-import-notes.md:40-46]

## Why this page is orphaned

The source this page was compiled from — `legacy-import-notes.md` — has since been removed from `sources/`. Nothing here has been re-derived, so every citation above now dangles and the page's freshness resolves to *orphaned*. That is the intended demonstration: a page whose evidence has been deleted keeps saying what it said, and the health screen is what tells you not to trust it.

## Sources

legacy-import-notes.md
