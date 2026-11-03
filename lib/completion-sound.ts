"use client";

let context: AudioContext | undefined;

// Short synthesized chime: rising notes for success, a falling pair for failure.
export function playCompletionSound(success: boolean) {
  try {
    context ??= new AudioContext();
    void context.resume();
    const start = context.currentTime + 0.02;
    const notes = success ? [659.25, 830.61, 987.77] : [440, 330];
    notes.forEach((frequency, index) => {
      const at = start + index * 0.14;
      const oscillator = context!.createOscillator();
      const gain = context!.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      oscillator.connect(gain).connect(context!.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.55);
    });
  } catch {
    // Audio is optional; the toast still appears.
  }
}
