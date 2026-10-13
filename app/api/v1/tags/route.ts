import { json, withUser } from "@/lib/api";
import { tagsWithCounts } from "@/lib/shelf";

export const dynamic = "force-dynamic";

export const GET = withUser(async (_request, { user }) => json({ items: await tagsWithCounts(user.id) }));
