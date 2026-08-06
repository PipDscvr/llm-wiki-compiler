---
title: Sam Oyelaran
slug: samuel-oyelaran
reporter: Sam Oyelaran
stage: confirmed
---

# Sam Oyelaran

**This page is a deliberate fixture.** Its frontmatter declares
`slug: samuel-oyelaran` while the file on disk is `sam-oyelaran.md`, so the
collector reports a `slug-mismatch` against the `bylines` type and does not
produce the page.

The two are not reconciled and neither wins. A page can be reached by exactly
one identity, and when a page asserts a different one from the one it has, there
is no safe guess: honouring the frontmatter would let a page shadow a file that
is not there, and honouring the stem would silently discard a declaration
somebody wrote on purpose.

The realistic version of this is a rename. The reporter shortened their byline,
the file was renamed to match, and the frontmatter still carries the old slug.
