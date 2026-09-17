import { logStatus } from "@/lib/db/schema";

export type Status = (typeof logStatus.enumValues)[number];

/**
 * The shelves, in the order a shelf reads in: wanted, waiting, being played,
 * finished.
 *
 * The column and the enum are still called `status` — this is a state machine
 * and renaming it would be a migration that bought nothing — but the interface
 * calls them shelves, because that is what they are to anyone using it. The
 * free-form ones are tags.
 *
 * Kept here rather than read off the enum so the order stays a decision rather
 * than a consequence of the order the column was written.
 */
export const STATUS_ORDER = [
  "wishlist",
  "backlog",
  "playing",
  "played",
] as const satisfies readonly Status[];

/** Takes `unknown` because most callers are handing it a raw FormData value. */
export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (logStatus.enumValues as readonly string[]).includes(value);
}
