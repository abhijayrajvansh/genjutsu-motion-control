const sparkles = [
  [12, 18, 0, 4.2], [78, 12, 1.4, 5.1], [38, 9, 2.6, 4.6],
  [88, 34, 0.8, 5.4], [21, 42, 3.2, 4.8], [65, 28, 1.9, 4.3],
  [8, 69, 2.1, 5.6], [81, 64, 0.3, 4.7], [44, 76, 1.2, 5.2],
  [28, 88, 2.9, 4.4], [70, 89, 0.6, 5.3], [51, 38, 3.6, 4.9],
  [91, 82, 2.3, 4.5], [35, 58, 0.9, 5.5], [60, 62, 3.1, 4.1],
];

export function RenderPreview({ image, state }: { image?: string; state: string }) {
  const queued = state === "waiting" || state === "queuing";
  const preparing = state === "uploading" || state === "submitting";
  return (
    <div className="render-preview" role="status" aria-live="polite">
      {image && <img className="render-first-frame" src={image} alt="" />}
      <div className="render-frost" aria-hidden="true" />
      <div className="render-light-sweep" aria-hidden="true" />
      <div className="render-sparkles" aria-hidden="true">
        {sparkles.map(([left, top, delay, duration], index) => (
          <span key={index} style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${-delay}s`, animationDuration: `${duration}s` }}>
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="m8 0 1.6 6.4L16 8l-6.4 1.6L8 16 6.4 9.6 0 8l6.4-1.6Z" /></svg>
          </span>
        ))}
      </div>
      <div className="render-preview-message">
        <div className="render-orbit" aria-hidden="true"><span /></div>
        <strong>{preparing ? "Preparing your video" : queued ? "Your video is queued" : "Creating your video"}</strong>
        <span>{preparing ? "Getting your clip ready" : queued ? "Waiting for a render slot" : "Bringing your frames to life"}</span>
      </div>
      <div className="render-preview-bottom" aria-hidden="true">
        <div className="render-activity"><span /></div>
        <span>You can leave and return</span>
      </div>
    </div>
  );
}
