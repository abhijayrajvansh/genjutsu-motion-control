"use client";
import { useId } from "react";
import {
  isVideoMotionField,
  MOTION_SOURCING_FIELDS,
  MotionSource,
  MotionSources,
  MotionSourcingField,
} from "@/lib/motion-sourcing";

export function FinalOutputSourcing({ sources, onChange }: {
  sources: MotionSources;
  onChange: (field: MotionSourcingField, source: MotionSource) => void;
}) {
  const id = useId();
  return (
    <section className="output-sourcing" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Final Output Sourcing</h2>
      <p className="output-sourcing-intro">
        Choose the appearance and scene sources. Movement, expressions, hair motion and timing always follow the input video.
        Changes rebuild the visible prompt below.
      </p>
      <div className="output-sourcing-fields">
        {MOTION_SOURCING_FIELDS.map(field => (
          <fieldset key={field.id} className="output-sourcing-row" aria-describedby={`${id}-${field.id}-hint`}>
            <legend>{field.label}</legend>
            <small id={`${id}-${field.id}-hint`}>{field.description}</small>
            <div className="output-sourcing-options">
              {(["image", "video"] as const).map(source => (
                <label key={source}>
                  <input type="radio" name={`${id}-${field.id}`} value={source}
                    checked={isVideoMotionField(field.id) ? source === "video" : sources[field.id] === source}
                    disabled={isVideoMotionField(field.id)}
                    onChange={() => onChange(field.id, source)} />
                  {source === "image" ? "Input image" : "Input video"}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <small>Input image = Image1 @Image1. Input video = Video1 @Video1. The video supplies the full performance; appearance choices do not freeze the character’s pose or hairstyle.</small>
    </section>
  );
}
