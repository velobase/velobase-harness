# Conversation sharing adapter

Binds `@velobase/sharing` to the complete example's conversation storage and persisted `sharing` capability. Owner operations use the authenticated user ID; moderation is exposed only through the Admin router. Public reads and forks evaluate effective sharing state. Disabling publication keeps private content and revocation available.

The reusable package has no AI dependency. This host's deployment catalog declares `sharing → ai-chat` because the content here is a conversation. A note or document product supplies its own content adapter.
