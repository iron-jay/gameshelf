"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { shelveOffShelfGame } from "@/lib/off-shelf";
import { isStatus } from "@/lib/status";
import { isUuid } from "@/lib/uuid";

export async function shelveGame(formData: FormData): Promise<void> {
  const user = await requireUser();
  const workId = String(formData.get("workId") ?? "");
  const status = formData.get("status");
  if (!isUuid(workId) || !isStatus(status)) return;

  if (await shelveOffShelfGame(user.id, workId, status)) {
    revalidatePath("/off-shelf");
    revalidatePath("/");
  }
}
