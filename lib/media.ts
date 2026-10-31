// Browser-only media utilities. Inputs stay on this computer.
export async function trimVideo(
  blob: Blob,
  start: number,
  end: number,
): Promise<Blob> {
  if (end <= start) throw new Error("End time must be after start time.");
  const video = document.createElement("video") as HTMLVideoElement & {
    captureStream?: () => MediaStream;
  };
  const url = URL.createObjectURL(blob);
  video.src = url;
  video.preload = "auto";
  video.playsInline = true;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stream: MediaStream | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () =>
        reject(new Error("This video could not be decoded."));
    });
    if (start >= video.duration)
      throw new Error("Start time is beyond the end of the video.");
    const stopAt = Math.min(end, video.duration);
    if (start > 0) {
      video.currentTime = start;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });
    }
    if (!video.captureStream || !window.MediaRecorder)
      throw new Error("Video trimming requires Chrome or Edge.");
    stream = video.captureStream();
    const mime = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) throw new Error("This browser cannot export WebM video.");
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    const chunks: Blob[] = [];
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
      recorder.onerror = () =>
        reject(new Error("Could not record the trimmed clip."));
    });
    const stop = () => {
      if (recorder.state !== "inactive") recorder.stop();
      video.pause();
    };
    video.onended = stop;
    // Recording runs in real time and preserves the input's audio tracks.
    recorder.start(100);
    await video.play();
    timer = setInterval(() => {
      if (video.currentTime >= stopAt) stop();
    }, 30);
    return await done;
  } finally {
    if (timer) clearInterval(timer);
    video.pause();
    stream?.getTracks().forEach((t) => t.stop());
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
