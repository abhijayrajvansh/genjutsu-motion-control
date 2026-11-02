export const MOTION_SOURCING_FIELDS = [
  { id: "identity", label: "Identity and face", description: "Character identity, facial features", defaultSource: "image" },
  { id: "body", label: "Body appearance", description: "Build, proportions, skin tone", defaultSource: "image" },
  { id: "clothing", label: "Clothing", description: "Outfit, colors, fabric, skin coverage", defaultSource: "image" },
  { id: "accessories", label: "Accessories", description: "Jewelry, glasses, other worn items", defaultSource: "image" },
  { id: "hairAppearance", label: "Hair appearance", description: "Color, length, texture", defaultSource: "image" },
  { id: "bodyMovement", label: "Body and head movement", description: "Poses, gestures, movement sequence", defaultSource: "video" },
  { id: "expressions", label: "Facial expressions", description: "Expressions, gaze, mouth movements", defaultSource: "video" },
  { id: "hairMovement", label: "Hair movement", description: "Swinging, releasing, settling", defaultSource: "video" },
  { id: "background", label: "Background", description: "Location and surrounding objects", defaultSource: "video" },
  { id: "camera", label: "Camera", description: "Framing, angle, camera movement", defaultSource: "video" },
  { id: "lighting", label: "Lighting", description: "Light direction, brightness, shadows", defaultSource: "video" },
  { id: "timing", label: "Timing", description: "Action order, pace, transitions", defaultSource: "video" },
] as const;

export type MotionSource = "image" | "video";
export type MotionSourcingField = (typeof MOTION_SOURCING_FIELDS)[number]["id"];
export type MotionSources = Record<MotionSourcingField, MotionSource>;
export type MotionSourcingSettings = {
  sources: MotionSources;
  actions: Record<string, string>;
};
export const MOTION_ACTION_LIMIT = 600;
export const MOTION_PROMPT_LIMIT = 2500;

export function readMotionSourcing(value: string): MotionSourcingSettings {
  let parsed: Partial<MotionSourcingSettings> | null = null;
  try { parsed = JSON.parse(value); } catch { /* Use defaults for invalid saved settings. */ }
  const sources = Object.fromEntries(MOTION_SOURCING_FIELDS.map(field => {
    const source = parsed?.sources?.[field.id];
    return [field.id, source === "image" || source === "video" ? source : field.defaultSource];
  })) as MotionSources;
  const actions = Object.fromEntries(Object.entries(parsed?.actions ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([key, action]) => [key, action.slice(0, MOTION_ACTION_LIMIT)]));
  return { sources, actions };
}

export function buildMotionSourcePrompt(sources: MotionSources, action = "") {
  const lines = MOTION_SOURCING_FIELDS.map(field => {
    const source = sources[field.id];
    const reference = source === "image" ? "Image1 @Image1" : "Video1 @Video1";
    let instruction: string = field.description;
    if (source === "image") {
      if (field.id === "bodyMovement") instruction = "hold the pictured body and head pose; do not copy video gestures";
      if (field.id === "expressions") instruction = "hold the pictured expression, gaze and mouth pose";
      if (field.id === "hairMovement") instruction = "keep the pictured hair arrangement; do not copy video hair actions";
      if (field.id === "camera") instruction = "match the still image's framing and angle; keep the camera fixed";
      if (field.id === "timing") instruction = "hold the pictured state throughout; do not copy video action timing";
    }
    return `${field.label}: ${reference} only (${instruction}).`;
  });
  const details = action.trim().slice(0, MOTION_ACTION_LIMIT);
  return [
    "FINAL OUTPUT SOURCING\nUse only the assigned source for each component below. Exclude that component from the other input.",
    lines.join("\n"),
    details ? `CLIP-SPECIFIC ACTION\n${details}\nApply these details only where compatible with the source assignments above.` : "",
    "CONTINUITY\nKeep the selected identity, body appearance, clothing and skin coverage consistent. Preserve the selected hair color, length and texture while allowing hair arrangement to change with the selected hair action. One continuous shot, natural movement.",
  ].filter(Boolean).join("\n\n");
}
