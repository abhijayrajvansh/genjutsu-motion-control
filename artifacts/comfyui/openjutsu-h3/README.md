# Openjutsu H3 Simple motion transfer

`simple.api.json` (the swap) and `mask.api.json` (Check mask) are ComfyUI API exports copied from
[D3voz/openjutsu](https://github.com/D3voz/openjutsu) at commit `7fe118bb5a61fcfac0148e1bfea3dd29884dbf26`
(MIT License, Copyright (c) 2026 D3voz).

Genjutsu loads them in `lib/server/h3-workflow.ts`, prunes the parts each request does not use (hat fix, No lip-sync),
applies the model components and submits them straight to ComfyUI through the rental link. No comfy-api-proxy is needed.

The GPU needs ComfyUI 0.41.2 or newer with the custom nodes and models listed in the Openjutsu README. On Blackwell
GPUs (RTX 5090) start ComfyUI with `--use-pytorch-cross-attention`; the image's xformers build cannot run there.
