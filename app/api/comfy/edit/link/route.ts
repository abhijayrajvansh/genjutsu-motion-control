import { fetchImageLink } from "@/lib/server/fetch-image";
import { IMAGE_TYPES } from "@/lib/server/image-edit-store";
import { ApiError, errorResponse, sameOrigin } from "@/lib/server/kie";
export const runtime = "nodejs";
export const maxDuration = 60;

// Download a pasted image link on the server and hand the bytes back to the picker.
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    let body: { url?: unknown };
    try {
      body = await req.json();
    } catch {
      throw new ApiError("Paste an image link.");
    }
    if (typeof body.url !== "string" || !body.url.trim()) throw new ApiError("Paste an image link.");
    const image = await fetchImageLink(body.url);
    return new Response(Buffer.from(image.bytes), {
      headers: {
        "Content-Type": image.type,
        "Cache-Control": "no-store",
        "X-Image-Name": encodeURIComponent(image.name),
        "X-Image-Extension": IMAGE_TYPES[image.type] || "jpg",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
