# Production Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the exposed production control routes and make public reads safe, bounded, cacheable, and resilient under broader traffic.

**Architecture:** Keep Next.js on OpenNext/Cloudflare Workers with Hyperdrive and Supabase. Remove public job triggers, isolate request validation and public serialization in pure helpers, enforce rate limiting at the Worker binding, move DDL off the read path, and execute write transactions on one leased Postgres client.

**Tech Stack:** Next.js 16, Node.js test runner, `pg`, OpenNext Cloudflare, Wrangler 4, Cloudflare Hyperdrive and Rate Limiting, Supabase Postgres.

## Global Constraints

- Preserve all existing uncommitted UI changes and do not change collection sources, ranking, or visible product behavior.
- Keep GitHub Actions as the only scheduled collection and cleanup entry point.
- Do not expose credentials, database URLs, upstream bodies, or stack traces.
- Do not deploy until the full test suite, Cloudflare build, Wrangler validation, and targeted security checks pass.
- Record the current Worker version before deployment and retain it for exact rollback.

---

### Task 1: Remove Public Administrative Routes

**Files:**
- Create: `test/security-surface.test.js`
- Delete: `src/app/api/collect/route.js`
- Delete: `src/app/api/cleanup/route.js`

**Interfaces:**
- Consumes: GitHub Actions continue to call `scripts/collect-local.js` and `scripts/cleanup-local.js`.
- Produces: no Next.js route module for `/api/collect` or `/api/cleanup`.

- [ ] **Step 1: Write the failing route-surface test**

```js
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

test("administrative collection routes are not part of the public app", () => {
  assert.equal(existsSync(new URL("../src/app/api/collect/route.js", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/app/api/cleanup/route.js", import.meta.url)), false);
});
```

- [ ] **Step 2: Run `node --test test/security-surface.test.js`**

Expected: FAIL because both route files currently exist.

- [ ] **Step 3: Delete only the two route modules**

Use `apply_patch` to delete the two exact files. Do not delete the job libraries or scripts.

- [ ] **Step 4: Re-run the targeted test**

Expected: PASS.

- [ ] **Step 5: Commit the isolated route removal**

```bash
git add test/security-surface.test.js src/app/api/collect/route.js src/app/api/cleanup/route.js
git commit -m "fix: remove public collection control routes"
```

### Task 2: Validate and Minimize the Public Events API

**Files:**
- Create: `src/lib/public-events-api.js`
- Create: `test/public-events-api.test.js`
- Modify: `src/app/api/events/route.js`

**Interfaces:**
- Produces: `parsePublicEventQuery(searchParams) -> { ok, value?, error? }`.
- Produces: `toPublicEvent(event) -> { title, start_time, end_time, venue, category, signup_url, source_name, summary }`.
- Consumes: `CATEGORIES` from `src/lib/events.js` and `listEvents(options)` from `src/lib/repository.js`.

- [ ] **Step 1: Write failing helper tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { parsePublicEventQuery, toPublicEvent } from "../src/lib/public-events-api.js";

test("public event query rejects invalid input", () => {
  assert.equal(parsePublicEventQuery(new URLSearchParams("week=nope")).ok, false);
  assert.equal(parsePublicEventQuery(new URLSearchParams("category=秘密")).ok, false);
  assert.equal(parsePublicEventQuery(new URLSearchParams(`search=${"x".repeat(101)}`)).ok, false);
});

test("public event response omits internal fields", () => {
  const result = toPublicEvent({ title: "活动", raw_event_ids: [1], dedupe_key: "x", sources: [] });
  assert.deepEqual(result, {
    title: "活动", start_time: null, end_time: null, venue: "", category: "",
    signup_url: "", source_name: "", summary: "",
  });
});
```

- [ ] **Step 2: Run `node --test test/public-events-api.test.js`**

Expected: FAIL because `src/lib/public-events-api.js` does not exist.

- [ ] **Step 3: Implement the pure helpers**

```js
import { CATEGORIES } from "./events.js";

export function parsePublicEventQuery(searchParams) {
  const week = searchParams.get("week") || undefined;
  const category = searchParams.get("category") || undefined;
  const search = searchParams.get("search")?.trim() || undefined;
  if (week && !/^20\d{2}-\d{2}-\d{2}$/.test(week)) return { ok: false, error: "invalid_week" };
  if (week) {
    const [year, month, day] = week.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
      return { ok: false, error: "invalid_week" };
    }
  }
  if (category && !CATEGORIES.includes(category)) return { ok: false, error: "invalid_category" };
  if (search && search.length > 100) return { ok: false, error: "search_too_long" };
  return { ok: true, value: { week, category, search } };
}

export function toPublicEvent(event) {
  return {
    title: event.title || "", start_time: event.start_time || null, end_time: event.end_time || null,
    venue: event.venue || "", category: event.category || "", signup_url: event.signup_url || "",
    source_name: event.source_name || "", summary: event.summary || "",
  };
}
```

- [ ] **Step 4: Update the API route**

Parse the query before calling Postgres. Return `{ error: parsed.error }` with status `400` on failure. Map successful results through `toPublicEvent` and set `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`.

- [ ] **Step 5: Run targeted and full tests**

Run: `node --test test/public-events-api.test.js && npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/public-events-api.js src/app/api/events/route.js test/public-events-api.test.js
git commit -m "fix: bound public event queries and responses"
```

### Task 3: Add Cloudflare Application Rate Limiting

**Files:**
- Create: `src/lib/rate-limit.js`
- Create: `test/rate-limit.test.js`
- Modify: `src/app/api/events/route.js`
- Modify: `wrangler.jsonc`

**Interfaces:**
- Produces: `enforcePublicRateLimit(request, limiter) -> Promise<boolean>` where `true` means allowed.
- Consumes: optional `env.EVENTS_RATE_LIMITER` with `limit({ key }) -> { success }`.

- [ ] **Step 1: Write failing limiter tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { enforcePublicRateLimit } from "../src/lib/rate-limit.js";

test("missing local limiter remains usable", async () => {
  assert.equal(await enforcePublicRateLimit(new Request("https://example.com/api/events")), true);
});

test("configured limiter blocks exhausted clients", async () => {
  const limiter = { limit: async ({ key }) => ({ success: key !== "events:203.0.113.1" }) };
  const request = new Request("https://example.com/api/events", { headers: { "cf-connecting-ip": "203.0.113.1" } });
  assert.equal(await enforcePublicRateLimit(request, limiter), false);
});
```

- [ ] **Step 2: Run `node --test test/rate-limit.test.js`**

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the limiter helper**

```js
export async function enforcePublicRateLimit(request, limiter) {
  if (!limiter?.limit) return true;
  const client = request.headers.get("cf-connecting-ip") || "unknown";
  const { success } = await limiter.limit({ key: `events:${client}` });
  return success;
}
```

- [ ] **Step 4: Add the binding and route enforcement**

Add `EVENTS_RATE_LIMITER` with a unique integer namespace, limit `120`, period `60` to `wrangler.jsonc`. Resolve it through `getCloudflareContext()` inside a guarded helper; return status `429`, `{ error: "rate_limited" }`, and `Retry-After: 60` when denied.

- [ ] **Step 5: Validate tests and Wrangler schema**

Run: `node --test test/rate-limit.test.js && npx wrangler types --check`
Expected: tests PASS and Wrangler reports valid generated binding types or a required generated types update.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rate-limit.js src/app/api/events/route.js test/rate-limit.test.js wrangler.jsonc
git commit -m "fix: rate limit public event queries"
```

### Task 4: Remove DDL From Reads and Make Transactions Atomic

**Files:**
- Modify: `src/lib/db-pool.js`
- Modify: `src/lib/repository.js`
- Create: `test/db-pool.test.js`
- Modify: `test/repository.test.js`

**Interfaces:**
- Produces: `runTransaction(work, { env, poolFactory } = {})` where `work(query)` receives a same-client query function.
- Produces: `getDatabaseConfig(env, cloudflareEnv?)` that accepts explicit binding injection for tests.
- Consumes: `runTransaction` in `replaceWeekEvents`.

- [ ] **Step 1: Write a failing same-client transaction test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { runTransaction } from "../src/lib/db-pool.js";

test("transaction uses one leased client and releases it", async () => {
  const calls = [];
  const client = { query: async (sql) => calls.push(sql), release: () => calls.push("release") };
  const pool = { connect: async () => client, end: async () => calls.push("end") };
  await runTransaction(async (query) => query("update events set title = title"), {
    env: { DATABASE_URL: "postgresql://example" }, poolFactory: () => pool,
  });
  assert.deepEqual(calls, ["begin", "update events set title = title", "commit", "release", "end"]);
});
```

- [ ] **Step 2: Run `node --test test/db-pool.test.js`**

Expected: FAIL because `runTransaction` is not exported.

- [ ] **Step 3: Implement `runTransaction`**

Create one pool, lease one client, issue `begin`, call `work` with `client.query.bind(client)`, commit, roll back on error, release the client, and close only the transaction-owned pool.

- [ ] **Step 4: Remove schema checks from public reads**

In `listEvents`, replace the `process.env.DATABASE_URL` presence check with `getDatabaseConfig()`, remove `ensureSchema()`, and query directly. Retain `ensureSchema()` in collection and cleanup jobs.

- [ ] **Step 5: Move event replacement into `runTransaction`**

Replace the separate `begin`, mutation, and `commit` calls with one `runTransaction(async (transactionQuery) => { ... })` callback. Every delete and insert must use `transactionQuery`.

- [ ] **Step 6: Run targeted and full tests**

Run: `node --test test/db-pool.test.js test/repository.test.js && npm test`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db-pool.js src/lib/repository.js test/db-pool.test.js test/repository.test.js
git commit -m "fix: make database reads lean and writes atomic"
```

### Task 5: Sanitize External Event URLs

**Files:**
- Modify: `src/lib/parsers/shared.js`
- Modify: `test/parsers.test.js`

**Interfaces:**
- Produces: `safePublicUrl(value, base?) -> string | null` accepting only `http:` and `https:`.
- Consumes: `safePublicUrl` in `absoluteUrl` and `buildEvent`.

- [ ] **Step 1: Add failing URL tests**

```js
test("event URLs allow only public HTTP schemes", () => {
  assert.equal(safePublicUrl("javascript:alert(1)"), null);
  assert.equal(safePublicUrl("data:text/html,boom"), null);
  assert.equal(safePublicUrl("/event", "https://example.com/list"), "https://example.com/event");
});
```

- [ ] **Step 2: Run `node --test test/parsers.test.js`**

Expected: FAIL because `safePublicUrl` is not exported.

- [ ] **Step 3: Implement and apply the sanitizer**

```js
export function safePublicUrl(value, base) {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
```

Make `absoluteUrl(base, href)` delegate to `safePublicUrl(href, base)`. Make `buildEvent` reject an event if neither its signup URL nor source URL sanitizes successfully.

- [ ] **Step 4: Run targeted and full tests**

Run: `node --test test/parsers.test.js && npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parsers/shared.js test/parsers.test.js
git commit -m "fix: sanitize collected event links"
```

### Task 6: Add Browser Security Headers and Explicit Observability

**Files:**
- Modify: `next.config.mjs`
- Modify: `wrangler.jsonc`
- Modify: `test/security-surface.test.js`

**Interfaces:**
- Produces: Next.js headers for every route and `poweredByHeader: false`.
- Produces: Wrangler observability with `head_sampling_rate` set explicitly.

- [ ] **Step 1: Add failing configuration tests**

Import `nextConfig` and assert `poweredByHeader === false`; call `await nextConfig.headers()` and assert CSP, HSTS, nosniff, referrer, permissions, and frame headers. Parse Wrangler JSONC after stripping comments and assert `observability.head_sampling_rate === 0.1`.

- [ ] **Step 2: Run `node --test test/security-surface.test.js`**

Expected: FAIL because the headers and sampling rate are absent.

- [ ] **Step 3: Add the header policy**

Set `poweredByHeader: false`. Add a `headers()` function applying to `/:path*` with CSP restricting default sources, objects, framing, base URLs, and forms; allow the minimum script/style/font/image/media sources required by the current Next.js page. Add HSTS for one year with subdomains, nosniff, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` disabling unused sensors, and `X-Frame-Options: DENY`.

- [ ] **Step 4: Set observability sampling**

Add `"head_sampling_rate": 0.1` under `observability` in `wrangler.jsonc`.

- [ ] **Step 5: Verify tests and build configuration**

Run: `node --test test/security-surface.test.js && npm run build`
Expected: tests PASS and Next.js build exits `0` without CSP/config errors.

- [ ] **Step 6: Commit only security/config files**

```bash
git add next.config.mjs wrangler.jsonc test/security-surface.test.js
git commit -m "fix: add browser and worker security policy"
```

### Task 7: Production Database and Deployment Hardening

**Files:**
- Create: `scripts/security-hardening.sql`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Produces: an idempotent SQL hardening script that revokes Data API access from internal tables and future objects.
- Consumes: Wrangler deployment, Hyperdrive, and Supabase direct admin connection for controlled operations.

- [ ] **Step 1: Add a failing SQL contract test to `test/security-surface.test.js`**

Read `scripts/security-hardening.sql` and assert it revokes table, sequence, and function privileges from `anon` and `authenticated`, and alters default privileges for future objects.

- [ ] **Step 2: Run the targeted test**

Expected: FAIL because the SQL file does not exist.

- [ ] **Step 3: Create the idempotent hardening SQL**

The script must revoke all privileges on the four internal tables and their sequences from `anon` and `authenticated`; revoke matching default table, sequence, and function privileges in `public`; and contain no role password or connection string.

- [ ] **Step 4: Update operational documentation**

Remove recommendations that make `COLLECT_SECRET` optional, state that public job routes do not exist, document GitHub Actions as the only job entry point, and explain that Cloudflare uses Hyperdrive rather than a deploy-time `DATABASE_URL` secret.

- [ ] **Step 5: Run the full local verification gate**

Run: `npm test && npm run build:cloudflare && npx wrangler deploy --dry-run && npm audit --json`
Expected: tests PASS; build and dry run exit `0`; audit contains no high or critical vulnerability.

- [ ] **Step 6: Record production and deploy**

Run `npx wrangler deployments list --json`, record the 100% version ID, deploy with `npm run deploy:cloudflare`, and wait for success.

- [ ] **Step 7: Verify production before changing secrets or grants**

Confirm homepage and `/api/events` return `200`; admin routes return `404` or `405`; invalid week returns `400`; headers include cache and security policy; response events omit `raw_event_ids`; and the deployed Worker version lists the configured rate-limit binding. The `429` behavior is proven by the local unit test instead of generating a production burst.

- [ ] **Step 8: Apply reversible production hardening**

Execute `scripts/security-hardening.sql` through the existing admin connection. Confirm RLS remains enabled and `anon`/`authenticated` no longer have table privileges. Delete the Worker `DATABASE_URL` secret only after a fresh homepage/API read proves Hyperdrive-only detection works.

- [ ] **Step 9: Final rollback gate**

If any production read fails, roll back to the exact recorded Worker version before changing database grants further. Otherwise run one final homepage/API/header check and preserve the previous version ID in the handoff.

- [ ] **Step 10: Commit documentation and SQL**

```bash
git add scripts/security-hardening.sql .env.example README.md test/security-surface.test.js
git commit -m "docs: codify production security operations"
```
