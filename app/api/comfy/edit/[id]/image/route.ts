import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { findEditImage, readEditJob } from "@/lib/server/image-edit-store";
import { ApiError, errorResponse } from "@/lib/server/kie";
export const runtime = "nodejs";

// Serve a saved edit result (?which=output) or one of its inputs (?which=input1..3).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await readEditJob(id);
    const query = new URL(req.url).searchParams;
    const which = query.get("which") || "output";
    if (!/^(output|input[1-3])$/.test(which)) throw new ApiError("Unknown image.");
    const image = await findEditImage(id, which);
    if (!image) throw new ApiError("This image is not available.", 404);
    const extension = image.name.split(".").pop();
    const headers: Record<string, string> = {
      "Content-Type": image.type,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    };
    if (query.get("download") === "1")
      headers["Content-Disposition"] = `attachment; filename="qwen-edit-${id.slice(0, 8)}${which === "output" ? "" : `-${which}`}.${extension}"`;
    return new Response(Readable.toWeb(createReadStream(image.file)) as ReadableStream<Uint8Array>, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}
