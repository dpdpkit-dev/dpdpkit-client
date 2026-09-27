# Changelog

All code packages in the dpdpkit release train share one version number.

## Unreleased

### Added
- `DpdpClient` / `createDpdpClient` covering every endpoint in the REST contract, including admin.
- Types generated from `openapi.yaml` with `openapi-typescript`.
- `DpdpError` carrying the contract's error code and details.
- `@dpdpkit/client/express`: `requireConsent()` middleware that fails closed.
