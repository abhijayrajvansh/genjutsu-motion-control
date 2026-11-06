import { readInfluencerFace } from "@/lib/server/influencers";

export const runtime = "nodejs";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const face = await readInfluencerFace(id);
  if (!face) return Response.json({ error: "Influencer face reference not found." }, { status: 404 });
  return new Response(new Uint8Array(face.data), {
    headers: {
      "Content-Type": face.type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
