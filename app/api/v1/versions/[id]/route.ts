import { ApiError, json, uuidParam, withUser } from "@/lib/api";
import { versionDetail } from "@/lib/works/read";

export const dynamic = "force-dynamic";

export const GET = withUser<{ id: string }>(async (_request, { params, user }) => {
  const id = uuidParam((await params).id, "version");
  const detail = await versionDetail(user.id, id);
  if (!detail) throw new ApiError("not_found", "No such version.");
  return json(detail);
});
