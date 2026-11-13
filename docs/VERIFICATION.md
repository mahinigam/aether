# Automated verification and retained evidence

## Unit/integration tests and builds

The `Verification` workflow runs backend and frontend tests and production builds on pushes to `master` and `maintenance/**`, pull requests to `master`, and manual dispatch. It retains each project's test and build logs for 90 days.

A successful test/build run is evidence for the specific commit and runner only. It is not a performance benchmark, security certification, or production-readiness claim.

## Asset provenance and dependency inventory

The workflow runs `node scripts/audit-assets.mjs --check` to ensure every tracked media/font/document file and embedded data URI is registered in `docs/asset-provenance.json`. A clean structural audit does not prove ownership or licensing; entries marked `requires-owner-confirmation` remain human review items.

It generates SPDX package SBOMs for root, backend, and frontend dependency trees and retains the JSON files as a workflow artifact. SBOM metadata is an inventory aid, not legal clearance.

## WebSocket capacity testing

See [WEBSOCKET_CAPACITY_TEST.md](WEBSOCKET_CAPACITY_TEST.md) for the staged Socket.IO capacity test, environment requirements, run command, report format, and interpretation limits. The 10,000-connection figure remains a design objective until a test against a measured deployment has succeeded and its report is retained.

## TLS development certificate

The repository no longer tracks a private key or certificate. Run `sh scripts/generate-dev-cert.sh` to create a local self-signed localhost certificate. It is for local development only and must never be used as production TLS identity.
