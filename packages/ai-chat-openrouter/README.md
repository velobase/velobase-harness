# OpenRouter chat model adapter

Optional technical connection. `createOpenRouterChatModel({apiKey,model})` validates explicit server-side settings and returns a model usable by `@velobase/ai-chat` or AI SDK generation. It does not read host env, choose a model for the application, perform billing or contact the provider during construction.

Only a host selecting OpenRouter adds this package. Admin model configuration and enablement belong to that host's business composition. The complete example keeps its agent model selection and title model policy outside this adapter.

No model calls or tests were run.
