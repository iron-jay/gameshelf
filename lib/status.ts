import { logStatus } from "@/lib/db/schema";

export type Status = (typeof logStatus.enumValues)[number];

/**
 * The order a shelf reads in, which is not the order the enum is declared in.
 *
 * It follows a game through: wanted, waiting, being played, finished — then the
 * two ways out of that sequence. The enum's own order is the order the columns
 * were written and means nothing to anyone looking at a shelf. Every list of
 * statuses uses this one, because two orders for one set of values is worse
 * than either of them.
 */
export const STATUS_ORDER = [
  "wishlist",
  "backlog",
  "playing",
  "played",
  "dropped",
  "shelved",
] as const satisfies readonly Status[];

export function isStatus(value: string | undefined): value is Status {
  return Boolean(value) && (logStatus.enumValues as readonly string[]).includes(value!);
}
