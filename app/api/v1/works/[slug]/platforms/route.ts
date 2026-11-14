import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { ApiError, json, readObject, withUser } from "@/lib/api";
import { db } from "@/lib/db";
import { works } from "@/lib/db/schema";
import { platformsInUse } from "@/lib/platforms";
import { addPlatform } from "@/lib/versions/add-platform";
import { isPlatformKind, PLATFORM_KIND_LABELS, PLATFORM_KINDS } from "@/lib/versions/platform-kinds";
import { workDetail } from "@/lib/works/read";

export const dynamic = "force-dynamic";

/** What the phone's "Add a platform" offers: the platforms already in use and the ways onto one. */
export const GET = withUser<{ slug: string }>(async () =>
  json({
    platforms: await platformsInUse(),
    kinds: PLATFORM_KINDS.map((key) => ({ key, label: PLATFORM_KIND_LABELS[key] })),
  }),
);

/**
 * `{ platform, via?, kind? }` adds a platform the game runs on, for the
 * phone's Add a platform (the web has Add version): a version named by `via`
 * (or by the platform),
 * kind `recomp` unless told otherwise, on nobody's shelf. Returns the work
 * and the new version's id; the same platform and via twice finds the first.
 */
export const POST = withUser<{ slug: string }>(async (request, { params, user }) => {
  const slug = (await params).slug;
  const body = await readObject(request);

  if (typeof body.platform !== "string" || !body.platform.trim()) {
    throw new ApiError("invalid", "Say which platform.", { fields: { platform: "Required." } });
  }
  if (body.via !== undefined && body.via !== null && typeof body.via !== "string") {
    throw new ApiError("invalid", "via is text.", { fields: { via: "Must be text or null." } });
  }
  if (body.kind !== undefined && !isPlatformKind(body.kind)) {
    throw new ApiError("invalid", "Unknown kind.", { fields: { kind: `One of ${PLATFORM_KINDS.join(", ")}.` } });
  }

  const [work] = await db.select({ id: works.id }).from(works).where(eq(works.slug, slug));
  if (!work) throw new ApiError("not_found", "No such game.");

  const result = await addPlatform(user.id, work.id, {
    platform: body.platform,
    via: (body.via as string | null | undefined) ?? null,
    kind: isPlatformKind(body.kind) ? body.kind : "recomp",
  });
  if (!result.ok) throw new ApiError("invalid", result.message);

  revalidatePath(`/work/${slug}`);

  return json(
    { versionId: result.versionId, work: await workDetail(user.id, slug) },
    { status: result.existed ? 200 : 201 },
  );
});
