# Chat acceptance example

An authenticated client sends a stable identity with the input:

```json
{
  "id": "owned-conversation-id",
  "requestId": "stable-client-request-id",
  "userAgentId": "installed-agent-id",
  "trigger": "submit-message",
  "message": { "parts": [{ "type": "text", "text": "Summarize this conversation." }] }
}
```

`POST /api/chat` returns `202` with `{ "runId": "..." }`. Repeating exactly the same body recovers the accepted run. A different input needs a new request ID.

`GET /api/chat/:id/run` returns the owned conversation projection and latest run state. `DELETE` on the same URL takes `{ "runId": "..." }` and cancels that owned run. Neither endpoint permits access merely because a conversation is publicly shared.

For UI integration, use `ChatPanel` from `src/components/ai-chat/chat/chat-panel.tsx`. For a non-chat trigger, bind a registered executor and call `acceptAgentRun` inside the domain transaction; notify the queue only after commit.
