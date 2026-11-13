# Automated verification

Aether contains automated test suites in the backend and frontend. This document
describes how to run them and how to retain execution evidence.

## Current test inventory

The repository currently contains:

- 19 backend unit-test files
- 3 backend integration-test files
- 4 frontend test files

These are source test files, not a claim that every test has passed in every
environment.

## Local commands

Run backend tests and build:

```bash
cd backend
npm ci
npm test
npm run build
```

Run frontend tests and build:

```bash
cd frontend
npm ci
npm test
npm run build
```

## GitHub Actions evidence

The `Verification` workflow runs on pushes to `master` and
`maintenance/**`, pull requests targeting `master`, and manual dispatch.
It runs the backend and frontend test commands and their production builds
separately.

For each project, the workflow uploads `test.log` and `build.log` as a
GitHub Actions artifact named:

- `backend-verification-results`
- `frontend-verification-results`

Artifacts are retained for 90 days. To retrieve them, open the repository's
**Actions** tab, select a workflow run, and download the relevant artifact.

A log is evidence only for the specific commit, workflow run, runner, and
environment that generated it. A successful unit/integration test run is not
a load-test result, a security certification, or proof of production readiness.

## Performance evidence

The repository includes load-test definitions, including `load-test.yml` and
`tests/load/load-test.js`. Those scripts describe test scenarios; their
presence does not mean they have been executed successfully.

Do not report a concurrency, throughput, latency, memory, or GPU result as
measured until a reproducible run has been performed and its report retained.
A useful report should record at least:

- commit SHA and date
- test tool and version
- host/runner CPU, RAM, OS, and network
- application topology and configuration
- test duration, workload, and client count
- success/error rates and latency percentiles
- raw output and summary

The 10,000-connection figure in the architecture is a design objective, not
a currently demonstrated result.
