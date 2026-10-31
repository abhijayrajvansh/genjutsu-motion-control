# MiniMax H3 motion control — research notes

Researched: November 1, 2026. Based on creator documentation; workflows have not been benchmarked locally.

**Goal:** character image + existing video → a video featuring the reference character while following the source performance and scene.

## Recommended starting point: Alissonerdx/BFS Character Swap v1.1

Built for replacing the main guide subject while retaining the source scene, framing, movement, poses, expressions and timing. The creator recommends v1.1 for improved likeness over v1.0.

[Download native ComfyUI workflow JSON](https://huggingface.co/Alissonerdx/Minimax-H3-ComfyUI/resolve/main/workflows/minimax_h3_character_swap_workflow_native_nodes_v1.1.json) · [Models and setup guide](https://huggingface.co/Alissonerdx/Minimax-H3-ComfyUI/blob/main/docs/character-swap.md)

| Input | Supplies |
| --- | --- |
| Character image | Face, hair, body proportions and clothing |
| Original video | Motion, poses, expressions, timing, camera and background |

Setup:

- Use H3 **`ref2va`** and Character Swap v1.1 LoRA at **strength `1.0`**.
- Connect the source video to **`MiniMaxH3AddGuide`**, with **`frame_idx = 0`**; feed the character image through the native image-reference path as `<Picture 1>`.
- Start with the supplied **8-step DMD preset** and a short clip. Use the guide's `body_swap:` prompt template with a description of the reference character.
- Match the output aspect ratio and supported frame count to the guide: **`17n + 5`** frames.
- For longer videos, the alternative **BFS Shot Planner** workflow splits, renders and joins shots.

## Other workflows to compare

| Workflow | When to use it | Links |
| --- | --- | --- |
| **Akatz Character Swap V1.5 + H3 Relay 2.0** | Selective replacement or multiple people: SAM subject masks, optional scene anchors, audio guidance and continuation support. Start with the character LoRA at strength `1.0`. | [Model and workflow downloads](https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA) |
| **Official H3 Fun ControlNet Union** | Explicit motion/structure control using Pose, Depth, Canny, HED or MLSD, plus masked video inpainting. Pose is a sensible first comparison for choreography; Depth for spatial structure. | [Guide and workflow](https://docs.comfy.org/tutorials/video/minimax/minimax-h3-fun-controlnet) |
| **Alissonerdx Motion Transfer: Guide Latents / TARA** | Advanced reference-image + driving-video experiments. Guide Latents supplies aligned guidance; TARA aligns native video-reference timing. Load the training adapter V2 before the corresponding motion LoRA to reproduce training conditions. | [Models, setup and four workflow variants](https://huggingface.co/Alissonerdx/Minimax-H3-ComfyUI) |

## Evaluation notes

- Start with **BFS v1.1** for a full character swap; compare **Akatz V1.5** when subject selection matters and **Fun ControlNet Pose** when motion drifts.
- Keep the initial comparison short and review identity, hands, expressions, timing, background preservation and occlusions before extending.
- For the official Fun ControlNet workflow, initially disable its optional **4-step Turbo**: its documentation notes slightly lower motion/audio quality. This is separate from BFS's supplied 8-step DMD preset.
- No workflow guarantees perfect motion or identity retention. Fast motion, small faces, difficult angles, occlusions and long clips can cause drift. Hardware suitability depends on GPU/VRAM, precision, resolution and duration.
