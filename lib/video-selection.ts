export type VideoSelection = { start: number; end: number };

function snapDuration(length: number, minimum: number, maximum: number, cap: number) {
  const limit = Math.min(maximum, cap);
  if (limit + 0.000001 < minimum) return cap;
  const wanted = Math.max(minimum, Math.min(limit, length));
  const whole = Math.round(wanted);
  // A whole second that would run past the file used to drop the final fraction.
  if (whole + 0.000001 < minimum || whole > limit + 0.000001) return limit;
  return whole;
}

export function videoSelection(
  sourceSeconds: number,
  minimum: number,
  maximum: number,
  selection?: VideoSelection,
): VideoSelection {
  if (!(sourceSeconds > 0)) return { start: 0, end: 0 };
  const requestedStart = Math.max(0, Math.min(sourceSeconds, selection?.start ?? 0));
  const room = sourceSeconds - requestedStart;
  const cap = Math.min(maximum, room);
  if (cap + 0.000001 < minimum) {
    if (sourceSeconds + 0.000001 < minimum) return { start: 0, end: sourceSeconds };
    const seconds = snapDuration(sourceSeconds, minimum, maximum, Math.min(maximum, sourceSeconds));
    const start = Math.max(0, sourceSeconds - seconds);
    return { start, end: start + seconds };
  }
  const requestedLength = selection ? selection.end - selection.start : cap;
  const seconds = snapDuration(requestedLength, minimum, maximum, cap);
  return { start: requestedStart, end: requestedStart + seconds };
}
