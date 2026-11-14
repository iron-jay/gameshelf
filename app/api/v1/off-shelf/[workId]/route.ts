import { revalidatePath } from "next/cache";

import { ApiError, json, readObject, withUser } from "@/lib/api";
import { shelveOffShelfGame } from "@/lib/off-shelf";
import { isStatus } from "@/lib/status";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

/** One press on Games not on your shelf: `{ shelf }` puts its one way to play there. */
export const POST = withUser<{ workId: string }>(async (request, { params, user }) => {
  const workId = (await params).workId;
  if (!isUuid(workId)) throw new ApiError("not_found", "No such game.");
  const { shelf } = await readObject(request);
  if (!isStatus(shelf)) throw new ApiError("invalid", "Choose a shelf.", { fields: { shelf: "A shelf." } });
  if (!(await shelveOffShelfGame(user.id, workId, shelf))) throw new ApiError("invalid", "Open it to choose a way to play first.");
  revalidatePath("/");
  revalidatePath("/off-shelf");
  return json({ ok: true });
});
