# Openjutsu H3 workflows

`simple.api.json` (the swap), `mask.api.json` (Check mask), `face.api.json` (Fix faces) and `color.api.json` (Fix colours)
are ComfyUI API exports copied from
[D3voz/openjutsu](https://github.com/D3voz/openjutsu) at commit `7fe118bb5a61fcfac0148e1bfea3dd29884dbf26`
(MIT License, Copyright (c) 2026 D3voz).

Genjutsu loads them in `lib/server/h3-workflow.ts`, prunes the parts each request does not use (hat fix, No lip-sync),
applies the model components and submits them straight to ComfyUI through the rental link. No comfy-api-proxy is needed.

The GPU needs ComfyUI 0.41.2 or newer with the custom nodes and models listed in the Openjutsu README. On Blackwell
GPUs (RTX 5090) start ComfyUI with `--use-pytorch-cross-attention`; the image's xformers build cannot run there.

`face.api.json` uses `select: largest_face` instead of the upstream `largest` (Openjutsu issue #45: current
ComfyUI-H3-FaceRefine renamed the option). Its detector names are Windows paths (`bbox\face_yolov8m.pt`); Genjutsu maps
them to whatever names the GPU's FaceRefine node lists, so both detector files must be in `models/ultralytics/bbox` and
`models/ultralytics/segm`, and the node must list them (with ComfyUI-Impact-Subpack or the FaceRefine path patch).
