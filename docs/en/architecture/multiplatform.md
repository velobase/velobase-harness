# Multiplatform workspace

Velobase Harness has three application hosts and two backend process boundaries.
Android and iOS share one Expo app. The first shared capability is the existing
public health API; `/status`, Desktop, and Mobile all use the same validated client.

```text
apps/web/              Next configuration, root layout/landing, status UI, Web adapter
apps/desktop/          Electron main -> restricted preload -> local renderer
apps/mobile/           Expo Android + iOS, native UI and transport/config adapters
packages/contracts/   Platform-neutral Zod schemas and wire types
packages/api-client/  Typed operations with an injected transport
services/api/          Optional Hono process launcher
services/worker/       BullMQ process launcher
src/                   Existing framework implementation and compatibility entries
```

## Compatibility and ownership

This is an incremental extraction. Next still runs from the repository root.
`src/app` remains the route table; its root layout, landing, and health entries
delegate to `apps/web`. Existing routes, `@/*` aliases, public assets, messages,
Prisma configuration/migrations, `.next/standalone/server.js`, and Docker entrypoint
paths stay stable. `apps/web` owns Web composition; it can import legacy `src`
implementation during migration. It is not yet an independently installable Web app.

The API/Worker process launchers moved into `services`; legacy `src/api/index.ts`
and `src/workers/index.ts` import them. Starters, routers, processors, and business
services stay in `src` with their existing behavior. The combined launcher and
`SERVICE_MODE=web,worker` default are preserved. Hono remains optional.

The pinned VeloAgent workspace informed the apps/services/packages boundaries,
injected client transports, isolated Electron bridge, and Expo config ownership.
No private product features, branding, authentication protocols, or implementation
were copied. See the platform guidance for [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
and [Expo monorepos](https://docs.expo.dev/guides/monorepos/).

## Run and verify

Use Node 22.13+ (22 LTS recommended) and the pinned pnpm 10.12.1 for all platforms.
Existing Web/server Node 20 deployment images remain supported.

```bash
pnpm install --frozen-lockfile
pnpm dev:web                         # same as pnpm dev; browse /status
pnpm dev:desktop                     # local Web at http://localhost:3000
VELOBASE_MOBILE_ENV=development \
VELOBASE_MOBILE_API_ORIGIN=http://192.168.1.10:3000 pnpm dev:mobile
```

Mobile requires an explicit server origin reachable from the device. A physical
phone's localhost is the phone; use your development computer's LAN address or an
HTTPS tunnel. HTTP is allowed only with `VELOBASE_MOBILE_ENV=development`; release
config requires HTTPS. Some native development builds also need platform-specific
cleartext network configuration. Prefer HTTPS when testing on devices.

Desktop reads `VELOBASE_DESKTOP_API_ORIGIN` in its main process. Development defaults
to loopback HTTP; packaged apps require an explicit HTTPS origin. For example:
`VELOBASE_DESKTOP_API_ORIGIN=https://your-app.example.com ./apps/desktop/out/Velobase-linux-x64/Velobase`.
Desktop does not automatically load the root `.env`. Expo build config publishes
only `extra.apiOrigin`; application code reads it through `expo-constants`.
Neither shell imports `src/env.js`. Root `.env.example` documents the platform keys,
and environment drift checks recognize their separately validated owners.

Expo checks require the same explicit origin as exports. Without it, validation
fails with the variable name. `app.config.ts` registers Expo's documented
[`tsx/cjs` loader](https://docs.expo.dev/guides/typescript/#appconfigjs) for imported
TypeScript on Node 20/22; validation throws plain, sanitized errors because Expo
annotates `Error.message` and Zod's message is read-only. CLI regression tests run
without native TypeScript stripping or inherited dotenv/loader settings.

```bash
pnpm check                          # existing Web/env/lint/typecheck gate
pnpm test:existing                   # Node 22 module mocks, existing Redis build stub
pnpm check:architecture
pnpm check:packages
pnpm test:platforms
pnpm check:api && pnpm check:worker
pnpm check:desktop && pnpm package:desktop
pnpm check:mobile
VELOBASE_MOBILE_API_ORIGIN=https://example.com pnpm --filter @velobase/mobile verify:dependencies
VELOBASE_MOBILE_API_ORIGIN=https://example.com pnpm config:mobile
VELOBASE_MOBILE_API_ORIGIN=https://example.com pnpm build:mobile
SKIP_ENV_VALIDATION=true pnpm build:web
```

`build:desktop` bundles main/preload/renderer and tests the built IPC bridge without
a display. `package:desktop` packages the current host platform (Linux in CI).
`build:mobile` exports both Android and iOS JavaScript with Metro. These checks do
not build an APK, AAB, or IPA or exercise a real device. For native development use
`pnpm --filter @velobase/mobile android` or `ios` with the corresponding toolchain.
Customize bundle IDs, signing, icons, and distribution before shipping a product.

## Add a capability

1. Define backward-compatible request/response schemas in `packages/contracts`.
   Keep them free of Node, DOM, React, Next, Prisma, and platform globals.
2. Add a typed operation and response/error tests in `packages/api-client`.
   The host supplies transport, cancellation, and any credential handling.
3. Implement server behavior in the appropriate existing framework service or
   product module. Expose a thin Web HTTP adapter; use Hono only when independently
   serving the operation is intentional. Reuse the same contracts at the boundary.
4. Add host UI and adapters. Desktop must expose individual validated preload
   methods, validate IPC sender frames, and keep networking/Node in main. Mobile
   imports only neutral packages and its own platform capabilities.
5. Run boundary tests, package/client tests, and the affected platform builds.

The current health operation is intentionally public and sends no credentials.
Web NextAuth remains unchanged. Native sign-in/token issuance is a future server
capability, not supplied by this slice: do not copy browser cookies, import
NextAuth into Mobile, or persist tokens in renderer state/local storage. Add native
auth through a reviewed server protocol and platform secure storage adapter when
the product needs it.

Architecture tests enforce allowed package dependencies, relative import direction,
re-exports/dynamic imports, renderer isolation, and transitive API/Worker imports
against Next-only dependencies. Neutral packages typecheck with ES libraries only
and no Node/DOM ambient types. Desktop build metadata is checked for server leaks.

PR Web validation remains production-build gated. Deployment workflows validate
Web before building images. `multiplatform-check.yml` checks shared code, backend
entries, Electron packaging, and both Expo exports on Linux. Docker copies neutral
packages before frozen install and filters to the root server dependency closure;
`tsx` and Prisma are locked runtime dependencies, so image builds never run `pnpm add`.

The filtered install selects the root and both neutral packages. Service manifests
have no dependencies of their own; their launchers and legacy backend use the
root's dependencies. Keeping `tsx` and Prisma there supports root production,
combined-launcher, migration, and seed commands. Copying all `src` retains dynamic
module imports without a source allowlist; moving tooling to service manifests
alone would not shrink that dependency closure.

`pnpm test:runtime` requires `redis-server`. It reproduces the Docker production
install in a temporary directory, generates Prisma, excludes Expo/Electron,
starts both service and compatibility entrypoints with validated test config,
checks HTTP health, processes a real cleanup job, and verifies SIGTERM shutdown.
It uses disposable Redis, no external providers, and no database fixture. CI repeats
this on Node 20 and 22.18.0, builds the three split images on Node 20, and runs
`pnpm test:runtime --images` against those images (Web migrations are skipped).
This does not verify database migrations or every optional integration; some
existing dependencies, including React Email, declare Node 22 minimum engines.

Expo 57.0.20 / CLI 57.0.22 were the latest compatible releases when checked.
Exact parent-scoped overrides pin compatible `picomatch` 2.3.2 patches under
`jest-util` and `micromatch`, and `js-yaml` 4.3.2 under `@expo/xcpretty` to address
[picomatch](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj) and
[js-yaml](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) high advisories.
Keep them until upstream lock resolution selects safe versions. CI runs
`pnpm audit --prod --audit-level high`; lower-severity findings remain visible.
