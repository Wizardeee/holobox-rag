# Avatar Rendering Fix — Report

## A. Root causes

**1. Off-centre / cropped avatar**

`src/components/Avatar.tsx` called `renderer.setSize(width, height, false)`, which
updates the drawing buffer but **not the canvas CSS size**. With
`setPixelRatio(min(devicePixelRatio, 2))`, the canvas attribute size was 2× the
layout size while its CSS size defaulted to those attributes. The canvas
therefore overflowed the full-screen host and was clipped by
`.kiosk-root { overflow: hidden }`, showing only the right-hand slice of the
render — the avatar appeared pushed to the right edge. This was a CSS/layout bug,
not a model-origin problem; the measured bounds were already centred at x≈0.

**2. Completely white avatar**

The GLB embeds 11 textures in buffer views. `GLTFLoader` uses
`ImageBitmapLoader` where available, which **fetches the embedded images through
`blob:file:///…` URLs**. Electron's CSP in `index.html` allowed `img-src … blob:`
but **not `connect-src … blob:`**, so every texture load failed with
`THREE.GLTFLoader: Couldn't load texture blob:file:///…`. The seven PBR materials
(`Wolf3D_Eye`, `Wolf3D_Body`, `Wolf3D_Hair`, `Wolf3D_Skin`,
`Wolf3D_Outfit_Footwear`, `Wolf3D_Outfit_Top`, `Wolf3D_Teeth`) remained with
white base colours and no maps. With ambient 1.6 + directional 2.2 + rim 1.1 and
**no tone mapping**, the untextured model was completely blown out.

Runtime evidence before the fix (CDP):
`mats = [{material:'Wolf3D_Body', map:false, color:'ffffff'}, …]` (all 8 meshes),
11 `Couldn't load texture` console errors, `toneMapping: 0`, lights 1.6/2.2/1.1.

## B. Changes made

| File | Change |
|---|---|
| `frontend/index.html` | CSP `connect-src` now includes `blob:` (and `data:`), so embedded GLB textures can be fetched; `img-src` also includes `blob:`. |
| `frontend/src/components/Avatar.tsx` | `renderer.setSize(width, height)` (CSS size updated); calculated responsive framing from a precise bounding box; balanced lighting + neutral tone mapping; removed hardcoded camera coordinates. |
| `frontend/src/kiosk/kiosk.css` | `.avatar-host canvas { width: 100%; height: 100%; }` guarantees the canvas follows the host layout. |
| `docs/screenshots/avatar-*.jpg` | Captured corrected render at 1920×1080, 1536×864 and 1366×768. |

No backend, RAG, auth, API, voice, animation-controller or GLB asset changes were
made. The original downloaded model is untouched; a byte-identical copy is still
served from `frontend/public/avatar/`.

## C. Rendering configuration

- **Camera:** PerspectiveCamera, FOV 32°, near 0.01, far 100. No hardcoded
  position. Each resize computes a focus box from `new Box3().setFromObject(model, true)`:
  full model width, upper 68% of its height (head + torso + arms) so the head is
  the subject. Distance =
  `max((height/2)/tan(vFov/2), (width/2)/tan(hFov/2)) * 1.2`, positioned at
  `center + z(distance + depth/2)`, looking at the focus-box centre.
- **Framing evidence (NDC of focus corners):** x ±0.362, y ±0.833 at all three
  tested resolutions — safely inside the viewport with balanced margins.
- **Lighting:** HemisphereLight 0.55, AmbientLight 0.25, key DirectionalLight
  1.5, fill 0.45, rim 0.55 (all down from the previous 1.6/2.2/1.1 setup).
- **Renderer:** `outputColorSpace = SRGBColorSpace`,
  `toneMapping = NeutralToneMapping`, `toneMappingExposure = 1.0`.
  No material, texture, colour, roughness, metalness or normal map is modified —
  original PBR values are preserved.
- **No post-processing**, bloom, glow or background change.

## D. Verification

Runtime checks were performed in the actual Electron kiosk via Chrome DevTools
Protocol after rebuilding the app:

| Check | Result |
|---|---|
| All 8 mesh materials have maps loaded (128–1024 px) | PASS |
| GLB loader / WebGL console errors | **0 errors** |
| Canvas CSS size equals layout size (e.g. 1240×742) | PASS |
| Avatar horizontally centred (camera x = model centre x ≈ 0) | PASS |
| Focus box inside viewport at 1920×1080 / 1536×864 / 1366×768 (NDC within ±0.36 / ±0.83) | PASS |
| Original skin, hair, dress, shoes and colours visible | PASS — see screenshots below |
| Kiosk UI: idle status, 2 courses, mic button, one canvas, no load error | PASS |
| RAG + Ollama + Piper through the renderer bridge: `mode=live`, 5 sources, 923,808-byte WAV, `playing` | PASS |
| Microphone button transitions to `Listening…` with stop control | PASS |
| `npm run build`, `npm run electron:build`, `npm run check:api-types` | PASS |

Screenshot evidence (canvas render composited on the kiosk's dark background —
CDP full-page capture was unreliable in this Electron session, so the WebGL
canvas was captured directly with `toDataURL()`):

- [1920×1080](screenshots/avatar-1920x1080.jpg)
- [1536×864](screenshots/avatar-1536x864.jpg)
- [1366×768](screenshots/avatar-1366x768.jpg)

The avatar now faces the camera, is centred, shows the complete head/shoulders
and upper torso with margin, and renders with its original textured colours.

## E. Remaining issues

- Legs below mid-thigh are intentionally outside the upper-body kiosk framing.
  If a full-body view is wanted, lower `UPPER_BODY_START` toward 0 and increase
  `FRAME_PADDING` slightly in `Avatar.tsx`.
- The screenshots are canvas captures composited onto an approximation of the
  kiosk background; full-page OS screenshot capture was blocked in this session.
- No Windows Holobox PC was available, so Windows-specific GPU/WebGL behaviour
  and physical microphone/audio hardware remain unverified.
- The model still has no morph targets or jaw bone; speaking animation remains
  amplitude-driven as documented in `AVATAR_INSPECTION.md` (unchanged by this fix).
