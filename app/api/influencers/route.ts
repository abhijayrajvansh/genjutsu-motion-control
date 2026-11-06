import { listInfluencers } from "@/lib/server/influencers";

export const runtime = "nodejs";
export async function GET() {
  const influencers = (await listInfluencers()).map(({ id, name }) => ({ id, name }));
  return Response.json({ influencers }, { headers: { "Cache-Control": "no-store" } });
}
