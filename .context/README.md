# Agent context

Machine-oriented feature specs for AI agents. Prefer these over scanning the whole repo when implementing or changing a feature.

## Conventions

- Specs live at `.context/features/<feature>/spec.yaml`
- Human-readable docs live under `docs/<feature>/` and are linked from each spec via `related_docs`
- When design changes, update **both** the YAML spec and the matching docs in the same change
- Load order for bump work: `spec.yaml` → linked docs → code under `apps/` and `packages/shared`

## Features

| Feature | Spec |
| --- | --- |
| Bump | [features/bump/spec.yaml](features/bump/spec.yaml) |
