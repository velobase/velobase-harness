import type { Interaction } from "@prisma/client";
import { AgentExecutionError } from "@/server/agents/registry";

/** Follow parent links, never combine sibling branches by timestamp. */
export function interactionPath(
  interactions: Interaction[],
  head: string | null,
) {
  const rows = new Map(interactions.map((row) => [row.id, row]));
  const path: Interaction[] = [];
  const seen = new Set<string>();
  let id = head;
  while (id) {
    if (seen.has(id)) throw new AgentExecutionError("INVALID_HISTORY");
    seen.add(id);
    const row = rows.get(id);
    if (!row) throw new AgentExecutionError("HISTORY_LIMIT");
    path.unshift(row);
    id = row.parentId;
  }
  return path;
}
