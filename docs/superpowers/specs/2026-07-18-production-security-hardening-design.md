# Production Security Hardening Design

## Objective

Prepare the deployed News Collector application for broader public traffic without changing its user-facing product behavior or collection scope. The work must close the currently exposed administrative routes, reduce request amplification, make database writes atomic, narrow production database privileges where the available platforms permit it, and add browser and edge defenses.

## Current Production Baseline

The production application is a Next.js 16 application built by OpenNext and deployed to Cloudflare Workers. Public reads use a Hyperdrive binding backed by Supabase Postgres. Collection and cleanup already run independently through scheduled GitHub Actions.

The current Worker exposes `/api/collect` and `/api/cleanup`. Both routes fail open when `COLLECT_SECRET` is absent, and the deployed Worker has no such secret. Public reads are uncached, execute schema DDL before selecting events, return internal fields including repeated `raw_event_ids`, and have no application-level rate limit. Hyperdrive queries create a separate pool for each SQL statement, so the publish transaction does not guarantee that `BEGIN`, mutations, and `COMMIT` use one connection.

## Chosen Approach

Keep the existing Cloudflare, Next.js, Hyperdrive, Supabase, and GitHub Actions architecture. Remove the two public administrative API routes because no deployed caller needs them. Harden the public read path with validation, a small response DTO, edge-friendly caching, and a Cloudflare rate-limiter binding. Move schema creation out of normal read requests, and introduce a transaction helper that leases one database client for the entire transaction.

This approach is preferred over a minimal secret-only hotfix because it also resolves the known scaling and consistency problems. A migration to Cloudflare Workflows or Queues is deferred because GitHub Actions already provides an isolated scheduler and the additional platform migration is not required to close the present risks.

## Request Architecture

`GET /` continues to render the same page. It reads event data without running DDL and uses Next.js caching or explicit cache metadata suitable for periodically refreshed public data.

`GET /api/events` validates `week`, `category`, and `search` before touching Postgres. Invalid dates, unsupported categories, and oversized search strings return a structured `400` response. The handler applies a Cloudflare rate limit when the binding is available and returns `429` with `Retry-After` when the limit is exceeded. Local development remains usable when the binding is unavailable. Successful responses contain only fields needed by public clients and include an explicit public cache policy.

`POST /api/collect` and `POST /api/cleanup` no longer exist in the deployed application. Scheduled GitHub Actions continue to call `scripts/collect-local.js` and `scripts/cleanup-local.js` directly.

## Data and Database Design

Schema creation remains available to collection and cleanup jobs but is removed from `listEvents`. Public reads will not need `CREATE` or `ALTER` privileges. The Worker will detect the Hyperdrive binding directly instead of requiring a duplicate `DATABASE_URL` secret merely as an enablement flag.

Database transactions will lease a single `pg` client, issue `BEGIN`, execute all mutations through that client, and then `COMMIT` or `ROLLBACK` before releasing it. The existing event replacement operation will use this interface. Publishing will store only the raw-event identifiers associated with each event when that relationship is available; the public response will never expose those identifiers.

Where production access allows safe automation, the Worker Hyperdrive origin will be changed from the broad `postgres` login to a read-only application login with `SELECT` on the published `events` table and schema usage only. GitHub Actions will retain a separate writer connection until its secret can be rotated safely without printing the value. Anonymous and authenticated Data API grants will be revoked from the four internal tables because the application does not use the Data API.

## Edge and Browser Security

Wrangler will define a rate-limit binding for the public events endpoint. The limiter key will combine the endpoint with the Cloudflare client address because the application has no user identity; the limit will be deliberately permissive to avoid blocking ordinary shared-network users. Cloudflare zone-level WAF configuration will be inspected and added only if the authenticated account exposes the necessary API permissions.

Next.js will emit Content Security Policy, Strict-Transport-Security, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and frame protection headers. The fixed inline theme bootstrap will use a CSP-compatible hash or be moved to a separate client-safe mechanism. The `X-Powered-By` header will be disabled. External event URLs will accept only `http:` and `https:` schemes.

## Dependency and CI Hardening

Dependencies will be updated only to compatible patched releases supported by OpenNext. The implementation will not accept an `npm audit` recommendation that downgrades Next.js. GitHub Actions will retain `npm ci`; third-party action references will be pinned to immutable commit SHAs if their current official SHAs can be verified.

## Error Handling and Observability

Public validation errors return `400`; rate-limit failures return `429`; missing database configuration returns a controlled `503`; unexpected errors remain server-side and return a generic response. No database URLs, credentials, upstream response bodies, or stack traces are returned to clients. Cloudflare observability remains enabled with an explicit sampling rate suitable for production.

## Testing and Verification

Implementation follows test-driven development. Tests will first demonstrate that administrative routes exist or that vulnerable helpers behave incorrectly, then verify the intended behavior after each change. Coverage includes request validation, response projection, URL-scheme validation, rate-limit outcomes, cache and security headers, database availability detection, and same-client transaction behavior.

Before deployment, the full Node test suite, Cloudflare build, Wrangler configuration validation, and dependency audit will run. After deployment, read-only checks will confirm that the administrative endpoints return `404` or `405`, `/api/events` returns a reduced payload and correct cache/security headers, invalid input returns `400`, the production Worker no longer contains the duplicate database secret if Hyperdrive is sufficient, and the homepage still renders current events.

## Deployment and Rollback

Deployment occurs only after tests and the Cloudflare build pass. The current production Worker version is recorded before upload. If homepage reads or the public API fail after deployment, Wrangler will roll back to that exact version. Database privilege changes occur after the new code has been verified against production and are applied in a sequence that keeps the existing login available until the new Hyperdrive configuration succeeds.

## Non-Goals

This work does not redesign the interface, change event ranking or collection sources, introduce user accounts, migrate scheduled jobs to another platform, or replace Supabase. Existing uncommitted visual changes remain untouched.
