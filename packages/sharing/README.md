# Content sharing

Install `@velobase/sharing: workspace:*` in the host that publishes content.

This package depends only on Zod.

It owns publication, owner revocation, administrative revocation, paginated moderation and effective public-access decisions.

It does not import AI, a database client, a payment provider or a Web framework.

`createSharing({ repository, isEnabled })` binds the business service to the host.

`repository.setPublication(id, ownerId, sharedAt)` must perform an atomic owner-scoped update; `ownerId` is omitted only for the host's authenticated administrative operation.

`listPublished` returns at most `limit` items and a cursor.

`isEnabled` reads the deployment's current capability state.

Call `publish(input, authenticatedUserId)` and `revoke(input, authenticatedUserId)` from protected routes.

Call `listForAdmin` and `revokeAsAdmin` only from administrator routes.

Call `isPublic` before returning any private content to a non-owner and before cloning shared content.

Revocation intentionally remains available when new publication is disabled.

The complete example's real adapter is `src/modules/sharing/server/service.ts`; its conversation router and moderation screen use this package.

It retains existing URLs and the conversation's `isShared` / `sharedAt` fields, so no content migration is needed.

Copying conversation interactions remains the content owner's operation.

It provides note snapshot storage, owner/public/Admin pages, revocation, moderation and private copying.

Its package, four routes and deployment migration are explicit additions to the host.

For a different content type, implement the two repository methods against that content's own storage.

Add `sharing` to the host's installed features and register only its chosen routes/UI.

`packages/example-composition` adds the AI-chat dependency specifically for the conversation adapter; the generic feature catalog does not require AI.

Removing the package also requires removing those host routes/imports.

Keep stored publication/history fields unless a separate retention migration is intended.

An Admin toggle does not uninstall code.
