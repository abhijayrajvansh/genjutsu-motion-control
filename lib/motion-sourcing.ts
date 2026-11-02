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

export function readMotionSourcing(value: string): MotionSourcingSettings {
  let parsed: Partial<MotionSourcingSettings> | null = null;
  try { parsed = JSON.parse(value); } catch { /* Use defaults for invalid saved settings. */ }
  const sources = Object.fromEntries(MOTION_SOURCING_FIELDS.map(field => {
    const source = parsed?.sources?.[field.id];
    return [field.id, isVideoMotionField(field.id) ? "video"
      : source === "image" || source === "video" ? source : field.defaultSource];
  })) as MotionSources;
  // Older saved action descriptions are deliberately ignored, while appearance choices survive.
  return { sources };
}

export function buildMotionSourcePrompt(sources: MotionSources) {
  const opening = sources.openingFrame === "image"
    ? "OPENING FRAME — Image1 @Image1\nBegin with the face, pose, outfit, background and framing of Image1 @Image1. Prioritize this opening reference at the first instant, then follow the selected appearance and scene sources below while continuing Video1 @Video1's action sequence without cuts. Do not hold the image still."
    : "OPENING FRAME — Video1 @Video1\nBegin with the opening pose and framing of the selected Video1 @Video1 segment, applying the selected character appearance. Continue its action sequence without cuts.";
  const appearance = MOTION_SOURCING_FIELDS.filter(field => field.id !== "openingFrame" && !isVideoMotionField(field.id)).map(field => {
    const source = sources[field.id];
    const reference = source === "image" ? "Image1 @Image1" : "Video1 @Video1";
    const instruction = field.id === "camera" && source === "image"
      ? "framing and angle from the image; fixed camera"
      : field.description;
    return `${field.label}: ${reference} only (${instruction}).`;
  });
  return [
    opening,
    "MOTION REFERENCE — Video1 @Video1\nUse the selected input video segment as the complete motion blueprint. Transfer its entire performance to the selected character, matching the action at each corresponding moment. Do not create a new performance.",
    "Body and head movement: Video1 @Video1 only. Follow every body, head, arm, hand and finger action, gesture, turn and interaction in the same order, direction and trajectory. Match poses, speed and pauses. Do not add, omit, reverse or replace actions.",
    "Facial expressions: Video1 @Video1 only. Match expressions, gaze, blinks and mouth movements at the corresponding moments while retaining the selected facial identity.",
    "Hair movement: Video1 @Video1 only. Follow every visible hair movement and hairstyle transition in the source, including its timing and direction. Hair arrangement may change with the action; the appearance image must not freeze it.",
    "Timing: Video1 @Video1 only. Preserve the selected segment's action order, pace, pauses and transitions from beginning to end. No added choreography or retiming.",
    `APPEARANCE AND SCENE\nUse only the assigned source for each component; exclude that component from the other input.\n${appearance.join("\n")}`,
    "CONTINUITY\nAppearance references define identity, anatomy, clothing and hair color, length and texture, not a fixed pose, expression or hairstyle. Keep the selected outfit and skin coverage consistent while the character performs the source video's actions. One continuous shot.",
  ].join("\n\n");
}
