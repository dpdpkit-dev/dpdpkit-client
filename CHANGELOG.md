# Changelog

All code packages in the dpdpkit release train share one version number.

## Unreleased

### Changed
- Built with TypeScript 7, vite 8 and vitest 5. Type declarations are unchanged; shared code between the
  main and `express` entry points is now one chunk instead of being copied into both.
- Type generation runs from `scripts/codegen` (openapi-typescript still needs the TypeScript 5 compiler API).
- CI tests on Node 22 and 24 and smoke-tests the built package on Node 18 and 20.

## 0.1.0-alpha.1 - 2026-09-27

### Added
- `DpdpClient` / `createDpdpClient` covering every endpoint in the REST contract, including admin.
- Types generated from `openapi.yaml` with `openapi-typescript`.
- `DpdpError` carrying the contract's error code and details.
- `@dpdpkit/client/express`: `requireConsent()` middleware that fails closed.
