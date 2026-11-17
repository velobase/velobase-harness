import { apply, type Op } from "@earendil-works/chord/delta";
import {
  StorageRequestError,
  type CommitResult,
  type ConversationId,
  type ConversationQuery,
  type ConversationRecord,
  type Cursor,
  type DocumentAddress,
  type DocumentContent,
  type DocumentCopySource,
  type DocumentCreate,
  type DocumentId,
  type DocumentPoint,
  type DocumentQuery,
  type DocumentRecord,
  type EntryId,
  type EntryQuery,
  type EntryRecord,
  type Id,
  type JsonObject,
  type Page,
  type ScanOrder,
  type Seq,
  type Storage,
  type StorageWrite,
  type StoredDocument,
  type SubmissionId,
  type SubmissionQuery,
  type SubmissionRecord,
  type TaskId,
  type TaskQuery,
  type TaskRecord,
} from "@earendil-works/pi-durable";
import type { Context } from "@earendil-works/chord/context";
import type { JsonValue } from "@earendil-works/chord/json";
import type { Pool, PoolClient, QueryResultRow } from "pg";

const idFromNumber = <I extends Id<string>>(value: number): I =>
  value as unknown as I;
const seqFromNumber = (value: number): Seq => value as unknown as Seq;

const parseJson = <T>(value: string): T => JSON.parse(value) as T;
const encodeJson = (value: unknown): string => JSON.stringify(value);
const encodeIndexedString = (value: string): string => JSON.stringify(value);

const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertIdentifier(value: string, label: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`Invalid PostgreSQL ${label} identifier: ${value}`);
  }
}

const TABLE_NAMES = {
  durableSchema: "durable_schema",
  durableMetadata: "durable_metadata",
  recordIds: "record_ids",
  conversations: "conversations",
  entries: "entries",
  tasks: "tasks",
  submissions: "submissions",
  documents: "documents",
  documentRevisions: "document_revisions",
} as const;

const INDEX_NAMES = {
  conversationsByOwnerConversation: "conversations_by_owner_conversation",
  conversationsByOwnerTask: "conversations_by_owner_task",
  entriesByConversation: "entries_by_conversation",
  entryHeadsByConversation: "entry_heads_by_conversation",
  tasksByStatus: "tasks_by_status",
  tasksByConversation: "tasks_by_conversation",
  tasksByKind: "tasks_by_kind",
  tasksByAbortRequested: "tasks_by_abort_requested",
  tasksByBackground: "tasks_by_background",
  submissionsByRequest: "submissions_by_request",
  submissionsByConversation: "submissions_by_conversation",
  submissionsByStatus: "submissions_by_status",
  documentsByAddress: "documents_by_address",
  documentsByScope: "documents_by_scope",
  documentsByScopeKind: "documents_by_scope_kind",
  documentRevisionsByKind: "document_revisions_by_kind",
} as const;

export interface PostgresSchemaIdentifiers {
  readonly schema: string;
  readonly prefix: string;
  readonly tables: { readonly [K in keyof typeof TABLE_NAMES]: string };
  readonly indexes: { readonly [K in keyof typeof INDEX_NAMES]: string };
}

export function createPostgresSchema(
  schema = "pi_durable",
  prefix = "",
): PostgresSchemaIdentifiers {
  assertIdentifier(schema, "schema");
  if (prefix !== "") assertIdentifier(prefix, "prefix");
  const tables = Object.fromEntries(
    Object.entries(TABLE_NAMES).map(([key, name]) => [
      key,
      `"${schema}"."${prefix}${name}"`,
    ]),
  ) as PostgresSchemaIdentifiers["tables"];
  const indexes = Object.fromEntries(
    Object.entries(INDEX_NAMES).map(([key, name]) => [
      key,
      `"${prefix}${name}"`,
    ]),
  ) as PostgresSchemaIdentifiers["indexes"];
  return { schema, prefix, tables, indexes };
}

export const DEFAULT_POSTGRES_SCHEMA = createPostgresSchema();

export function createPostgresMigrationStatements(
  identifiers: PostgresSchemaIdentifiers = DEFAULT_POSTGRES_SCHEMA,
): readonly string[] {
  const { schema, tables, indexes } = identifiers;
  return [
    `CREATE SCHEMA IF NOT EXISTS "${schema}"`,
    `CREATE TABLE IF NOT EXISTS ${tables.durableSchema} (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      version INTEGER NOT NULL CHECK (version >= 0)
    )`,
    `INSERT INTO ${tables.durableSchema} (singleton, version) VALUES (1, 2) ON CONFLICT (singleton) DO NOTHING`,
    `CREATE TABLE IF NOT EXISTS ${tables.durableMetadata} (
      session_id TEXT PRIMARY KEY,
      next_id BIGINT NOT NULL,
      next_seq BIGINT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ${tables.recordIds} (
      session_id TEXT NOT NULL,
      id BIGINT NOT NULL,
      record_type TEXT NOT NULL CHECK (record_type IN ('conversation', 'entry', 'task', 'submission', 'document')),
      PRIMARY KEY (session_id, id)
    )`,
    `CREATE TABLE IF NOT EXISTS ${tables.conversations} (
      session_id TEXT NOT NULL,
      id BIGINT NOT NULL,
      owner_conversation_id BIGINT,
      owner_task_id BIGINT,
      record TEXT NOT NULL,
      PRIMARY KEY (session_id, id)
    )`,
    `CREATE INDEX IF NOT EXISTS ${indexes.conversationsByOwnerConversation} ON ${tables.conversations} (session_id, owner_conversation_id, id)`,
    `CREATE INDEX IF NOT EXISTS ${indexes.conversationsByOwnerTask} ON ${tables.conversations} (session_id, owner_task_id, id)`,
    `CREATE TABLE IF NOT EXISTS ${tables.entries} (
      session_id TEXT NOT NULL,
      id BIGINT NOT NULL,
      conversation_id BIGINT NOT NULL,
      head BIGINT,
      commit_seq BIGINT NOT NULL,
      record TEXT NOT NULL,
      PRIMARY KEY (session_id, id)
    )`,
    `CREATE INDEX IF NOT EXISTS ${indexes.entriesByConversation} ON ${tables.entries} (session_id, conversation_id, id DESC)`,
    `CREATE INDEX IF NOT EXISTS ${indexes.entryHeadsByConversation} ON ${tables.entries} (session_id, conversation_id, id DESC) WHERE head IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS ${tables.tasks} (
      session_id TEXT NOT NULL,
      id BIGINT NOT NULL,
      conversation_id BIGINT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'waiting', 'sleeping', 'completing', 'terminal')),
      abort_requested INTEGER NOT NULL CHECK (abort_requested IN (0, 1)),
      background INTEGER NOT NULL CHECK (background IN (0, 1)),
      record TEXT NOT NULL,
      PRIMARY KEY (session_id, id)
    )`,
    `CREATE INDEX IF NOT EXISTS ${indexes.tasksByStatus} ON ${tables.tasks} (session_id, status, id)`,
    `CREATE INDEX IF NOT EXISTS ${indexes.tasksByConversation} ON ${tables.tasks} (session_id, conversation_id, id)`,
    `CREATE INDEX IF NOT EXISTS ${indexes.tasksByKind} ON ${tables.tasks} (session_id, kind, id)`,
    `CREATE INDEX IF NOT EXISTS ${indexes.tasksByAbortRequested} ON ${tables.tasks} (session_id, abort_requested, id)`,
    `CREATE INDEX IF NOT EXISTS ${indexes.tasksByBackground} ON ${tables.tasks} (session_id, background, id)`,
    `CREATE TABLE IF NOT EXISTS ${tables.submissions} (
      session_id TEXT NOT NULL,
      id BIGINT NOT NULL,
      conversation_id BIGINT NOT NULL,
      request_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('queued', 'placed', 'done', 'unanswered')),
      record TEXT NOT NULL,
      PRIMARY KEY (session_id, id)
    )`,
    `CREATE INDEX IF NOT EXISTS ${indexes.submissionsByRequest} ON ${tables.submissions} (session_id, conversation_id, request_id)`,
    `CREATE INDEX IF NOT EXISTS ${indexes.submissionsByConversation} ON ${tables.submissions} (session_id, conversation_id, id)`,
    `CREATE INDEX IF NOT EXISTS ${indexes.submissionsByStatus} ON ${tables.submissions} (session_id, status, id)`,
    `CREATE TABLE IF NOT EXISTS ${tables.documents} (
      session_id TEXT NOT NULL,
      id BIGINT NOT NULL,
      kind TEXT NOT NULL,
      family INTEGER NOT NULL CHECK (family IN (0, 1)),
      key_value TEXT NOT NULL,
      scope_kind TEXT NOT NULL CHECK (scope_kind IN ('session', 'conversation', 'task')),
      owner_id BIGINT NOT NULL,
      created_at BIGINT NOT NULL,
      retired_at BIGINT,
      record TEXT NOT NULL,
      PRIMARY KEY (session_id, id)
    )`,
    `CREATE INDEX IF NOT EXISTS ${indexes.documentsByAddress}
      ON ${tables.documents} (session_id, kind, scope_kind, owner_id, family, key_value, created_at DESC, retired_at)`,
    `CREATE INDEX IF NOT EXISTS ${indexes.documentsByScope} ON ${tables.documents} (session_id, scope_kind, owner_id, id)`,
    `CREATE INDEX IF NOT EXISTS ${indexes.documentsByScopeKind} ON ${tables.documents} (session_id, scope_kind, owner_id, kind, id)`,
    `CREATE TABLE IF NOT EXISTS ${tables.documentRevisions} (
      session_id TEXT NOT NULL,
      document_id BIGINT NOT NULL,
      seq BIGINT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('base', 'delta')),
      version BIGINT NOT NULL,
      content TEXT NOT NULL,
      PRIMARY KEY (session_id, document_id, seq)
    )`,
    `CREATE INDEX IF NOT EXISTS ${indexes.documentRevisionsByKind} ON ${tables.documentRevisions} (session_id, document_id, kind, seq DESC)`,
  ];
}

const migratedPools = new WeakMap<Pool, Map<string, Promise<void>>>();

export async function applyPostgresMigrations(
  pool: Pool,
  identifiers: PostgresSchemaIdentifiers = DEFAULT_POSTGRES_SCHEMA,
): Promise<void> {
  let byKey = migratedPools.get(pool);
  if (!byKey) {
    byKey = new Map();
    migratedPools.set(pool, byKey);
  }
  const key = `${identifiers.schema}:${identifiers.prefix}`;
  const existing = byKey.get(key);
  if (existing) return existing;

  const task = (async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`pi_durable_schema:${key}`],
      );
      for (const statement of createPostgresMigrationStatements(identifiers)) {
        await client.query(statement);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      byKey.delete(key);
      throw error;
    } finally {
      client.release();
    }
  })();

  byKey.set(key, task);
  return task;
}

const scopeColumns = (scope: DocumentRecord["scope"]) => {
  switch (scope.kind) {
    case "session":
      return { scopeKind: "session", ownerId: 0 };
    case "conversation":
      return { scopeKind: "conversation", ownerId: scope.conversationId };
    case "task":
      return { scopeKind: "task", ownerId: scope.taskId };
  }
};

const addressParts = (address: {
  readonly kind: string;
  readonly scope: DocumentRecord["scope"];
  readonly key?: string;
}) => {
  const scope = scopeColumns(address.scope);
  return {
    kind: encodeIndexedString(address.kind),
    ...scope,
    family: address.key === undefined ? 0 : 1,
    keyValue: encodeIndexedString(address.key ?? ""),
  };
};

const addressColumnsKey = (
  kind: string,
  scopeKind: string,
  ownerId: number,
  family: number,
  keyValue: string,
) => JSON.stringify([kind, scopeKind, ownerId, family, keyValue]);

const addressKey = (address: {
  readonly kind: string;
  readonly scope: DocumentRecord["scope"];
  readonly key?: string;
}) => {
  const parts = addressParts(address);
  return addressColumnsKey(
    parts.kind,
    parts.scopeKind,
    parts.ownerId,
    parts.family,
    parts.keyValue,
  );
};

const isCurrentOnly = (record: DocumentRecord) =>
  record.scope.kind !== "conversation" || record.history === "latest";

const isAliveAt = (record: DocumentRecord, at: DocumentPoint) => {
  if (at === "current") return record.retiredAt === undefined;
  return (
    record.createdAt <= at &&
    (record.retiredAt === undefined || at < record.retiredAt)
  );
};

function nextCursor(after: number, order: ScanOrder): Cursor {
  return { after, order };
}

function scanStart(
  order: ScanOrder | undefined,
  cursor: Cursor | undefined,
  defaultOrder: ScanOrder,
): { readonly order: ScanOrder; readonly after?: number } {
  if (cursor === undefined) {
    const resolved = order ?? defaultOrder;
    if (resolved !== "ascending" && resolved !== "descending") {
      throw new StorageRequestError(
        `Invalid storage scan order: ${String(order)}`,
      );
    }
    return { order: resolved };
  }
  const cursorOrder = cursor.order;
  const after = cursor.after;
  if (
    (cursorOrder !== "ascending" && cursorOrder !== "descending") ||
    typeof after !== "number" ||
    !Number.isSafeInteger(after) ||
    after < 1
  ) {
    throw new StorageRequestError("Invalid storage cursor");
  }
  if (order !== undefined && order !== cursorOrder) {
    throw new StorageRequestError(
      `Storage cursor order ${cursorOrder} does not match requested order ${order}`,
    );
  }
  return { order: cursorOrder, after };
}

const cursorId = (cursor: Cursor | undefined): DocumentId | undefined => {
  if (cursor === undefined) return undefined;
  const after = cursor.after;
  const order = cursor.order;
  if (
    typeof after !== "number" ||
    !Number.isSafeInteger(after) ||
    after < 1 ||
    (order !== undefined && order !== "ascending")
  ) {
    throw new StorageRequestError("Invalid storage cursor");
  }
  return idFromNumber<DocumentId>(after);
};

const page = <T extends { readonly id: number }>(
  values: readonly T[],
  limit: number,
  order: ScanOrder = "ascending",
): Page<T, Cursor> => {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new StorageRequestError(`Invalid storage scan limit: ${limit}`);
  }
  const items = values.slice(0, limit);
  if (values.length <= limit) return { items };
  return { items, next: nextCursor(items.at(-1)!.id, order) };
};

const claimOf = (
  write: StorageWrite,
): { readonly id: number; readonly table: string } | undefined => {
  switch (write.type) {
    case "conversation":
    case "entry":
    case "task":
    case "submission":
      return { id: write.value.id, table: write.type };
    case "document.create":
    case "document.copy":
      return { id: write.record.id, table: "document" };
    case "document.change":
    case "document.retire":
      return undefined;
  }
};

interface DocumentAction {
  create?: DocumentCreate;
  content?: DocumentContent;
  copy?: DocumentCopySource;
  retire: boolean;
}

function prepareDocumentActions(
  writes: readonly StorageWrite[],
): Map<DocumentId, DocumentAction> {
  const actions = new Map<DocumentId, DocumentAction>();
  for (const write of writes) {
    if (
      write.type !== "document.create" &&
      write.type !== "document.copy" &&
      write.type !== "document.change" &&
      write.type !== "document.retire"
    ) {
      continue;
    }
    const id =
      write.type === "document.create" || write.type === "document.copy"
        ? write.record.id
        : write.id;
    let action = actions.get(id);
    if (action === undefined) {
      action = { retire: false };
      actions.set(id, action);
    }
    switch (write.type) {
      case "document.create":
        if (
          action.create !== undefined ||
          action.content !== undefined ||
          action.copy !== undefined
        ) {
          throw new Error(`Document ${id} has more than one content command`);
        }
        action.create = write.record;
        action.content = write.content;
        break;
      case "document.copy":
        if (
          action.create !== undefined ||
          action.content !== undefined ||
          action.copy !== undefined
        ) {
          throw new Error(`Document ${id} has more than one content command`);
        }
        action.create = write.record;
        action.copy = write.source;
        break;
      case "document.change":
        if (action.content !== undefined || action.copy !== undefined) {
          throw new Error(`Document ${id} has more than one content command`);
        }
        action.content = write.content;
        break;
      case "document.retire":
        if (action.retire) {
          throw new Error(`Document ${id} is retired more than once`);
        }
        action.retire = true;
        break;
    }
  }
  return actions;
}

interface PgExecutor {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

class CommitState {
  #recordIds: Map<number, string>;
  #documents: Map<DocumentId, DocumentRecord>;
  #versions: Map<DocumentId, number>;
  #current: Map<string, DocumentId | undefined>;

  constructor(
    recordIds: Map<number, string>,
    documents: Map<DocumentId, DocumentRecord>,
    versions: Map<DocumentId, number>,
    current: Map<string, DocumentId | undefined>,
  ) {
    this.#recordIds = recordIds;
    this.#documents = documents;
    this.#versions = versions;
    this.#current = current;
  }

  static async read(
    executor: PgExecutor,
    tables: PostgresSchemaIdentifiers["tables"],
    sessionId: string,
    batches: readonly (readonly StorageWrite[])[],
  ): Promise<CommitState> {
    const ids = new Set<number>();
    const documentIds = new Set<DocumentId>();
    const deltaIds = new Set<DocumentId>();
    const addresses = new Map<string, ReturnType<typeof addressParts>>();

    for (const writes of batches) {
      for (const write of writes) {
        const claim = claimOf(write);
        if (claim !== undefined) ids.add(claim.id);
        switch (write.type) {
          case "document.create":
          case "document.copy":
            documentIds.add(write.record.id);
            addresses.set(addressKey(write.record), addressParts(write.record));
            break;
          case "document.change":
            documentIds.add(write.id);
            if (write.content.kind === "delta") deltaIds.add(write.id);
            break;
          case "document.retire":
            documentIds.add(write.id);
            break;
          default:
            break;
        }
      }
    }

    const recordIds = new Map<number, string>();
    if (ids.size > 0) {
      const { rows } = await executor.query<{
        id: string | number;
        record_type: string;
      }>(
        `SELECT id, record_type FROM ${tables.recordIds} WHERE session_id = $1 AND id = ANY($2::bigint[])`,
        [sessionId, [...ids]],
      );
      for (const row of rows) {
        recordIds.set(Number(row.id), row.record_type);
      }
    }

    const documents = new Map<DocumentId, DocumentRecord>();
    if (documentIds.size > 0) {
      const { rows } = await executor.query<{ record: string }>(
        `SELECT record FROM ${tables.documents} WHERE session_id = $1 AND id = ANY($2::bigint[])`,
        [sessionId, [...documentIds]],
      );
      for (const row of rows) {
        const record = parseJson<DocumentRecord>(row.record);
        documents.set(record.id, record);
      }
    }

    const versions = new Map<DocumentId, number>();
    if (deltaIds.size > 0) {
      const { rows } = await executor.query<{
        document_id: string | number;
        version: number | null;
      }>(
        `SELECT requested AS document_id, (
          SELECT version FROM ${tables.documentRevisions}
          WHERE session_id = $1 AND document_id = requested
          ORDER BY seq DESC LIMIT 1
        ) AS version
        FROM unnest($2::bigint[]) AS requested`,
        [sessionId, [...deltaIds]],
      );
      for (const row of rows) {
        if (row.version !== null) {
          versions.set(
            idFromNumber<DocumentId>(Number(row.document_id)),
            Number(row.version),
          );
        }
      }
    }

    const current = new Map<string, DocumentId | undefined>();
    for (const key of addresses.keys()) current.set(key, undefined);
    if (addresses.size > 0) {
      const addrList = [...addresses.values()];
      const { rows } = await executor.query<{
        id: string | number;
        kind: string;
        scope_kind: string;
        owner_id: string | number;
        family: number;
        key_value: string;
      }>(
        `SELECT d.id, d.kind, d.scope_kind, d.owner_id, d.family, d.key_value
         FROM unnest($2::text[], $3::text[], $4::bigint[], $5::int[], $6::text[])
           AS addr(kind, scope_kind, owner_id, family, key_value)
         JOIN ${tables.documents} AS d
           ON d.session_id = $1
          AND d.kind = addr.kind
          AND d.scope_kind = addr.scope_kind
          AND d.owner_id = addr.owner_id
          AND d.family = addr.family
          AND d.key_value = addr.key_value
         WHERE d.retired_at IS NULL`,
        [
          sessionId,
          addrList.map((a) => a.kind),
          addrList.map((a) => a.scopeKind),
          addrList.map((a) => a.ownerId),
          addrList.map((a) => a.family),
          addrList.map((a) => a.keyValue),
        ],
      );
      for (const row of rows) {
        current.set(
          addressColumnsKey(
            row.kind,
            row.scope_kind,
            Number(row.owner_id),
            Number(row.family),
            row.key_value,
          ),
          idFromNumber<DocumentId>(Number(row.id)),
        );
      }
    }

    return new CommitState(recordIds, documents, versions, current);
  }

  check(
    writes: readonly StorageWrite[],
    actions: Map<DocumentId, DocumentAction>,
  ): void {
    this.#checkIds(writes);
    this.#checkDocuments(actions);
  }

  apply(
    writes: readonly StorageWrite[],
    actions: Map<DocumentId, DocumentAction>,
    seq: Seq,
  ): void {
    for (const write of writes) {
      const claim = claimOf(write);
      if (claim !== undefined) this.#recordIds.set(claim.id, claim.table);
    }
    for (const [id, action] of actions) {
      if (action.create !== undefined) {
        const record: DocumentRecord = {
          ...action.create,
          createdAt: seq,
          ...(action.retire ? { retiredAt: seq } : {}),
        };
        this.#documents.set(id, record);
        if (!action.retire) this.#current.set(addressKey(record), id);
      } else if (action.retire) {
        const existing = this.#documents.get(id)!;
        const record: DocumentRecord = { ...existing, retiredAt: seq };
        this.#documents.set(id, record);
        const key = addressKey(record);
        if (this.#current.get(key) === id) this.#current.set(key, undefined);
      }
      if (action.content !== undefined) {
        this.#versions.set(id, action.content.version);
      }
    }
  }

  document(id: DocumentId): DocumentRecord | undefined {
    return this.#documents.get(id);
  }

  #checkIds(writes: readonly StorageWrite[]): void {
    const claimed = new Map<number, string>();
    for (const write of writes) {
      const claim = claimOf(write);
      if (claim === undefined) continue;
      const { id, table } = claim;
      const existing = this.#recordIds.get(id);
      const earlier = claimed.get(id);
      if (
        table === "conversation" ||
        table === "entry" ||
        table === "document"
      ) {
        if (existing !== undefined) {
          throw new Error(`ID ${id} already belongs to ${existing}`);
        }
        if (earlier !== undefined) {
          throw new Error(`ID ${id} is written more than once`);
        }
      } else {
        if (existing !== undefined && existing !== table) {
          throw new Error(`ID ${id} already belongs to ${existing}`);
        }
        if (earlier !== undefined && earlier !== table) {
          throw new Error(`ID ${id} is written as two record types`);
        }
      }
      claimed.set(id, table);
    }
  }

  #checkDocuments(actions: Map<DocumentId, DocumentAction>): void {
    const liveCounts = new Map<string, number>();
    for (const [id, action] of actions) {
      if (action.copy !== undefined && actions.has(action.copy.id)) {
        throw new Error(
          `Document copy ${id} source is changed in the copy batch`,
        );
      }
      const existing = this.#documents.get(id);
      if (action.create === undefined && existing === undefined) {
        throw new Error(`Unknown document: ${id}`);
      }
      if (action.create !== undefined && existing !== undefined) {
        throw new Error(`Document ${id} already exists`);
      }
      if (existing?.retiredAt !== undefined) {
        throw new Error(`Document ${id} is retired`);
      }
      if (action.content?.kind === "delta") {
        const previous = this.#versions.get(id);
        if (previous === undefined) {
          throw new Error(`Document ${id} delta has no base`);
        }
        if (previous !== action.content.version) {
          throw new Error(`Document ${id} version transition requires a base`);
        }
      }
      if (action.create === undefined && !action.retire) continue;
      const key = addressKey((action.create ?? existing)!);
      let live = liveCounts.get(key);
      if (live === undefined) {
        live = this.#current.get(key) === undefined ? 0 : 1;
      }
      if (action.retire && existing !== undefined) live--;
      if (action.create !== undefined && !action.retire) live++;
      liveCounts.set(key, live);
    }
    for (const live of liveCounts.values()) {
      if (live > 1) {
        throw new Error("Document address already has a current incarnation");
      }
    }
  }
}

async function insertMultiRow(
  executor: PgExecutor,
  table: string,
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
  conflict = "",
): Promise<void> {
  if (rows.length === 0) return;
  const width = columns.length;
  const batchSize = Math.max(1, Math.floor(4000 / width));
  for (let start = 0; start < rows.length; start += batchSize) {
    const chunk = rows.slice(start, start + batchSize);
    const valuesClause = chunk
      .map(
        (_, rowIndex) =>
          `(${columns.map((__, colIndex) => `$${rowIndex * width + colIndex + 1}`).join(", ")})`,
      )
      .join(", ");
    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${valuesClause} ${conflict}`;
    await executor.query(sql, chunk.flat());
  }
}

class PendingWrites {
  #recordIds = new Map<number, string>();
  #conversations: unknown[][] = [];
  #entries: unknown[][] = [];
  #tasks = new Map<number, unknown[]>();
  #submissions = new Map<number, unknown[]>();
  #documents = new Map<DocumentId, DocumentRecord>();
  #cleared = new Set<DocumentId>();
  #revisions = new Map<DocumentId, unknown[][]>();

  add(
    sessionId: string,
    writes: readonly StorageWrite[],
    actions: Map<DocumentId, DocumentAction>,
    seq: Seq,
    state: CommitState,
  ): void {
    for (const write of writes) {
      const claim = claimOf(write);
      if (claim !== undefined) this.#recordIds.set(claim.id, claim.table);
      switch (write.type) {
        case "conversation":
          this.#conversations.push([
            sessionId,
            write.value.id,
            write.value.owner?.conversationId ?? null,
            write.value.owner?.taskId ?? null,
            encodeJson(write.value),
          ]);
          break;
        case "entry":
          this.#entries.push([
            sessionId,
            write.value.id,
            write.value.conversationId,
            write.value.head ?? null,
            seq,
            encodeJson(write.value),
          ]);
          break;
        case "task":
          this.#tasks.set(write.value.id, [
            sessionId,
            write.value.id,
            write.value.conversationId,
            encodeIndexedString(write.value.kind),
            write.value.state.status,
            write.value.abortRequested ? 1 : 0,
            write.value.background ? 1 : 0,
            encodeJson(write.value),
          ]);
          break;
        case "submission":
          this.#submissions.set(write.value.id, [
            sessionId,
            write.value.id,
            write.value.conversationId,
            write.value.requestId === undefined
              ? null
              : encodeIndexedString(write.value.requestId),
            write.value.status,
            encodeJson(write.value),
          ]);
          break;
        default:
          break;
      }
    }
    for (const [id, action] of actions) {
      const record = state.document(id)!;
      if (action.create !== undefined || action.retire) {
        this.#documents.set(id, record);
      }
      const content = action.content;
      if (content !== undefined) {
        if (content.kind === "base" && isCurrentOnly(record)) {
          this.#cleared.add(id);
          this.#revisions.delete(id);
        }
        const encoded =
          content.kind === "base"
            ? encodeJson(content.value)
            : encodeJson(content.ops);
        let revisions = this.#revisions.get(id);
        if (revisions === undefined) {
          revisions = [];
          this.#revisions.set(id, revisions);
        }
        revisions.push([
          sessionId,
          id,
          seq,
          content.kind,
          content.version,
          encoded,
        ]);
      }
      if (action.retire && isCurrentOnly(record)) {
        this.#cleared.add(id);
        this.#revisions.delete(id);
      }
    }
  }

  async flush(
    executor: PgExecutor,
    tables: PostgresSchemaIdentifiers["tables"],
    sessionId: string,
  ): Promise<void> {
    await insertMultiRow(
      executor,
      tables.recordIds,
      ["session_id", "id", "record_type"],
      [...this.#recordIds].map(([id, table]) => [sessionId, id, table]),
      "ON CONFLICT (session_id, id) DO NOTHING",
    );
    await insertMultiRow(
      executor,
      tables.conversations,
      ["session_id", "id", "owner_conversation_id", "owner_task_id", "record"],
      this.#conversations,
    );
    await insertMultiRow(
      executor,
      tables.entries,
      ["session_id", "id", "conversation_id", "head", "commit_seq", "record"],
      this.#entries,
    );
    await insertMultiRow(
      executor,
      tables.tasks,
      [
        "session_id",
        "id",
        "conversation_id",
        "kind",
        "status",
        "abort_requested",
        "background",
        "record",
      ],
      [...this.#tasks.values()],
      `ON CONFLICT (session_id, id) DO UPDATE SET
        conversation_id = EXCLUDED.conversation_id,
        kind = EXCLUDED.kind,
        status = EXCLUDED.status,
        abort_requested = EXCLUDED.abort_requested,
        background = EXCLUDED.background,
        record = EXCLUDED.record`,
    );
    await insertMultiRow(
      executor,
      tables.submissions,
      ["session_id", "id", "conversation_id", "request_id", "status", "record"],
      [...this.#submissions.values()],
      `ON CONFLICT (session_id, id) DO UPDATE SET
        conversation_id = EXCLUDED.conversation_id,
        request_id = EXCLUDED.request_id,
        status = EXCLUDED.status,
        record = EXCLUDED.record`,
    );
    await insertMultiRow(
      executor,
      tables.documents,
      [
        "session_id",
        "id",
        "kind",
        "family",
        "key_value",
        "scope_kind",
        "owner_id",
        "created_at",
        "retired_at",
        "record",
      ],
      [...this.#documents.values()].map((record) => {
        const parts = addressParts(record);
        return [
          sessionId,
          record.id,
          parts.kind,
          parts.family,
          parts.keyValue,
          parts.scopeKind,
          parts.ownerId,
          record.createdAt,
          record.retiredAt ?? null,
          encodeJson(record),
        ];
      }),
      "ON CONFLICT (session_id, id) DO UPDATE SET retired_at = EXCLUDED.retired_at, record = EXCLUDED.record",
    );
    if (this.#cleared.size > 0) {
      await executor.query(
        `DELETE FROM ${tables.documentRevisions} WHERE session_id = $1 AND document_id = ANY($2::bigint[])`,
        [sessionId, [...this.#cleared]],
      );
    }
    await insertMultiRow(
      executor,
      tables.documentRevisions,
      ["session_id", "document_id", "seq", "kind", "version", "content"],
      [...this.#revisions.values()].flat(),
    );

    this.#recordIds.clear();
    this.#conversations.length = 0;
    this.#entries.length = 0;
    this.#tasks.clear();
    this.#submissions.clear();
    this.#documents.clear();
    this.#cleared.clear();
    this.#revisions.clear();
  }
}

export interface PostgresStorageOptions {
  readonly sessionId?: string;
  readonly schema?: string;
  readonly prefix?: string;
  readonly migrate?: boolean;
  readonly ownPool?: boolean;
}

/** PostgreSQL implementation of the Pi Durable Storage contract. */
export class PostgresStorage implements Storage {
  private readonly pool: Pool;
  private readonly schema: PostgresSchemaIdentifiers;
  private readonly sessionId: string;
  private readonly ownPool: boolean;
  private nextId: number;
  private closed = false;
  private closing?: Promise<void>;
  private admittedReads = 0;
  private readsDrained?: () => void;

  private constructor(
    pool: Pool,
    schema: PostgresSchemaIdentifiers,
    sessionId: string,
    nextId: number,
    ownPool: boolean,
  ) {
    this.pool = pool;
    this.schema = schema;
    this.sessionId = sessionId;
    this.nextId = nextId;
    this.ownPool = ownPool;
  }

  static async open(
    pool: Pool,
    options: PostgresStorageOptions = {},
  ): Promise<PostgresStorage> {
    const schema = createPostgresSchema(
      options.schema ?? "pi_durable",
      options.prefix ?? "",
    );
    const sessionId = options.sessionId ?? "default";
    if (options.migrate !== false) {
      await applyPostgresMigrations(pool, schema);
    }
    await pool.query(
      `INSERT INTO ${schema.tables.durableMetadata} (session_id, next_id, next_seq)
       VALUES ($1, 2, 1)
       ON CONFLICT (session_id) DO NOTHING`,
      [sessionId],
    );
    const { rows } = await pool.query<{
      next_id: string | number;
      next_seq: number;
    }>(
      `SELECT next_id, next_seq FROM ${schema.tables.durableMetadata} WHERE session_id = $1`,
      [sessionId],
    );
    const metadata = rows[0];
    if (!metadata) {
      throw new Error("Durable PostgreSQL metadata is missing");
    }
    return new PostgresStorage(
      pool,
      schema,
      sessionId,
      Number(metadata.next_id),
      options.ownPool === true,
    );
  }

  async commit(
    batches: readonly (readonly StorageWrite[])[],
    receive: (index: number, seq: Seq) => void,
  ): Promise<CommitResult> {
    this.assertOpen();
    const seqs: Seq[] = [];
    let refused: { error: unknown } | undefined;
    let candidateNextId = this.nextId;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [
          `pi_durable:${this.schema.schema}:${this.schema.prefix}:${this.sessionId}`,
        ],
      );
      const { rows: metaRows } = await client.query<{
        next_id: string | number;
        next_seq: number;
      }>(
        `SELECT next_id, next_seq FROM ${this.schema.tables.durableMetadata} WHERE session_id = $1 FOR UPDATE`,
        [this.sessionId],
      );
      const metadata = metaRows[0];
      if (!metadata) {
        throw new Error("Durable PostgreSQL metadata is missing");
      }
      let next = Number(metadata.next_seq);
      const state = await CommitState.read(
        client,
        this.schema.tables,
        this.sessionId,
        batches,
      );
      const pending = new PendingWrites();

      for (const writes of batches) {
        const checked = await this.checkBatch(client, state, pending, writes);
        if ("refused" in checked) {
          refused = { error: checked.refused };
          break;
        }
        const seq = seqFromNumber(next++);
        state.apply(writes, checked.actions, seq);
        pending.add(this.sessionId, writes, checked.actions, seq, state);
        seqs.push(seq);
        candidateNextId = Math.max(
          candidateNextId,
          this.candidateNextId(writes),
        );
      }

      await pending.flush(client, this.schema.tables, this.sessionId);
      if (seqs.length > 0) {
        await client.query(
          `UPDATE ${this.schema.tables.durableMetadata}
           SET next_id = $2, next_seq = $3
           WHERE session_id = $1`,
          [
            this.sessionId,
            Math.max(Number(metadata.next_id), candidateNextId),
            next,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    this.nextId = Math.max(this.nextId, candidateNextId);
    for (const [index, seq] of seqs.entries()) {
      receive(index, seq);
    }
    return refused === undefined
      ? { stored: seqs.length }
      : { stored: seqs.length, refused: refused.error };
  }

  private async checkBatch(
    client: PoolClient,
    state: CommitState,
    pending: PendingWrites,
    writes: readonly StorageWrite[],
  ): Promise<
    { actions: Map<DocumentId, DocumentAction> } | { refused: unknown }
  > {
    let actions: Map<DocumentId, DocumentAction>;
    try {
      actions = prepareDocumentActions(writes);
      state.check(writes, actions);
    } catch (error) {
      return { refused: error };
    }
    if (![...actions.values()].some((action) => action.copy !== undefined)) {
      return { actions };
    }
    await pending.flush(client, this.schema.tables, this.sessionId);
    const calls = { failed: false };
    const watched: PgExecutor = {
      query: async (text, values) => {
        try {
          return await client.query(text, values);
        } catch (error) {
          calls.failed = true;
          throw error;
        }
      },
    };
    try {
      await this.resolveCopies(watched, actions);
    } catch (error) {
      if (calls.failed) throw error;
      return { refused: error };
    }
    return { actions };
  }

  async mintId<I extends Id<string>>(): Promise<I> {
    this.assertOpen();
    if (!Number.isSafeInteger(this.nextId)) {
      throw new Error("ID space is exhausted");
    }
    return idFromNumber<I>(this.nextId++);
  }

  async conversation(
    id: ConversationId,
  ): Promise<ConversationRecord | undefined> {
    this.assertOpen();
    return this.readConversation(id);
  }

  async scanConversations(
    query: ConversationQuery,
    limit: number,
    cursor: Cursor | undefined,
  ): Promise<Page<ConversationRecord, Cursor>> {
    this.assertOpen();
    const start = scanStart(query.order, cursor, "ascending");
    const direction = start.order === "ascending" ? "ASC" : "DESC";
    const op = start.order === "ascending" ? ">" : "<";
    const bound =
      start.after ??
      (start.order === "ascending" ? -1 : Number.MAX_SAFE_INTEGER);
    const clauses = ["session_id = $1", `id ${op} $2`];
    const params: unknown[] = [this.sessionId, bound];

    if (query.ownerConversationId !== undefined) {
      params.push(query.ownerConversationId);
      clauses.push(`owner_conversation_id = $${params.length}`);
    }
    if (query.ownerTaskId !== undefined) {
      params.push(query.ownerTaskId);
      clauses.push(`owner_task_id = $${params.length}`);
    }
    params.push(limit + 1);
    const { rows } = await this.pool.query<{ record: string }>(
      `SELECT record FROM ${this.schema.tables.conversations}
       WHERE ${clauses.join(" AND ")}
       ORDER BY id ${direction}
       LIMIT $${params.length}`,
      params,
    );
    return page(
      rows.map((row) => parseJson<ConversationRecord>(row.record)),
      limit,
      start.order,
    );
  }

  entry(
    id: EntryId,
    context: Context,
  ): Promise<
    { readonly entry: EntryRecord; readonly commitSeq: Seq } | undefined
  >;
  entry(
    conversationId: ConversationId,
    id: EntryId,
    context: Context,
  ): Promise<
    { readonly entry: EntryRecord; readonly commitSeq: Seq } | undefined
  >;
  entry(
    idOrConversationId: EntryId | ConversationId,
    idOrContext: EntryId | Context,
    context?: Context,
  ): Promise<
    { readonly entry: EntryRecord; readonly commitSeq: Seq } | undefined
  > {
    return this.admitRead(() =>
      this.readEntry(idOrConversationId, idOrContext, context),
    );
  }

  findLatestHeadMarker(
    conversationId: ConversationId,
    atOrBeforeEntryId: EntryId | undefined,
  ): Promise<(EntryRecord & { readonly head: EntryId }) | undefined> {
    return this.admitRead(() =>
      this.readLatestHeadMarker(conversationId, atOrBeforeEntryId),
    );
  }

  scanEntries(
    query: EntryQuery,
    limit: number,
    cursor: Cursor | undefined,
  ): Promise<Page<EntryRecord, Cursor>> {
    return this.admitRead(() => this.readEntries(query, limit, cursor));
  }

  private async readEntry(
    idOrConversationId: EntryId | ConversationId,
    idOrContext: EntryId | Context,
    context?: Context,
  ): Promise<
    { readonly entry: EntryRecord; readonly commitSeq: Seq } | undefined
  > {
    const id =
      context === undefined
        ? idFromNumber<EntryId>(idOrConversationId)
        : typeof idOrContext === "number"
          ? idFromNumber<EntryId>(idOrContext)
          : undefined;
    if (id === undefined) {
      throw new StorageRequestError("Storage.entry() requires an entry ID");
    }
    let conversation: ConversationRecord | undefined;
    if (context !== undefined) {
      const conversationId = idFromNumber<ConversationId>(idOrConversationId);
      conversation = await this.readConversation(conversationId);
      if (conversation === undefined) {
        throw new StorageRequestError(
          `Unknown conversation: ${conversationId}`,
        );
      }
    }
    const { rows } = await this.pool.query<{
      record: string;
      commit_seq: number;
    }>(
      `SELECT record, commit_seq FROM ${this.schema.tables.entries} WHERE session_id = $1 AND id = $2`,
      [this.sessionId, id],
    );
    const row = rows[0];
    if (row === undefined) return undefined;
    const entry = parseJson<EntryRecord>(row.record);
    if (conversation !== undefined) {
      let upperEntryId = Number.POSITIVE_INFINITY;
      while (conversation.id !== entry.conversationId) {
        if (conversation.parent === undefined) return undefined;
        upperEntryId = Math.min(upperEntryId, conversation.parent.at);
        conversation = (await this.readConversation(
          conversation.parent.conversationId,
        ))!;
      }
      if (entry.id > upperEntryId) return undefined;
    }
    return { entry, commitSeq: seqFromNumber(Number(row.commit_seq)) };
  }

  private async readLatestHeadMarker(
    conversationId: ConversationId,
    atOrBeforeEntryId: EntryId | undefined,
  ): Promise<(EntryRecord & { readonly head: EntryId }) | undefined> {
    let conversation = await this.readConversation(conversationId);
    if (conversation === undefined) {
      throw new StorageRequestError(`Unknown conversation: ${conversationId}`);
    }
    let upper = atOrBeforeEntryId;
    while (true) {
      const { rows } =
        upper === undefined
          ? await this.pool.query<{ record: string }>(
              `SELECT record FROM ${this.schema.tables.entries}
               WHERE session_id = $1 AND conversation_id = $2 AND head IS NOT NULL
               ORDER BY id DESC LIMIT 1`,
              [this.sessionId, conversation.id],
            )
          : await this.pool.query<{ record: string }>(
              `SELECT record FROM ${this.schema.tables.entries}
               WHERE session_id = $1 AND conversation_id = $2 AND head IS NOT NULL AND id <= $3
               ORDER BY id DESC LIMIT 1`,
              [this.sessionId, conversation.id, upper],
            );
      const row = rows[0];
      if (row !== undefined) {
        return parseJson<EntryRecord & { readonly head: EntryId }>(row.record);
      }
      if (conversation.parent === undefined) return undefined;
      upper =
        upper === undefined
          ? conversation.parent.at
          : (Math.min(upper, conversation.parent.at) as EntryId);
      conversation = (await this.readConversation(
        conversation.parent.conversationId,
      ))!;
    }
  }

  private async readEntries(
    query: EntryQuery,
    limit: number,
    cursor: Cursor | undefined,
  ): Promise<Page<EntryRecord, Cursor>> {
    const { order, after } = scanStart(query.order, cursor, "descending");
    if (order === "ascending") {
      return this.readEntriesAscending(query, limit, after);
    }
    let conversation = await this.readConversation(query.conversationId);
    if (conversation === undefined) {
      throw new StorageRequestError(
        `Unknown conversation: ${query.conversationId}`,
      );
    }
    let upper: number | undefined = query.maxEntryId;
    if (after !== undefined) {
      upper = Math.min(upper ?? Number.MAX_SAFE_INTEGER, after - 1);
    }
    const values: EntryRecord[] = [];
    while (true) {
      const clauses = ["session_id = $1", "conversation_id = $2"];
      const params: unknown[] = [this.sessionId, conversation.id];
      if (query.minEntryId !== undefined) {
        params.push(query.minEntryId);
        clauses.push(`id >= $${params.length}`);
      }
      if (upper !== undefined) {
        params.push(upper);
        clauses.push(`id <= $${params.length}`);
      }
      params.push(limit + 1 - values.length);
      const { rows } = await this.pool.query<{ record: string }>(
        `SELECT record FROM ${this.schema.tables.entries}
         WHERE ${clauses.join(" AND ")}
         ORDER BY id DESC
         LIMIT $${params.length}`,
        params,
      );
      values.push(...rows.map((row) => parseJson<EntryRecord>(row.record)));
      if (values.length > limit || conversation.parent === undefined) break;
      upper =
        upper === undefined
          ? conversation.parent.at
          : Math.min(upper, conversation.parent.at);
      if (query.minEntryId !== undefined && upper < query.minEntryId) break;
      conversation = (await this.readConversation(
        conversation.parent.conversationId,
      ))!;
    }
    return page(values, limit, "descending");
  }

  private async readEntriesAscending(
    query: EntryQuery,
    limit: number,
    after: number | undefined,
  ): Promise<Page<EntryRecord, Cursor>> {
    const segments: Array<{
      conversationId: ConversationId;
      upper: number | undefined;
    }> = [];
    let conversation = await this.readConversation(query.conversationId);
    if (conversation === undefined) {
      throw new StorageRequestError(
        `Unknown conversation: ${query.conversationId}`,
      );
    }
    let upper: number | undefined = query.maxEntryId;
    while (true) {
      segments.push({ conversationId: conversation.id, upper });
      if (conversation.parent === undefined) break;
      upper =
        upper === undefined
          ? conversation.parent.at
          : Math.min(upper, conversation.parent.at);
      if (query.minEntryId !== undefined && upper < query.minEntryId) break;
      conversation = (await this.readConversation(
        conversation.parent.conversationId,
      ))!;
    }
    let lower: number | undefined = query.minEntryId;
    if (after !== undefined) {
      lower = Math.max(lower ?? after + 1, after + 1);
    }
    const values: EntryRecord[] = [];
    for (const segment of segments.reverse()) {
      const clauses = ["session_id = $1", "conversation_id = $2"];
      const params: unknown[] = [this.sessionId, segment.conversationId];
      if (lower !== undefined) {
        params.push(lower);
        clauses.push(`id >= $${params.length}`);
      }
      if (segment.upper !== undefined) {
        params.push(segment.upper);
        clauses.push(`id <= $${params.length}`);
      }
      params.push(limit + 1 - values.length);
      const { rows } = await this.pool.query<{ record: string }>(
        `SELECT record FROM ${this.schema.tables.entries}
         WHERE ${clauses.join(" AND ")}
         ORDER BY id ASC
         LIMIT $${params.length}`,
        params,
      );
      values.push(...rows.map((row) => parseJson<EntryRecord>(row.record)));
      if (values.length > limit) break;
    }
    return page(values, limit, "ascending");
  }

  async task(
    id: TaskId,
  ): Promise<TaskRecord<JsonValue, JsonValue, JsonValue> | undefined> {
    this.assertOpen();
    const { rows } = await this.pool.query<{ record: string }>(
      `SELECT record FROM ${this.schema.tables.tasks} WHERE session_id = $1 AND id = $2`,
      [this.sessionId, id],
    );
    return rows[0] === undefined
      ? undefined
      : parseJson<TaskRecord<JsonValue, JsonValue, JsonValue>>(rows[0].record);
  }

  async scanTasks(
    query: TaskQuery,
    limit: number,
    cursor: Cursor | undefined,
  ): Promise<Page<TaskRecord<JsonValue, JsonValue, JsonValue>, Cursor>> {
    this.assertOpen();
    const start = scanStart(query.order, cursor, "ascending");
    const direction = start.order === "ascending" ? "ASC" : "DESC";
    const op = start.order === "ascending" ? ">" : "<";
    const bound =
      start.after ??
      (start.order === "ascending" ? -1 : Number.MAX_SAFE_INTEGER);
    const clauses = ["session_id = $1", `id ${op} $2`];
    const params: unknown[] = [this.sessionId, bound];

    if (query.conversationId !== undefined) {
      params.push(query.conversationId);
      clauses.push(`conversation_id = $${params.length}`);
    }
    if (query.kind !== undefined) {
      params.push(encodeIndexedString(query.kind));
      clauses.push(`kind = $${params.length}`);
    }
    if (query.status !== undefined) {
      params.push(query.status);
      clauses.push(`status = $${params.length}`);
    }
    if (query.abortRequested !== undefined) {
      params.push(query.abortRequested ? 1 : 0);
      clauses.push(`abort_requested = $${params.length}`);
    }
    if (query.background !== undefined) {
      params.push(query.background ? 1 : 0);
      clauses.push(`background = $${params.length}`);
    }
    params.push(limit + 1);
    const { rows } = await this.pool.query<{ record: string }>(
      `SELECT record FROM ${this.schema.tables.tasks}
       WHERE ${clauses.join(" AND ")}
       ORDER BY id ${direction}
       LIMIT $${params.length}`,
      params,
    );
    return page(
      rows.map((row) =>
        parseJson<TaskRecord<JsonValue, JsonValue, JsonValue>>(row.record),
      ),
      limit,
      start.order,
    );
  }

  async submission(id: SubmissionId): Promise<SubmissionRecord | undefined> {
    this.assertOpen();
    const { rows } = await this.pool.query<{ record: string }>(
      `SELECT record FROM ${this.schema.tables.submissions} WHERE session_id = $1 AND id = $2`,
      [this.sessionId, id],
    );
    return rows[0] === undefined
      ? undefined
      : parseJson<SubmissionRecord>(rows[0].record);
  }

  async scanSubmissions(
    query: SubmissionQuery,
    limit: number,
    cursor: Cursor | undefined,
  ): Promise<Page<SubmissionRecord, Cursor>> {
    this.assertOpen();
    const start = scanStart(query.order, cursor, "ascending");
    const direction = start.order === "ascending" ? "ASC" : "DESC";
    const op = start.order === "ascending" ? ">" : "<";
    const bound =
      start.after ??
      (start.order === "ascending" ? -1 : Number.MAX_SAFE_INTEGER);
    const clauses = ["session_id = $1", `id ${op} $2`];
    const params: unknown[] = [this.sessionId, bound];

    if (query.conversationId !== undefined) {
      params.push(query.conversationId);
      clauses.push(`conversation_id = $${params.length}`);
    }
    if (query.status !== undefined) {
      params.push(query.status);
      clauses.push(`status = $${params.length}`);
    }
    params.push(limit + 1);
    const { rows } = await this.pool.query<{ record: string }>(
      `SELECT record FROM ${this.schema.tables.submissions}
       WHERE ${clauses.join(" AND ")}
       ORDER BY id ${direction}
       LIMIT $${params.length}`,
      params,
    );
    return page(
      rows.map((row) => parseJson<SubmissionRecord>(row.record)),
      limit,
      start.order,
    );
  }

  async submissionByRequest(
    conversationId: ConversationId,
    requestId: string,
  ): Promise<SubmissionRecord | undefined> {
    this.assertOpen();
    const { rows } = await this.pool.query<{ record: string }>(
      `SELECT record FROM ${this.schema.tables.submissions}
       WHERE session_id = $1 AND conversation_id = $2 AND request_id = $3`,
      [this.sessionId, conversationId, encodeIndexedString(requestId)],
    );
    return rows[0] === undefined
      ? undefined
      : parseJson<SubmissionRecord>(rows[0].record);
  }

  async findDocument(
    address: DocumentAddress,
    at: DocumentPoint,
  ): Promise<DocumentRecord | undefined> {
    this.assertOpen();
    const parts = addressParts(address);
    const sql =
      at === "current"
        ? `SELECT record FROM ${this.schema.tables.documents}
           WHERE session_id = $1 AND kind = $2 AND scope_kind = $3 AND owner_id = $4 AND family = $5 AND key_value = $6
             AND retired_at IS NULL
           ORDER BY created_at DESC LIMIT 1`
        : `SELECT record FROM ${this.schema.tables.documents}
           WHERE session_id = $1 AND kind = $2 AND scope_kind = $3 AND owner_id = $4 AND family = $5 AND key_value = $6
             AND created_at <= $7 AND (retired_at IS NULL OR retired_at > $7)
           ORDER BY created_at DESC LIMIT 1`;
    const params: unknown[] = [
      this.sessionId,
      parts.kind,
      parts.scopeKind,
      parts.ownerId,
      parts.family,
      parts.keyValue,
    ];
    if (at !== "current") params.push(at);
    const { rows } = await this.pool.query<{ record: string }>(sql, params);
    return rows[0] === undefined
      ? undefined
      : parseJson<DocumentRecord>(rows[0].record);
  }

  async document(
    id: DocumentId,
    at: DocumentPoint,
  ): Promise<StoredDocument | undefined> {
    this.assertOpen();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      const result = await this.materializeDocument(client, id, at);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async scanDocuments(
    query: DocumentQuery,
    limit: number,
    cursor: Cursor | undefined,
  ): Promise<Page<DocumentRecord, Cursor>> {
    this.assertOpen();
    const scope = scopeColumns(query.scope);
    const clauses = [
      "session_id = $1",
      "scope_kind = $2",
      "owner_id = $3",
      "id > $4",
    ];
    const params: unknown[] = [
      this.sessionId,
      scope.scopeKind,
      scope.ownerId,
      cursorId(cursor) ?? -1,
    ];
    if (query.kind !== undefined) {
      params.push(encodeIndexedString(query.kind));
      clauses.push(`kind = $${params.length}`);
    }
    if (query.at === "current") {
      clauses.push("retired_at IS NULL");
    } else {
      params.push(query.at);
      clauses.push(
        `created_at <= $${params.length}`,
        `(retired_at IS NULL OR retired_at > $${params.length})`,
      );
    }
    params.push(limit + 1);
    const { rows } = await this.pool.query<{ record: string }>(
      `SELECT record FROM ${this.schema.tables.documents}
       WHERE ${clauses.join(" AND ")}
       ORDER BY id ASC
       LIMIT $${params.length}`,
      params,
    );
    return page(
      rows.map((row) => parseJson<DocumentRecord>(row.record)),
      limit,
    );
  }

  close(): Promise<void> {
    if (this.closing === undefined) {
      this.closed = true;
      this.closing = this.closeDatabase();
    }
    return this.closing;
  }

  private async closeDatabase(): Promise<void> {
    if (this.admittedReads > 0) {
      await new Promise<void>((resolve) => {
        this.readsDrained = resolve;
      });
    }
    if (this.ownPool) {
      await this.pool.end();
    }
  }

  private async admitRead<T>(read: () => Promise<T>): Promise<T> {
    this.assertOpen();
    this.admittedReads++;
    try {
      return await read();
    } finally {
      if (--this.admittedReads === 0) {
        this.readsDrained?.();
      }
    }
  }

  private async readConversation(
    id: ConversationId,
  ): Promise<ConversationRecord | undefined> {
    const { rows } = await this.pool.query<{ record: string }>(
      `SELECT record FROM ${this.schema.tables.conversations} WHERE session_id = $1 AND id = $2`,
      [this.sessionId, id],
    );
    return rows[0] === undefined
      ? undefined
      : parseJson<ConversationRecord>(rows[0].record);
  }

  private async materializeDocument(
    executor: PgExecutor,
    id: DocumentId,
    at: DocumentPoint,
  ): Promise<StoredDocument | undefined> {
    const { rows } = await executor.query<{ record: string }>(
      `SELECT record FROM ${this.schema.tables.documents} WHERE session_id = $1 AND id = $2`,
      [this.sessionId, id],
    );
    const row = rows[0];
    if (row === undefined) return undefined;
    const record = parseJson<DocumentRecord>(row.record);
    if (at !== "current" && isCurrentOnly(record)) {
      throw new StorageRequestError(
        `Document ${id} does not retain historical content`,
      );
    }
    if (!isAliveAt(record, at)) return undefined;
    const upper = at === "current" ? Number.MAX_SAFE_INTEGER : at;
    const { rows: baseRows } = await executor.query<{
      seq: number;
      kind: string;
      version: number;
      content: string;
    }>(
      `SELECT seq, kind, version, content FROM ${this.schema.tables.documentRevisions}
       WHERE session_id = $1 AND document_id = $2 AND kind = 'base' AND seq <= $3
       ORDER BY seq DESC LIMIT 1`,
      [this.sessionId, id, upper],
    );
    const base = baseRows[0];
    if (base === undefined) {
      throw new Error(`Document ${id} is missing a required base`);
    }
    let value = parseJson<JsonObject>(base.content);
    const { rows: tail } = await executor.query<{
      seq: number;
      kind: string;
      version: number;
      content: string;
    }>(
      `SELECT seq, kind, version, content FROM ${this.schema.tables.documentRevisions}
       WHERE session_id = $1 AND document_id = $2 AND seq > $3 AND seq <= $4
       ORDER BY seq ASC`,
      [this.sessionId, id, Number(base.seq), upper],
    );
    for (const revision of tail) {
      if (
        revision.kind !== "delta" ||
        Number(revision.version) !== Number(base.version)
      ) {
        throw new Error(
          `Document ${id} crosses a stored version boundary without a base`,
        );
      }
      value = apply(value, parseJson<readonly Op[]>(revision.content));
    }
    return {
      record,
      version: Number(base.version),
      value,
      deltasSinceBase: tail.length,
    };
  }

  private candidateNextId(writes: readonly StorageWrite[]): number {
    let nextId = this.nextId;
    for (const write of writes) {
      const id = claimOf(write)?.id;
      if (id !== undefined) nextId = Math.max(nextId, id + 1);
    }
    return nextId;
  }

  private async resolveCopies(
    executor: PgExecutor,
    actions: Map<DocumentId, DocumentAction>,
  ): Promise<void> {
    for (const [id, action] of actions) {
      if (action.copy === undefined) continue;
      try {
        const stored = await this.materializeDocument(
          executor,
          action.copy.id,
          action.copy.at,
        );
        if (stored === undefined) {
          throw new Error(
            `Fork source document ${action.copy.id} cannot be read`,
          );
        }
        const create = action.create!;
        if (
          stored.record.scope.kind !== "conversation" ||
          create.scope.kind !== "conversation" ||
          stored.record.kind !== create.kind ||
          stored.record.key !== create.key ||
          stored.record.history !== create.history ||
          stored.record.fork !== create.fork
        ) {
          throw new Error(
            `Fork source document ${action.copy.id} does not match the copied record`,
          );
        }
        action.content = {
          kind: "base",
          version: stored.version,
          value: stored.value,
        };
      } catch (error) {
        throw new Error(`Document copy ${id} was rejected`, { cause: error });
      }
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error("PostgresStorage is closed");
    }
  }
}

export async function openPostgresStorage(
  pool: Pool,
  options?: PostgresStorageOptions,
): Promise<PostgresStorage> {
  return PostgresStorage.open(pool, options);
}
