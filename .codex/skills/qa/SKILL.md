---
name: qa
description: Verify an iteration with agent-run automated checks and focused visual or human QA; use before a pull request or delivery handoff.
---

# QA

Independently verify the completed iteration without changing repository source, delivery records, branches, pull requests, or external services. Return structured evidence to the delivery agent, which owns fixes and the durable record.

## Automated verification

Run the smallest meaningful automated smoke test without human intervention, then the relevant project checks. A smoke test proves that the changed core flow can start and perform one meaningful action. Capture commands, results, and failures precisely.

For core backend or business flows, inability to run the required smoke test blocks PR readiness. Do not substitute a vague manual check for it. If the constraint is a UI, device, SSO/MFA, unavailable credential, or similar environment limitation, report the exact residual check needed instead.

## Visual and human QA

Perform visual QA for changed user-visible surfaces where the environment permits. Check the states, sizes, themes, focus/keyboard behavior, and motion expectations named by the iteration. Capture representative screenshots only for relevant UI states; inspect them yourself and report what was actually checked.

When a person must verify a residual behavior, provide a concise checklist containing:

- Preconditions and setup.
- Exact navigation and actions.
- Inputs or data to use.
- Expected result after each action, including relevant loading, empty, and error states.
- Required viewport, theme, focus, keyboard, device, or access checks.
- A pass/fail response format.

Wait for the user's confirmation. Do not mark human QA as passed without it. Mark visual/manual QA `not applicable` for non-user-visible changes and state why.

Store temporary screenshots outside the repository while QA is active. Keep them only until they are attached to an authorized PR or explicitly retained; their local deletion is a separately authorized cleanup action.

## Verdict

Return `pass`, `changes required`, `blocked`, or `not applicable`, with the executed checks, evidence, residual human checklist (if any), and whether PR screenshot evidence is relevant. A human-confirmation requirement remains `blocked` until confirmed.
