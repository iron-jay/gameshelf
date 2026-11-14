import { revalidatePath } from "next/cache";

import { json, withUser } from "@/lib/api";
import { listCoverFiles } from "@/lib/covers";
import { orphanedCoverFiles, removeCoverFiles } from "@/lib/works/removal";

export const dynamic = "force-dynamic";

/** Settings → Cover art: deletes the cover files nothing points at any more. `{ removed }`. */
export const POST = withUser(async () => {
  const orphans = await orphanedCoverFiles(await listCoverFiles());
  await removeCoverFiles(orphans);
  revalidatePath("/settings");
  return json({ removed: orphans.length });
});
