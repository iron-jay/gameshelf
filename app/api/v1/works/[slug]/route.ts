import { ApiError, json, withUser } from "@/lib/api";
import { workDetail } from "@/lib/works/read";

export const dynamic = "force-dynamic";

/** A work with its versions (and which are on your shelf) and its DLC. */
export const GET = withUser<{ slug: string }>(async (_request, { params, user }) => {
  const detail = await workDetail(user.id, (await params).slug);
  if (!detail) throw new ApiError("not_found", "No such game.");
  return json(detail);
});
