export function GenerationTime({ created }: { created: number }) {
  const date = new Date(created);
  return (
    <time className="generation-time" dateTime={date.toISOString()}>
      <span>{date.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" })}</span>
      <span>
        {date.toLocaleTimeString("en-US", {
          timeZone: "Asia/Kolkata",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })} IST
      </span>
    </time>
  );
}
