# AI support suggestions

`@velobase/ai-support` owns the bounded ticket input and classification/reply suggestion contract.

Its only dependency is Zod.

`createSupportAssistant({ requireEnabled, model })` checks capability access before obtaining the model port, validates the input and validates the returned suggestion.

Merely importing the package does not instantiate a model.

The selected `SupportModel` supplies `suggest(input)`.

It receives a subject and up to 20 bounded customer/agent messages.

The result contains category, summary, reply and review notes.

There is no send-email, refund, credit, subscription or general tool execution port in this service.

Choose [ai-support-openrouter](../ai-support-openrouter/README.md) for a model adapter, or implement a different port.

The complete example retains its existing richer support Agent, financial tool approvals and Lark workflow.

Those are separate host policies, not dependencies of this suggestion service.
