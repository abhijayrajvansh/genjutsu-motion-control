"use client";
import { useId } from "react";
import {
  MOTION_ACTION_LIMIT,
  MOTION_SOURCING_FIELDS,
  MotionSource,
  MotionSources,
  MotionSourcingField,
} from "@/lib/motion-sourcing";

export function FinalOutputSourcing({ sources, onChange, action, onActionChange }: {
  sources: MotionSources;
  onChange: (field: MotionSourcingField, source: MotionSource) => void;
  action: string;
  onActionChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <section className="output-sourcing" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Final Output Sourcing</h2>
      <p className="output-sourcing-intro">
        Choose one source for each part of the output. The other input is excluded for that part.
        Changes rebuild the prompt below.
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
                    checked={sources[field.id] === source}
                    onChange={() => onChange(field.id, source)} />
                  {source === "image" ? "Input image" : "Input video"}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <small>Input image = Image1 @Image1. Input video = Video1 @Video1. An image supplies a static pose or expression; a video supplies movement over time.</small>
      <label className="field output-sourcing-action">
        <span>Clip-specific action <small>Optional</small></span>
        <textarea rows={4} maxLength={MOTION_ACTION_LIMIT} value={action}
          onChange={event => onActionChange(event.target.value)}
          placeholder="For example: As she turns her head, her tied hair releases, swings around her face and settles over her shoulders. Match the video's timing." />
        <small>Describe important actions for this driving video. Saved separately for each video and added to the generated prompt.</small>
      </label>
    </section>
  );
}
