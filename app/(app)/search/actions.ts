"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { addFromIgdb } from "@/lib/entries/add";
import { IgdbError } from "@/lib/igdb/types";
import { isStatus, type Status } from "@/lib/status";

export type AddState = { ok: boolean; message: string } | null;

export async function addToShelf(_prev: AddState, formData: FormData): Promise<AddState> {
  const user = await requireUser();

  const igdbId = Number(formData.get("igdbId"));
  if (!Number.isInteger(igdbId) || igdbId <= 0) {
    return { ok: false, message: "Bad request." };
  }

  // Backlog is the fallback the column already defaults to, so a form that says
  // nothing about status behaves exactly as it did before there was a picker.
  const asked = formData.get("status");
  const status: Status = isStatus(asked) ? asked : "backlog";

  let result;
  try {
    result = await addFromIgdb(user.id, {
      igdbId,
      platformId: Number(formData.get("platformId")),
      status,
    });
  } catch (err) {
    // Only IGDB's failures are reported here; a database error is a real bug
    // and goes to the error page rather than being dressed up as IGDB's.
    if (!(err instanceof IgdbError)) throw err;
    return { ok: false, message: `IGDB request failed (${err.status ?? "no response"}).` };
  }

  if (result.kind === "gone") {
    return { ok: false, message: "IGDB no longer has that game." };
  }

  revalidatePath("/");

  const where = result.keptOn ? `, on ${result.keptOn}` : "";

  return result.kind === "added"
    ? { ok: true, message: `Added to shelf${where}` }
    : { ok: true, message: `Already on your shelf${where}` };
}
