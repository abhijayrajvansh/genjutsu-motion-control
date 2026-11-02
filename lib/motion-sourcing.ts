export const MOTION_SOURCING_FIELDS = [
  { id: "openingFrame", label: "Opening frame source", description: "Opening pose and framing guidance. Model-dependent; not a strict first-frame lock.", defaultSource: "video" },
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
};
export const MOTION_PROMPT_LIMIT = 2500;

export function isVideoMotionField(field: MotionSourcingField) {
  return field === "bodyMovement" || field === "expressions" || field === "hairMovement" || field === "timing";
}

export function fixedMotionSource(field: MotionSourcingField): MotionSource | undefined {
  if (field === "identity") return "image";
  return isVideoMotionField(field) ? "video" : undefined;
}

export function readMotionSourcing(value: string): MotionSourcingSettings {
  let parsed: Partial<MotionSourcingSettings> | null = null;
  try { parsed = JSON.parse(value); } catch { /* Use defaults for invalid saved settings. */ }
  const sources = Object.fromEntries(MOTION_SOURCING_FIELDS.map(field => {
    const source = parsed?.sources?.[field.id];
    return [field.id, fixedMotionSource(field.id)
      ?? (source === "image" || source === "video" ? source : field.defaultSource)];
  })) as MotionSources;
  // Older saved action descriptions are deliberately ignored, while appearance choices survive.
  return { sources };
}

export function buildMotionSourcePrompt(sources: MotionSources) {
  const groups: { verb: string; fields: { id: MotionSourcingField; text: string }[] }[] = [
    { verb: "Keep", fields: [
      { id: "body", text: "body proportions and skin tone" },
      { id: "clothing", text: "clothing and skin coverage" },
      { id: "accessories", text: "accessories" },
      { id: "hairAppearance", text: "hair color, length and texture" },
    ] },
    { verb: "Match", fields: [
      { id: "background", text: "background" },
      { id: "lighting", text: "lighting" },
      { id: "camera", text: sources.camera === "image" ? "camera framing and angle (fixed camera)" : "camera movement" },
    ] },
  ];
  const assignments = groups.flatMap(group => (["image", "video"] as const).map(source => {
    const parts = group.fields.filter(field => sources[field.id] === source).map(field => field.text);
    if (!parts.length) return "";
    return `${group.verb} ${parts.join(", ")} from ${source === "image" ? "Image1 @Image1" : "Video1 @Video1"} only.`;
  })).filter(Boolean);
  return [
    "A photorealistic video of the character from Image1 @Image1.",
    "FACIAL IDENTITY — HIGHEST PRIORITY: Always use Image1 @Image1's facial identity in every frame, including the first. Preserve its face shape, eyes, eyebrows, nose, lips and jawline through all angles and expressions. Use Video1 @Video1 only for facial motion; never the face from Video1 @Video1. Do not blend faces or drift toward the video's identity.",
    ...assignments,
    "The character performs the exact same movements, gestures, actions, expressions and hair motion as Video1 @Video1, with the same timing.",
    sources.openingFrame === "image"
      ? "The first frame exactly matches Image1 @Image1."
      : "The first frame follows Video1 @Video1's opening pose and framing, with Image1 @Image1's face.",
    "One continuous shot. Keep the same face throughout; no face blending.",
  ].join("\n\n");
}
