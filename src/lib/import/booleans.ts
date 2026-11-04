import type { Cell } from "./types";

// The accepted set for "Completed". Anything else is an invalid value, never a guess.
const TRUE = new Set(["yes", "true", "1", "y", "x", "ano", "done"]);
const FALSE = new Set(["no", "false", "0", "n", "ne", ""]);

export const BOOLEAN_TRUE = [...TRUE];
export const BOOLEAN_FALSE = [...FALSE].filter(Boolean);

/** `undefined` = not a recognised value. Empty = false. */
export function parseBoolean(cell: Cell): boolean | undefined {
  if (cell === null) return false;
  if (typeof cell === "boolean") return cell;
  if (typeof cell === "number") return cell === 1 ? true : cell === 0 ? false : undefined;
  if (typeof cell !== "string") return undefined;
  const s = cell.trim().toLowerCase();
  if (TRUE.has(s)) return true;
  if (FALSE.has(s)) return false;
  return undefined;
}
