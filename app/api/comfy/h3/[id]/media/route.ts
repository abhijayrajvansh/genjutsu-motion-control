import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { findH3File, readH3Job } from "@/lib/server/h3-store";
import { ApiError, errorResponse } from "@/lib/server/kie";
export const runtime = "nodejs";

// Serve a saved H3 file: ?which=output (the finished video), video (the driving video) or picture. Supports Range for seeking.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const job = await readH3Job(id);
    const query = new URL(req.url).searchParams;
    const which = query.get("which") || "output";
    if (!/^(output|video|picture)$/.test(which)) throw new ApiError("Unknown file.");
    const file = await findH3File(id, which);
    if (!file) throw new ApiError("This file is not available.", 404);
    const headers: Record<string, string> = {
      "Content-Type": file.type,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    };
    if (query.get("download") === "1") {
      const extension = file.name.split(".").pop();
      const base = `h3-${job.kind}`;
      headers["Content-Disposition"] = `attachment; filename="${base}-${id.slice(0, 8)}${which === "output" ? "" : `-${which}`}.${extension}"`;
    }
    const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
    if (range && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : file.size - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : file.size - 1;
      start = Math.max(0, start);
      end = Math.min(file.size - 1, end);
      if (start > end || start >= file.size)
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}` } });
      return new Response(Readable.toWeb(createReadStream(file.file, { start, end })) as ReadableStream<Uint8Array>, {
        status: 206,
        headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${file.size}`, "Content-Length": String(end - start + 1) },
      });
    }
    return new Response(Readable.toWeb(createReadStream(file.file)) as ReadableStream<Uint8Array>, {
      headers: { ...headers, "Content-Length": String(file.size) },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
