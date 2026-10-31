"use client";
import { useState } from "react";
import { Asset } from "@/lib/storage";
import { trimVideo } from "@/lib/media";
import {
  ApiKey,
  AssetPreview,
  Button,
  Choices,
  Duration,
  FilePicker,
  IMAGE_TYPES,
  Prompt,
  Select,
  TextField,
  useSaved,
  VIDEO_TYPES,
} from "./controls";
export type Submission = {
  model: string;
  kind: string;
  prompt: string;
  asset: Asset;
};
export type FormProps = {
  demo: boolean;
  credits: number;
  onSubmit: (s: Submission) => Promise<void>;
  busy: boolean;
};
const modes = [
  {
    value: "reference",
    label: "Reference image + video",
    hint: "The person comes from your image. Garments, camera, scene and timing all come from the video.",
  },
  {
    value: "first",
    label: "First frame + reference",
    hint: "You supply an already-corrected opening frame, and the clip continues from it. Needs a second picture.",
  },
];
const models = [
  "MiniMax H3 Aiorbust 3.0",
  "MiniMax Official H3",
  "Seedance 2.0",
  "Seedance 2.5",
  "Wan 3",
];
const ratios = [
  { value: "auto", label: "Automatic" },
  { value: "9:16", label: "9:16 — vertical" },
  { value: "16:9", label: "16:9 — horizontal" },
  { value: "1:1", label: "1:1 — square" },
  { value: "3:4", label: "3:4 — portrait" },
  { value: "4:3", label: "4:3 — landscape" },
];
export function Available() {
  return (
    <div className="available">
      <span />
      Available — renders start right away.
    </div>
  );
}
export function Retention({ image = false }: { image?: boolean }) {
  return (
    <small>
      {image ? "Images" : "Videos"} you make here are deleted after{" "}
      <strong>1 day</strong>. Download anything you want to keep.
    </small>
  );
}
export function MotionForm(p: FormProps & { initialVideo?: Asset | null }) {
  const [model, setModel] = useSaved("clone.motion.model", models[0]),
    [mode, setMode] = useSaved("clone.motion.mode", "reference");
  const [host, setHost] = useState("kie"),
    [resolution, setResolution] = useState("720p"),
    [audio, setAudio] = useState("keep"),
    [writer, setWriter] = useState("Gemini"),
    [duration, setDuration] = useState(6),
    [prompt, setPrompt] = useState(""),
    [image, setImage] = useState<Asset | null>(null),
    [video, setVideo] = useState<Asset | null>(p.initialVideo ?? null),
    [first, setFirst] = useState<Asset | null>(null),
    [extras, setExtras] = useState<(Asset | null)[]>([]),
    [error, setError] = useState("");
  const own = model !== models[0],
    seed = model.startsWith("Seedance"),
    multi = seed || model === "Wan 3";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!image || !video) return;
    if (mode === "first" && !multi && !first) {
      setError("Add the corrected first frame.");
      return;
    }
    if (!p.demo) {
      setError(
        "This local clone has no rendering provider connected. Enable demo mode in the account menu to preview a generation without sending files or keys.",
      );
      return;
    }
    setError("");
    await p.onSubmit({ model, kind: "Motion Control", prompt, asset: video });
  }
  return (
    <form className="generation-form" onSubmit={submit}>
      <Select
        label="Model"
        options={models}
        value={model}
        onChange={setModel}
        hint={
          own
            ? model === models[1]
              ? "MiniMax’s own API, on your key and your balance."
              : model === "Seedance 2.5"
                ? "The same, up to 30 seconds."
                : "Your key and your balance. Up to 15 seconds."
            : "Our GPUs, paid for in credits."
        }
      />
      <Available />
      {own && (
        <>
          <ApiKey host={host} onHostChange={setHost} />
          <Choices
            label="Resolution"
            options={["1080p", "720p", "480p"]}
            value={resolution}
            onChange={setResolution}
          />
        </>
      )}
      {seed && (
        <Choices
          label="Audio"
          options={[
            {
              value: "keep",
              label: "Keep the video's audio",
              hint: "The original dialogue and room sound, with the new subject lip-synced to it.",
            },
            {
              value: "new",
              label: "Generate new audio",
              hint: "The model composes a soundtrack of its own. The original is not used.",
            },
          ]}
          value={audio}
          onChange={setAudio}
        />
      )}
      {!multi && (
        <Choices label="Mode" options={modes} value={mode} onChange={setMode} />
      )}
      <FilePicker
        label={
          mode === "first" && !multi
            ? "Reference image (identity)"
            : "Reference image"
        }
        hint="PNG, JPEG or WebP"
        asset={image}
        onPick={setImage}
      />
      {multi && (
        <>
          {extras.map((a, i) => (
            <div key={i}>
              <FilePicker
                label={`Reference image ${i + 2}`}
                asset={a}
                onPick={(v) =>
                  setExtras(extras.map((x, k) => (k === i ? v : x)))
                }
              />
              <button
                type="button"
                className="text-button"
                onClick={() => setExtras(extras.filter((_, k) => k !== i))}
              >
                Remove
              </button>
            </div>
          ))}
          {extras.length < 3 && (
            <button
              type="button"
              className="text-button"
              onClick={() => setExtras([...extras, null])}
            >
              + Add another reference image
            </button>
          )}
        </>
      )}
      {mode === "first" && !multi && (
        <FilePicker
          label="First frame"
          hint="Already corrected"
          asset={first}
          onPick={setFirst}
        />
      )}
      <FilePicker
        label="Driving video"
        hint="MP4, MOV or WebM — up to 15 seconds"
        accept={VIDEO_TYPES}
        asset={video}
        onPick={setVideo}
      />
      {multi ? (
        <Prompt
          value={prompt}
          onChange={setPrompt}
          hint="Edit it for this model, or leave it empty to use the default."
        />
      ) : (
        <Choices
          label="Prompt written by"
          options={["Gemini", "xAI"]}
          value={writer}
          onChange={setWriter}
        />
      )}
      {own && !seed && <Duration value={duration} onChange={setDuration} />}
      <Button
        disabled={
          p.busy ||
          !image ||
          !video ||
          (!own && (!p.demo || p.credits < 10)) ||
          (mode === "first" && !multi && !first)
        }
      >
        {p.busy ? "Starting…" : "Generate"}
      </Button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <small>
        A generation takes several minutes. You can close this tab — the job
        keeps running and will be here when you come back. <Retention />
      </small>
    </form>
  );
}
export function VideoForm(p: FormProps) {
  const [model, setModel] = useSaved("clone.video.model", "Wan 3"),
    [host, setHost] = useState("kie"),
    [prompt, setPrompt] = useState(""),
    [image, setImage] = useState<Asset | null>(null),
    [extras, setExtras] = useState<(Asset | null)[]>([]),
    [video, setVideo] = useState<Asset | null>(null),
    [duration, setDuration] = useState(5),
    [resolution, setResolution] = useState("720p"),
    [ratio, setRatio] = useState("auto"),
    [audio, setAudio] = useState(true),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) {
      setError("Write what you want generated.");
      return;
    }
    if (!image && !video) {
      setError("Add at least one reference image, or a reference video.");
      return;
    }
    if (!p.demo) {
      setError(
        "No rendering provider is connected to this local clone. Enable demo mode in the account menu to test the workflow.",
      );
      return;
    }
    setError("");
    await p.onSubmit({
      model,
      kind: "Video Gen",
      prompt,
      asset: video ?? image!,
    });
  }
  return (
    <form className="generation-form" onSubmit={submit}>
      <Select
        label="Model"
        options={["Wan 3", "Seedance 2.5"]}
        value={model}
        onChange={setModel}
        hint={`Your key and your balance. Up to ${model === "Wan 3" ? 15 : 30} seconds.`}
      />
      <ApiKey host={host} onHostChange={setHost} />
      <Prompt value={prompt} onChange={setPrompt} />
      <FilePicker
        label="Reference image"
        hint="PNG, JPEG or WebP"
        asset={image}
        onPick={setImage}
      />
      {image &&
        extras.map((a, i) => (
          <FilePicker
            key={i}
            label={`Reference image ${i + 2}`}
            asset={a}
            onPick={(v) => setExtras(extras.map((x, k) => (k === i ? v : x)))}
          />
        ))}
      {image && extras.length < 3 && (
        <button
          type="button"
          className="text-button"
          onClick={() => setExtras([...extras, null])}
        >
          + Add another reference image
        </button>
      )}
      <FilePicker
        label="Reference video"
        hint="Optional — MP4, MOV or WebM"
        accept={VIDEO_TYPES}
        asset={video}
        onPick={setVideo}
      />
      <Duration
        value={duration}
        onChange={setDuration}
        max={model === "Wan 3" ? 15 : 30}
      />
      <Select
        label="Resolution"
        options={["480p", "720p", "1080p"]}
        value={resolution}
        onChange={setResolution}
      />
      <Select
        label="Aspect ratio"
        options={ratios}
        value={ratio}
        onChange={setRatio}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={audio}
          onChange={(e) => setAudio(e.target.checked)}
        />
        <span>
          Generate audio
          <small>
            A soundtrack composed with the clip. Off returns it silent.
          </small>
        </span>
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <Button disabled={p.busy}>{p.busy ? "Starting…" : "Generate"}</Button>
      <small>
        No credits. This generation is on your{" "}
        {host === "kie" ? "kie" : "WaveSpeed"} account. Check current rates at{" "}
        <a
          href={
            host === "kie"
              ? "https://kie.ai/pricing"
              : "https://wavespeed.ai/pricing"
          }
          target="_blank"
          rel="noreferrer"
        >
          {host === "kie" ? "kie.ai/pricing" : "wavespeed.ai/pricing"}
        </a>
        . <Retention />
      </small>
    </form>
  );
}
const imageTasks = [
  "Krea v3.0",
  "Krea Detailer",
  "Z-Image Detailer",
  "LoKr head swap",
  "Face swap",
  "Seedream 5 Pro (uncensored)",
  "Nano Banana edit",
  "GPT Image edit",
];
export function ImageForm(p: FormProps) {
  const [task, setTask] = useSaved("clone.images.task", imageTasks[0]),
    [mode, setMode] = useSaved("clone.images.mode", "Reference image"),
    [writer, setWriter] = useSaved("clone.images.writer", "xAI"),
    [image, setImage] = useState<Asset | null>(null),
    [face, setFace] = useState<Asset | null>(null),
    [prompt, setPrompt] = useState(""),
    [seed, setSeed] = useState(""),
    [host, setHost] = useState("kie"),
    [size, setSize] = useState("2K"),
    [ratio, setRatio] = useState("1:1"),
    [lora, setLora] = useState("No LoRA (ships with the graph)"),
    [loras, setLoras] = useState<string[]>([]),
    [manage, setManage] = useState(false),
    [error, setError] = useState("");
  const paid = [
      "Seedream 5 Pro (uncensored)",
      "Nano Banana edit",
      "GPT Image edit",
    ].includes(task),
    manual = mode === "Write it yourself",
    detailer = task.includes("Detailer"),
    swap = task.includes("swap"),
    cost = manual ? 5 : 10;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((!manual || task !== imageTasks[0]) && !image) {
      setError("Add a reference image first.");
      return;
    }
    if (manual && !prompt.trim()) {
      setError("Write a prompt first.");
      return;
    }
    if (!p.demo) {
      setError("Enable demo mode in the account menu to preview the workflow.");
      return;
    }
    if (!image) {
      setError(
        "The local preview needs a reference image. Real text-to-image rendering requires a provider.",
      );
      return;
    }
    setError("");
    await p.onSubmit({ model: task, kind: "Images", prompt, asset: image });
  }
  return (
    <form className="generation-form" onSubmit={submit}>
      <Available />
      <Select
        label="What to make"
        options={imageTasks}
        value={task}
        onChange={setTask}
      />
      {paid ? (
        <ApiKey host={host} onHostChange={setHost} />
      ) : task === imageTasks[0] ? (
        <>
          <Choices
            label="Mode"
            options={[
              {
                value: "Reference image",
                label: "Reference image",
                hint: "A photo sets the scene, pose and clothing.",
              },
              {
                value: "Write it yourself",
                label: "Write it yourself",
                hint: "Your words, exactly. Costs less.",
              },
            ]}
            value={mode}
            onChange={setMode}
          />
          {!manual && (
            <Choices
              label="Prompt written by"
              options={["xAI", "Gemini"]}
              value={writer}
              onChange={setWriter}
            />
          )}
        </>
      ) : null}
      {detailer && (
        <small>
          {task === "Krea Detailer"
            ? "Retouches the whole photo: skin on the face and body, light, colour and a natural camera finish. Pose, outfit and scene stay as they are."
            : "Adds natural skin detail to the face only (pores, texture, eyes and lips) and returns your photo at twice the size. Everything else stays as it was."}
        </small>
      )}
      {(manual || paid) && (
        <Prompt
          value={prompt}
          onChange={setPrompt}
          hint="Describe the image you want to make, or the edits to your reference."
        />
      )}
      {(!manual || task !== imageTasks[0] || p.demo) && (
        <FilePicker
          label={swap ? "Target image" : "Reference image"}
          hint={
            task === imageTasks[0]
              ? "PNG, JPEG or WebP. The person comes from your LoRA — this sets the scene, pose and clothing."
              : "PNG, JPEG or WebP"
          }
          asset={image}
          onPick={setImage}
        />
      )}
      {swap && (
        <FilePicker
          label="Face reference"
          hint="The identity to use in your image"
          asset={face}
          onPick={setFace}
        />
      )}
      {task === imageTasks[0] && (
        <div className="field">
          <div className="between">
            <span>Your character LoRA</span>
            <button
              type="button"
              className="text-button"
              aria-expanded={manage}
              onClick={() => setManage(!manage)}
            >
              Upload / manage
            </button>
          </div>
          {manage && (
            <div className="lora-panel">
              <small>
                Upload a .safetensors LoRA to add it to this local workspace.
              </small>
              <input
                aria-label="Upload LoRA"
                type="file"
                accept=".safetensors"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setLoras([...loras, f.name]);
                    setLora(f.name);
                    setManage(false);
                  }
                }}
              />
            </div>
          )}
          <select
            aria-label="Your character LoRA"
            value={lora}
            onChange={(e) => setLora(e.target.value)}
          >
            {["No LoRA (ships with the graph)", ...loras].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
      )}
      {paid && (
        <>
          <Select
            label="Resolution"
            value={size}
            onChange={setSize}
            options={["1K", "2K", "4K"]}
          />
          <Select
            label="Aspect ratio"
            value={ratio}
            onChange={setRatio}
            options={["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]}
          />
        </>
      )}
      <TextField
        label="Seed　optional"
        type="number"
        placeholder=""
        value={seed}
        onChange={(e) => setSeed(e.target.value)}
      />
      {!paid && p.credits < cost && (
        <div className="credit-note">
          <strong>Not enough credits</strong>
          <small>
            This costs {cost} credits and you have {p.credits}.
          </small>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <Button disabled={p.busy || (!paid && p.credits < cost)}>
        {p.busy
          ? "Starting…"
          : paid
            ? "Generate"
            : `Generate — ${cost} credits`}
      </Button>
      <Retention image />
    </form>
  );
}
const tools = [
  "Trim video",
  "Get frame image from video",
  "Phone audio",
  "Phone photo",
  "Extract voice",
  "Change voice",
  "Video upscaler — kie",
  "Video upscaler — WaveSpeed",
  "Double frame rate — WaveSpeed",
];
export function ToolsForm(
  p: FormProps & { onUseMotion: (asset: Asset) => void },
) {
  const [tool, setTool] = useSaved("clone.tools.tool", tools[0]),
    [asset, setAsset] = useState<Asset | null>(null),
    [position, setPosition] = useState(0),
    [end, setEnd] = useState(5),
    [host, setHost] = useState("kie"),
    [resolution, setResolution] = useState("1080p"),
    [error, setError] = useState(""),
    [result, setResult] = useState(""),
    [working, setWorking] = useState(false);
  const photo = tool === "Phone photo",
    frame = tool === "Get frame image from video",
    remote = tools.indexOf(tool) >= 4;
  async function process() {
    if (!asset) return;
    setWorking(true);
    setError("");
    try {
      if (tool === "Trim video") {
        const blob = await trimVideo(asset.blob, position, end);
        setResult((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      } else if (photo || frame) {
        const url = URL.createObjectURL(asset.blob),
          canvas = document.createElement("canvas");
        let source: CanvasImageSource;
        if (photo) {
          const img = new Image();
          img.src = url;
          await img.decode();
          canvas.width = img.width;
          canvas.height = img.height;
          source = img;
        } else {
          const video = document.createElement("video");
          video.preload = "auto";
          video.src = url;
          await new Promise<void>((resolve, reject) => {
            video.onloadeddata = () => resolve();
            video.onerror = () =>
              reject(new Error("Could not read this video."));
          });
          const seekTo = Math.min(
            Math.max(0.001, position),
            Math.max(0, video.duration - 0.05),
          );
          if (seekTo > 0) {
            video.currentTime = seekTo;
            await new Promise<void>((resolve) => {
              video.onseeked = () => resolve();
            });
          }
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          source = video;
        }
        const ctx = canvas.getContext("2d")!;
        if (photo)
          ctx.filter = "contrast(1.04) saturate(0.92) brightness(1.02)";
        ctx.drawImage(source, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              setResult((old) => {
                if (old) URL.revokeObjectURL(old);
                return URL.createObjectURL(blob);
              });
            }
          },
          "image/jpeg",
          0.9,
        );
      } else if (p.demo) {
        await p.onSubmit({
          model: tool,
          kind: "Tools",
          prompt: `${position}s – ${end}s`,
          asset,
        });
      } else {
        setError(
          "This tool requires a rendering provider. Frame extraction and Phone photo run locally; enable demo mode to preview other workflows.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not process that file.");
    } finally {
      setWorking(false);
    }
  }
  function change(v: string) {
    setTool(v);
    setAsset(null);
    if (result) URL.revokeObjectURL(result);
    setResult("");
    setError("");
  }
  return (
    <div className="generation-form">
      <Select label="Tool" options={tools} value={tool} onChange={change} />
      {remote && <ApiKey host={host} onHostChange={setHost} />}
      <FilePicker
        label={
          photo ? "Image" : tool === "Phone audio" ? "Audio or video" : "Video"
        }
        hint={
          photo
            ? "PNG, JPEG or WebP"
            : tool === "Phone audio"
              ? "MP3, WAV, MP4 or WebM"
              : "MP4, MOV or WebM"
        }
        accept={
          photo
            ? IMAGE_TYPES
            : tool === "Phone audio"
              ? "audio/mpeg,audio/wav,audio/mp4,video/mp4,video/webm"
              : VIDEO_TYPES
        }
        asset={asset}
        onPick={setAsset}
        simple={tool === "Trim video"}
      />
      {asset && (
        <>
          <div className="tool-preview">
            <AssetPreview asset={asset} controls />
          </div>
          {(frame || tool === "Trim video") && (
            <TextField
              label={frame ? "Frame at (seconds)" : "Start (seconds)"}
              type="number"
              min="0"
              step="0.1"
              value={position}
              onChange={(e) => setPosition(+e.target.value)}
            />
          )}
          {tool === "Trim video" && (
            <TextField
              label="End (seconds)"
              type="number"
              min={position + 0.1}
              step="0.1"
              value={end}
              onChange={(e) => setEnd(+e.target.value)}
            />
          )}
          {tool.includes("upscaler") && (
            <Select
              label="Resolution"
              options={["1080p", "2K", "4K"]}
              value={resolution}
              onChange={setResolution}
            />
          )}
          <Button
            disabled={
              working || p.busy || (tool === "Trim video" && end <= position)
            }
            onClick={process}
          >
            {working
              ? "Processing…"
              : frame
                ? "Get frame image"
                : photo
                  ? "Make phone photo"
                  : tool === "Trim video"
                    ? "Trim video"
                    : "Process"}
          </Button>
          {tool === "Trim video" && (
            <Button secondary onClick={() => p.onUseMotion(asset)}>
              Use in Motion Control
            </Button>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="tool-output">
          {tool === "Trim video" ? (
            <video src={result} controls />
          ) : (
            <img src={result} alt="Processed image" />
          )}
          <a
            className="button"
            href={result}
            download={
              tool === "Trim video"
                ? "trimmed.webm"
                : frame
                  ? "frame.jpg"
                  : "phone-photo.jpg"
            }
          >
            Download {tool === "Trim video" ? "video" : "image"}
          </a>
        </div>
      )}
    </div>
  );
}
