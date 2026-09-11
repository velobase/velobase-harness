# Compose and operate Harness modules

Harness remains one product, with its existing routes, UI and database. Code selection and Admin operation apply to that same application.

| Layer | Entry | Responsibility |
| --- | --- | --- |
| Business package | `packages/<module>` | Business rules and explicit repository/provider ports |
| Existing application binding | `src/modules/<module>`, existing services and routes | Connect those ports to Harness data and existing UI |
| Deployment membership | `packages/example-composition/src/index.ts` | Declare included business capabilities and dependencies |
| Admin operation | `/admin/features`, `/admin/connections` | Configure included capabilities and switch new operations on or off |
| Service adapters | `src/config/modules.ts`, selected provider packages | External credentials and protocol configuration |

For email, use the existing `/admin/connections` mailbox configuration and `/admin/email` inbox. Receiving and manual replies are distinct from AI support. Enable AI support separately when a model connection is configured. Do not substitute a separate application to demonstrate this flow.

For activities and sharing, keep the existing `/admin/promo-codes` and conversation-sharing flows. Their extracted rules are in `packages/activities` and `packages/sharing`; the Harness adapters retain the existing rewards, content and permissions.

A deployment manifest is only one part of code optionality. Removing a capability also requires removing its imports, route registrations and SDK dependencies, while accounting for accepted work and stored data. The current root application still has static legacy imports; editing the manifest alone does not prove that an SDK can be uninstalled. Do not report complete package optionality until those references have been handled in this application.

An Admin switch does not delete code or history. Disabling new orders, rewards, sends or model requests must preserve settlement, refunds, cancellation and accepted deliveries. Existing commercial policies are retained.
