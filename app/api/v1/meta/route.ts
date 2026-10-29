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
    // the phone queued.
    features: ["completion", "platforms", "dated-changes"],
  }),
);
