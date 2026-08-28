---
name: iteration-delivery
description: Deliver an approved Taffy iteration through implementation, simplification, independent review, QA, and an explicitly authorized handoff.
---

# Iteration Delivery

Use this workflow for an approved iteration or feature. Keep a concise delivery record beside its brief (or follow an established project convention) with the iteration outcome, current phase, evidence, blockers, external authorizations, and exact next safe action.

Show these phases in the task plan when available: ground the iteration; isolate work if authorized; implement; smoke test; simplify when triggered; verify; independent AI review; remediate and re-verify; QA; external delivery if authorized; handoff; cleanup if authorized. Keep exactly one phase in progress.

## Ground and implement

Before modifying code, read the brief and relevant project guidance. Identify acceptance checks, public seams, visual states, test boundaries, deferrals, and whether staging/preview verification is necessary. Implement the thin, complete approved increment only. Isolation, dependency installation, branch/worktree changes, and all external actions require current-task authorization.

## Smoke test and simplify

Run an automated, agent-operated smoke test after implementation. A missing runnable smoke test blocks core-flow PR readiness; environment-limited UI/device/access checks are handled by QA with explicit human confirmation.

Perform a behavior-preserving simplify pass when the iteration changes a public interface, adds a module, crosses layers, includes a non-trivial refactor, exceeds 200 changed lines excluding generated files and lockfiles, or contains avoidable complexity. Simplification must not broaden the iteration into a redesign. Run affected tests after it.

## Verify, review, and QA

Run the relevant automated checks, migrations, and repository coverage. Then use `$code-review` through a fresh, independent, read-only review agent. Provide it the brief, acceptance checks, relevant project guidance, and final diff. The implementation agent validates confirmed findings, makes in-scope fixes, and re-runs affected checks. A confirmed critical/high finding blocks delivery; a medium finding needs an explicit documented decision.

After the final verification, use `$qa` through a fresh, read-only QA agent. It runs automated checks and performs visual QA where possible. Human visual/manual QA is required only for user-visible, device-specific, or access-dependent changes; otherwise record it as not applicable. Staging/preview QA is required only when the iteration needs production-like integrations, deployment configuration, or cross-device coverage, and needs separate authorization.

## Deliver and clean up

The delivery agent records all gate verdicts as `pass`, `changes required`, `blocked`, or `not applicable`, with compact evidence. Once every required gate passes, provide a ready-to-submit summary and wait for explicit authorization to create or update a PR.

For relevant UI changes, attach representative QA screenshots to the authorized PR along with a standard quality-gate summary: automated checks, review verdict, QA verdict, and explicit exceptions. Do not create the PR, upload evidence, push, or change CI without current authorization. Delete local QA screenshots only during separately authorized cleanup.
