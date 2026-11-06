import { readFile } from "node:fs/promises";
import path from "node:path";

// Local file DB: .data/influencers/influencers.json, with images stored beside it.
// .data/ is gitignored, so influencer photos never reach the repository.
const directory = path.join(process.cwd(), ".data", "influencers");

export type Influencer = { id: string; name: string; faceRef: string };

const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export async function listInfluencers(): Promise<Influencer[]> {
  let raw: string;
  try {
    raw = await readFile(path.join(directory, "influencers.json"), "utf8");
  } catch {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  const list = parsed && typeof parsed === "object" ? (parsed as { influencers?: unknown }).influencers : null;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (item): item is Influencer =>
      !!item &&
      typeof item.id === "string" &&
      /^[a-z0-9-]+$/.test(item.id) &&
      typeof item.name === "string" &&
      typeof item.faceRef === "string",
  );
}

export async function readInfluencerFace(id: string) {
  const influencer = (await listInfluencers()).find((item) => item.id === id);
  if (!influencer) return null;
  const file = path.resolve(directory, influencer.faceRef);
  const type = IMAGE_TYPES[path.extname(file).toLowerCase()];
  if (!type || !file.startsWith(directory + path.sep)) return null;
  try {
    return { data: await readFile(file), type, name: path.basename(file) };
  } catch {
    return null;
  }
}
