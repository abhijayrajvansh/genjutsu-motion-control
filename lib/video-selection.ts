export type VideoSelection = { start: number; end: number };

export function videoSelection(
  sourceSeconds: number,
  minimum: number,
  maximum: number,
  selection?: VideoSelection,
): VideoSelection {
  const length = Math.min(maximum, Math.floor(sourceSeconds + 0.000001));
  if (length < minimum) return { start: 0, end: sourceSeconds };
  const requestedLength = selection ? Math.round(selection.end - selection.start) : length;
  const seconds = Math.max(minimum, Math.min(length, requestedLength));
  const start = Math.max(0, Math.min(sourceSeconds - seconds, selection?.start ?? 0));
  return { start, end: start + seconds };
}
