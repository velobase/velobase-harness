# Harness Agent runtime design

Status: design proposal, 2026-10-15. This document defines public framework boundaries and implementation constraints. The proposed runtime is not implemented yet. [简体中文](../../zh-CN/architecture/agent-runtime.md)

The runtime lets hosts execute Agents through explicit definitions, tools and triggers, with reliable acceptance, background execution, observation and recovery. The framework owns execution mechanics. Consumer applications own business goals, authority, completion criteria and results.

## 1 Scope and information boundary

This public repository contains independently usable runtime contracts, infrastructure adapters and generic UI components. Non-public business rules, product plans, prompts, data, internal records and implementation progress belong in authorized private destinations. Renaming entities does not replace provenance review.

An Agent defines instructions, context construction and available tools. A Worker hosts execution. Shared Workers can execute independent invocations of the same definition without a process per Agent.

Chat is an optional input and observation surface. Headless jobs can use the same execution mechanics. Existing fixed-step tasks can retain deterministic processors; a tool loop is useful when a model must choose the next step.

Initially reuse existing model adapters, module registration, database, queues and domain services. This scope does not introduce a general workflow platform.

## 2 Responsibilities

| Layer | Owns | Does not own |
| --- | --- | --- |
| Agent definition | Instructions, context, tools, input/output constraints and budget | Actual user or system authority |
| Trigger adapter | Source validation, target resolution, deduplication and invocation policy | Waiting for model execution inside a webhook |
| Execution coordinator | Claims, leases, persistent steps, pause, recovery, budgets and execution state | A duplicate business result or business completion state |
| Tool executor | Argument validation, current authority, revision checks and domain commands | Treating model text as proof of an effect |
| Domain service | Consistency, operation identity, results and business policy | Depending on a chat connection to keep execution alive |
| Observer | Authorized progress, messages, results and controls | Inferring delivery success, result revision or terminal state |

Models cannot choose arbitrary scope, execution identity, recipient boundaries or tool sets. Hosts bind these through authorized context. Every sensitive resource access or mutation still checks current authority.

## 3 Contracts before tables

Define contracts before choosing storage. Contract names do not require new tables with the same names.

| Contract | Content |
| --- | --- |
| `AgentDefinition` | key, version, input/output schemas, instructions, buildContext, tools, required model capabilities and budget |
| `TriggerBinding` | Source type, validation, idempotency identity, target resolution and input impact policy |
| `ExecutionTarget` | scope, actorRef, optional subjectRef, server-selected serialKey and control version |
| `Run` | One accepted logical invocation, input references, definition version, execution state, confirmed outputs and cumulative budget |
| `Attempt` | One execution attempt, epoch, leaseUntil, steps, errors and recovery provenance |
| `ToolOperation` | Tool request, durable operation identity, business result reference and execution or reconciliation state |
| `ResultRef` | Type, ID and revision interpreted by the owning domain service |

An existing conversation, task or domain object can represent persistent work. Applications need not add an `AgentWork` table, and the runtime does not copy domain status into its records. A request without a persistent business subject only needs a Run.

Recovery retains a Run's inputs and operation identities and appends an Attempt. A new user requirement or business trigger creates a new Run. Hosts that batch inputs explicitly record the input set and dispositions.

Business completion differs from execution success. Successfully returning a question can finish an invocation without completing a business goal. Normal waiting, human decisions and business exceptions belong in domain projections rather than one predetermined universal state machine.

### 3.1 Minimum persistence guarantees

Hosts persist acceptance receipts, Runs, Attempts or equivalent append-only events, tool outcomes and wakeup intent. Adapt existing storage when it satisfies these guarantees:

- Source and consumer identify an accepted input. Reusing that identity with different content conflicts.
- The database permits at most one valid claim for a server-selected serialKey.
- Attempt epochs increase monotonically; an obsolete claimant cannot overwrite newer results.
- Domain effects and their operation outcomes commit together or are recoverable through a durable operation ledger.
- Inputs have explicit dispositions: not accepted, accepted, handled, superseded, ignored or waiting on a dependency.
- Processing cursors advance only across a contiguous disposed prefix, never over unfinished input.

Short transactions pass an explicit transaction context into participating storage operations. Neutral interfaces do not reference Prisma; host implementations ensure all participating operations use the same transaction connection.

## 4 Execution and recovery

```text
Validate trigger source
          ↓
Persist input and invocation identity
          ↓
Queue notification / database recovery scan
          ↓
Claim Attempt → Build context → Model
                         ↑          ↓
                         └─ Tool outcome
                                    ↓
              Persist results, messages and run outcome
                                    ↓
                  Observer / subsequent business trigger
```

Run states are `QUEUED / RUNNING / SUSPENDED / SUCCEEDED / FAILED / CANCELLED`. `SUSPENDED` means the current invocation awaits an asynchronous tool or execution dependency; recovery shares its cumulative budget. Waiting for a future user request or business event is a host responsibility that can end the current Run.

1. Validate actor, scope, input and idempotency key. A short transaction saves input references and acceptance, including message and attachment relationships when present.
2. Notify the queue after commit and return the acceptance identity. Missed notifications are recovered rather than undoing accepted facts.
3. Claim conditionally, create an Attempt and record epoch, lease and inputs. Do not keep a database transaction lock open during model execution.
4. Load the pinned definition, current authority, domain facts, relevant history and input. Record necessary source references rather than copying all raw content by default.
5. Persist tool requests and execute through the tool boundary. Save actual outcomes before the next model step.
6. Persist output or a specific suspended dependency and finish the Attempt. Canonical messages, visible result references and Run state have explicit transaction or recovery ownership.
7. Preserve independent acceptance and handling states for newer inputs. Completing this Run cannot silently consume them.

Lost leases, cancellation or revoked authority prevent obsolete Attempt commits. Recovery first reads persisted tool results and external operation state; it never blindly replays every tool. Diagnostic write failure must not erase the operation identity of an already successful domain command.

## 5 New inputs and controls

New input does not always invalidate current execution. Trigger adapters declare its impact:

| Policy | Behavior |
| --- | --- |
| `observe` | Record a fact without starting model execution |
| `append` | Accept and queue while current execution may continue |
| `supersede` | Invalidate affected uncommitted plans and continue from new input and existing results |
| `control` | Pause, cancel, take over or revoke authority by advancing the control version |

Input sequence represents processing progress. Control version determines whether execution remains permitted. Resource revision detects a conflicting business mutation. Check them separately so ordinary input cannot permanently starve execution and obsolete plans cannot overwrite changed resources.

Serialize control commands and claim checks in the database. Closing a page only disconnects observation; stopping execution requires a separate command. Pause retains new inputs. On resume, domain policy determines which inputs to continue, reconsider or ignore as stale.

An external action claimed as `dispatching` may already be crossing the provider boundary. Pause prevents new claims and requires executors that have not dispatched to recheck state, but cannot promise recall of requests already in flight. The interface preserves that uncertainty.

## 6 Tools and side effects

Tools specify version, description, input/output schemas, effect category, required authority and executor. Mutations are sequential by default; only explicitly independent reads may run concurrently.

Read tools return scoped data and source references. Internal mutation tools invoke domain services with expected revisions. External-effect tools persist operation intent before using existing integration services such as email or storage.

The framework requires idempotency and recovery contracts for effects but does not infer operation identity from generated text. Domain services decide whether intent is the same, whether a command is new and whether changed parameters can replace an existing request. Temporary toolCallId values and content hashes are insufficient on their own.

External operations own their claims, leases and states. Intent creation checks Run authority; dispatch rechecks current authority and business preconditions. Normal Run completion does not automatically cancel an accepted operation.

| Outcome | Runtime behavior |
| --- | --- |
| Confirmed success | Reuse the persistent result without repeating the effect |
| Transient failure confirmed not to have executed | Retry within the cumulative budget |
| Accepted but incomplete | Persist a dependency, release the Worker and resume on its result event |
| Unknown execution result | Reconcile the original operation; retain an exception if unverifiable, without blind retry |
| Business conflict | Return current facts for an authorized new decision |

The runtime offers recoverability, not strict exactly-once execution across external systems. Domain records and provider receipts establish results. Pending cannot be presented as completed.

Domain policy declares actions requiring human approval and binds approval to actual parameters, scope, revision and expiry. Ordinary operations already within authority do not acquire a generic approval requirement. Undo and compensation follow domain capabilities rather than deleting evidence of an effect.

## 7 Events and future wakeups

Current `appEvents` is an in-process notification bus that isolates handler failures. Its return does not prove durable consumption.

The source transaction persists reliable delivery intent. Consumers acknowledge after idempotent acceptance keyed by source ID and consumerKey. `appEvents.emit()` and queue notifications accelerate execution; uncompleted database deliveries provide recovery. Existing durable outboxes can satisfy the contract without another parallel ledger.

Future wakeups persist exact time, timezone, reason, applicability conditions and plan version. Existing host task records can store the nearest wakeup; independently managed timers can use child records. Due events have stable deduplication keys, and obsolete plans record an ignored disposition.

Recovery scans cover accepted but unnotified invocations, expired leases, due wakeups and operations needing reconciliation. They do not make business decisions themselves. Domain policy determines whether overdue events are caught up, coalesced or skipped. Arbitrary late events do not reopen terminal invocations.

## 8 Models and context

Keep the existing AI SDK and provider adapters. Public runtime contracts normalize required input, tool calls, completion reasons and usage without cloning the entire provider API or building a duplicate model loop. Adapters must delegate tool commits through the persistent execution boundary.

Readiness checks the selected connection, model and required capabilities. Tool dependencies are checked separately. Incompatible versions or capabilities produce explicit blocking rather than silent behavior changes. Started invocations record their definition version and recover only through a compatible implementation or explicit migration.

Context prioritizes authoritative current domain state and accepted input; history provides context. Include a user message once, and select branched history through the active ancestor chain. Summaries are reconstructible; original material remains managed by its storage owner.

Attachments retain scope, original-message association and processing status. Unsupported formats receive explicit feedback. Material, quotations and tool output cannot change authority or system rules. Different audiences use separate context projections even when they share UI components.

## 9 Optional collaboration interface

Shared interaction contracts cover reliable acceptance, factual progress, result references, specific questions, stopping execution, recovery and actionable errors. Applications compose layouts, navigation, domain labels and result views; the framework does not mandate one workspace for every operation.

Canonical messages and execution logs are separate. Interfaces do not reconstruct conversation history from model requests or Run input, and execution logs are not automatically visible to chat participants. Result panels use domain services to read actual revisions.

Read-only subscriptions recover from cursors. Each stream uses a monotonic sequence and cursors bound to streamId and authorization scope. Host views aggregating multiple Runs provide their own stable stream identity rather than treating per-Run sequences as global cursors.

Snapshots and subsequent events share a consistent high-water mark. Clients deduplicate by event ID and revision and refresh snapshots when cursors expire. Text deltas can be coalesced, while canonical messages, tool outcomes and terminal state remain recoverable. Draft deltas carry Attempt identity so late output cannot overwrite newer content.

Check permission changes both when subscribing and during delivery. Observer disconnection does not cancel execution. List APIs default to 20 records with cursor pagination. Public errors return stable codes and actionable explanations.

## 10 Configuration and diagnostics

Separate code installation, admission of new invocations, model readiness, tool dependencies and execution authority. Disabling new execution must preserve history, reconciliation of accepted effects and settlement.

Disabled modules expose no execution entry points. Before disabling or removing code, assign ownership for authorized history reads, cancellation, inbound receipts and settlement, potentially to independent infrastructure capabilities. If those responsibilities cannot be preserved, drain or explicitly migrate accepted work first.

Each invocation has step, duration, tool-call and cost budgets shared across its Attempts. Hosts can add scope-level concurrency and usage limits. Settlement uses existing billing services with its own idempotency identity and recovery records.

Default diagnostics contain correlation IDs, definition/model versions, duration, usage, state and error codes. Collection of full prompts, material, responses and tool bodies follows an explicit data policy with access, retention, encryption and deletion ownership. Credentials never enter logs, and provider-unavailable internal reasoning is not a required diagnostic artifact.

Metrics include queue delay, recovery time, failure categories, duplicates prevented, unknown effects, cost and reasons for human intervention. Consumer applications define business success metrics.

## 11 Location and implementation order

| Ownership | Location and constraints |
| --- | --- |
| Existing execution capability | Reuse `packages/ai-chat` and explicit provider adapters; retain compatibility entry points |
| Host runtime binding | `src/server/agents` integrates persistence, authority, budgets and existing domain services |
| Worker composition | Contributions in `src/workers/features`; queues/processors exported through existing indexes; use `createWorkerInstance()` |
| Process launcher | `services/worker`, without business policy or Next-only dependencies |
| Client protocol | Stable contracts enter `packages/contracts` and `packages/api-client`, without provider protocol or server dependencies |
| Neutral runtime package | Extract after two independent, publishable framework use cases validate the boundary; do not require a new package first |

First consolidate existing chat acceptance, authorization, transactions, attachments and history. Move model execution from the HTTP observer lifecycle into the Worker. Add deduplication, Attempt recovery, tool ledgers and subscriptions. Validate trigger and wakeup boundaries using independently constructed cases without external effects before extracting packages.

Assign each target to only one old or new executor. Preserve message IDs, operation identities and revisions. Stop old claims before switching ownership. Historical backfills do not trigger tools. Rollback reconciles in-flight effects first and must not ask the old executor to repeat effects already produced by the new one.

## 12 Acceptance conditions

These describe behavior to verify, not validation already performed:

- Duplicate input and queue delivery retain one acceptance identity and do not repeat effects.
- Closing a page preserves accepted execution; explicit stopping fences the old Attempt.
- Continuous appended input cannot starve current execution; controls invalidate affected plans.
- Recovery after an effect commits uses its persisted outcome rather than executing it again.
- Asynchronous tool waiting releases Worker capacity and resumes within the original budget.
- Unknown effects are reconciled, and pause reports actions already in flight truthfully.
- Snapshot and replay preserve terminal outcomes and audience boundaries.
- Definition incompatibility, module disablement and budget exhaustion have explicit handling ownership.
- Public changes are explainable from repository material and independent examples without non-public information.

## 13 Public architectural references

- [AI Chat package boundary](../../../packages/ai-chat/README.md)
- [Composition and disablement responsibilities](../modules/composition.md)
- [Worker integration](../integrations/queue/README.md)
- [Multiplatform ownership and dependencies](multiplatform.md)
- [Existing event bus](../../../src/server/events/bus.ts)
- [Repository development rules](../../../AGENTS.md)

## Current implementation

The first implementation is described in the [AI Chat guide](../features/ai-chat/README.md). It keeps executor registration separate from source ownership, adds no runtime package, and uses persisted snapshots for observation. The broader contracts above remain design guidance; external trigger APIs, approvals and provider reconciliation are not implemented by this first step.
