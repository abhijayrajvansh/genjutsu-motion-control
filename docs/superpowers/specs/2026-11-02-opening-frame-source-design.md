# Opening frame source

Approved approach: keep the driving video and add an Opening frame source radio. Selecting Image1 adds opening-frame instructions to the live prompt; matching remains model-dependent. The user explicitly selected this approach in chat.

## Behavior

- Add Input image / Input video choices to Final Output Sourcing. Default to Input video for existing settings.
- Persist the choice with existing sourcing settings. Changes regenerate the visible prompt and discard stale manual overrides as other source changes do.
- Input image puts Image1 opening pose, framing, face and outfit guidance first, followed by the selected Video1 motion. Other source choices apply after the opening instant.
- Input video uses Video1's opening pose and framing with the selected appearance references. Motion remains video-driven in either case.
- Clearly describe the control as prompt guidance, not a strict first-frame lock.
- Preserve reference-mode provider payloads, including the driving video. Never add a strict first_frame role or switch generation_type to frame.

## Approaches

The user selected prompt-guided Image1 opening with the driving video retained. Strict image-to-video would provide first-frame control but remove the driving video, so it was rejected for this change. No face-reference upload or model change is included.
