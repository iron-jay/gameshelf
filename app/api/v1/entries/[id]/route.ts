import { ApiError, json, uuidParam, withUser } from "@/lib/api";
import { cardFrom } from "@/lib/api/cards";
import { entryDetail } from "@/lib/entries/read";

export const dynamic = "force-dynamic";

/** One entry: its card, plus the review, the private flag and its tags. */
export const GET = withUser<{ id: string }>(async (_request, { params, user }) => {
  const id = uuidParam((await params).id, "entry");
  const detail = await entryDetail(user.id, id);
  if (!detail) throw new ApiError("not_found", "No such entry.");

  return json({
    ...cardFrom(detail.row),
    review: detail.review,
    reviewHasSpoilers: detail.reviewHasSpoilers,
    isPrivate: detail.isPrivate,
    tags: detail.tags,
  });
});
