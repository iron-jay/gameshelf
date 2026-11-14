import { publicRoute, json } from "@/lib/api";
import { authDisabled } from "@/lib/auth";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/status";

export const dynamic = "force-dynamic";

/**
 * What the phone needs before it can do anything else: which app this is, what
 * its shelves are called, and whether it has to sign in at all. Public because
 * it is asked before there is a token, and it says nothing about anyone's shelf.
 */
export const GET = publicRoute(async () =>
  json({
    app: "gameshelf",
    apiVersion: 1,
    authRequired: !authDisabled(),
    shelves: STATUS_ORDER.map((key) => ({ key, label: STATUS_LABELS[key] })),
    // "dated-changes": PATCH /entries takes the day a change was made (`on`),
    // a versionId add `finishedOn`, and entries carry `updatedAt`, for changes
    // the phone queued. "add-platform": POST /works/{slug}/platforms. "series":
    // GET /series and the series routes under it. "page-controls": PATCH
    // /works/{slug} takes `series`, and Delete with its removal summaries.
    // "edit-details": the edit pages' fields (`/works/{slug}/details`,
    // `/versions/{id}/details`) and the art page (`/works/{slug}/art`).
    // "add-by-hand": the add-version form (`/versions/new`, `POST
    // /versions`) and Add DLC (`/works/{slug}/dlc`).
    features: ["completion", "platforms", "dated-changes", "add-platform", "series", "page-controls", "edit-details", "add-by-hand"],
  }),
);
