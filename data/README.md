# data/ — official versioned data

**Everything in this folder in this repository is FICTITIOUS sample data** used to test the
foundation (Step 01). Every name and description starts with `EJEMPLO-FICTICIO`; the
`guard:artifacts` check fails the build if that marker ever appears in a public artifact.

Real personal financial data must never be committed until the encryption decisions OD-1
and OD-2 are closed (docs/decisions/open-decisions.md), and is never published in plaintext.

Layout and rules: docs/architecture/data.md. Validate with `npm run data:validate`.
