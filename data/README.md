# data/ — official versioned data (schemaVersion 2.0.0)

**Everything in this folder in this repository is FICTITIOUS sample data.** Every name and
description starts with `EJEMPLO-FICTICIO`; the `guard:artifacts` check fails the build if that
marker ever appears in a public artifact.

The files were produced by migrating the Step 01 sample (kept in `tests/fixtures/v1/`) from
1.0.0 to 2.0.0 (`npm run data:migrate`), then extended with fictitious USD, card, pending and
cancelled examples.

Real personal financial data must never be committed until the encryption decisions OD-1,
OD-2 and OD-3 are closed (docs/decisions/open-decisions.md), and is never published in plaintext.

Layout and rules: docs/architecture/json-data-architecture.md and domain-models.md.

    npm run data:validate          validate all four layers
    npm run data:checksums         recompute meta.json after a deliberate edit
    npm run data:changeset -- f    check an exported changeset before integrating it by hand
