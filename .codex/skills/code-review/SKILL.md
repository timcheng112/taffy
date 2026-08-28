---
name: code-review
description: Review a completed local diff independently and read-only before delivery; use for implementation reviews, pull-request readiness, or security and regression checks.
---

# Code Review

Review the final intended diff independently of its implementation. Do not modify repository files, delivery records, branches, pull requests, or external services. Return structured findings to the delivery agent, which owns fixes and records the result.

## Establish the review scope

Read the iteration brief, acceptance checks, relevant project guidance, and the final diff. Review changed files first, then inspect only the surrounding modules, callers, persistence, and public seams needed to validate the changed behavior. Do not turn every review into a whole-repository audit.

Assess correctness, regressions, data integrity, security and privacy, error behavior, accessibility, performance where relevant, test coverage, and adherence to project conventions. Treat tests and prior verification as evidence, not proof.

## Report high-signal findings

For each finding, provide:

- Severity: `critical`, `high`, `medium`, or `low`.
- Exact `path:line` location.
- The violated expectation and a concrete, reachable failure scenario.
- Evidence from the code, tests, or documentation.
- A concise remediation direction when useful.

Do not report speculation as a finding. If the evidence is insufficient, state the uncertainty as a question or omit it. Return `pass` when there are no material findings.

## Verdict

Return one of `pass`, `changes required`, or `blocked`, plus the review scope and checks actually run. Confirmed `critical` and `high` findings block delivery. Medium findings require an explicit delivery decision; low findings may be deferred as follow-up work. Never claim human review occurred.
