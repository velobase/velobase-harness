# Harness optional modules: corrected delivery boundary

The deliverable is the existing Harness application: its homepage, login, Admin, business routes, data model and commercial rules. Downloading and starting it must not substitute a different product.

## Corrections

The separately introduced Basic/Maildesk applications, second Core database/authentication stack and their independent business pages were archived outside the repository and removed from workspace membership. Their entry documentation and package references were removed. The outreach factory remains connected to Harness; its separate Core pages and database dependency were removed.

The local Compose entry now selects the repository-root Harness application, PostgreSQL, Redis and the existing Web/Worker launcher. It prepares the original Prisma schema and existing seed data in an isolated preview database. A development-only local administrator provider is added to the existing authentication and login UI. Existing deployed authentication is unchanged when local demo mode is off.

Admin keeps its original user-management landing page. Navigation includes installed capabilities even when operations are disabled, so configuration and history remain reachable. New business operations continue to use their feature controls.

## Retained work and limits

Business rule packages, provider adapters and their bindings to existing Harness routes remain. Feature metadata, persisted Admin switches and API/Worker admission controls remain. The original commercial policies are the baseline; separate replacement products and unrelated policy changes are outside scope.

The root application still contains static legacy imports. A deployment manifest edit or a package directory alone does not prove that a business SDK can be uninstalled. Full dependency removal remains incomplete and must be addressed in this same Harness application. The withdrawn standalone applications no longer count as evidence for that requirement.

## Execution status

No tests, lint or type checks were run during this correction. The local Docker image built and the original Web/Worker application started against its isolated PostgreSQL and Redis services.

On 2026-09-10, the browser displayed the original Harness homepage at `http://localhost:3003/`. Its existing login dialog offered the local administrator entry, and signing in reached the original `/admin/users` page with the seeded administrator and the business-module sidebar. This confirms that startup and login journey only; it does not claim acceptance of all module paths or complete code optionality.

Initial homepage compilation stalled while bundling large generated server SDKs. Google Ads and Lark SDKs now load through Node via `serverExternalPackages`; the running container received the same configuration from the repository before the successful page load. The Dockerfile copies this configuration on the next `docker compose -f compose.demo.yml up --build`. No external model requests, payments or mailbox sends were performed.
