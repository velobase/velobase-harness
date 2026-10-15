# Built-In Features

Built-in features are reusable framework capabilities implemented in `src/server/features/`.

They are different from:

- Third-party integrations, which wrap external APIs or SDKs.
- Pluggable modules, which subscribe to events and can be enabled or disabled.
- Application capabilities, whose UI, services and workers live with their respective owners.

## Feature List

| Feature            | Purpose                                                   | Docs                                                 |
| ------------------ | --------------------------------------------------------- | ---------------------------------------------------- |
| Daily Bonus        | Grant daily credits to logged-in users                    | [daily-bonus](./daily-bonus/README.md)               |
| Anti-Abuse Guard   | Detect signup abuse and reclaim credits                   | [anti-abuse](./anti-abuse/README.md)                 |
| CDN Adapters       | Normalize request context across CDN/proxy environments   | [cdn-adapters](./cdn-adapters/README.md)             |
| Conversion Alert   | Generate conversion reports and deliver them through Lark | [conversion-alert](./conversion-alert/README.md)     |
| Support Automation | Process support email with AI and approval workflows      | [support-automation](./support-automation/README.md) |
| Touch Lifecycle    | Schedule and deliver lifecycle touch messages             | [touch](./touch/README.md)                           |

## Rules

- Built-in features should be called explicitly when needed.
- Keep policy constants and strategy functions easy for AI to inspect.
- Do not hide product-specific policy in generic framework code.
- If a feature depends on integrations, read the matching integration docs before editing.
