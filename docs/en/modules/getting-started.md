# Start the existing Harness application

With Docker Desktop running, execute from the repository root:

```sh
docker compose -f compose.demo.yml up --build
```

Open [Harness](http://localhost:3003), open Sign in and choose **Explore as local administrator**. This runs the original homepage, login, Admin and business routes, using the original Prisma schema and seed data. PostgreSQL and Redis are started automatically. The Web and Worker use the existing combined launcher.

In Admin, start with Users and Products, then open Features and Connections. Installed modules remain available in Admin for configuration and history; disabled modules reject new business operations. Missing external credentials are shown as configuration requirements. A model key is unnecessary for browsing the application or managing products and users.

Stop with Ctrl+C; the preview database and session secret remain in local Docker volumes. The preview uses `prisma db push` only on its isolated database, without reset or data-loss flags. Regular deployments use their documented migrations and authentication. The local administrator provider is disabled outside development and a local HTTP origin.

For ordinary source development, use the root `.env.example`, PostgreSQL/Redis and `pnpm dev:all`. The same application runs in both cases. See [modules](./catalog.md) and [composition](./composition.md).
