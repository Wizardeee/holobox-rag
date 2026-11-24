# Avatar Inspection Report — `sabrina_3d_avatar.glb`

Inspected asset: `/Users/deekshaa/Downloads/sabrina_3d_avatar.glb` (source file left untouched). A working copy is served from `frontend/public/avatar/sabrina_3d_avatar.glb` for the kiosk build.

## File format and provenance

| Property | Value |
|---|---|
| Container | glTF 2.0 binary (`.glb`), 4,951,024 bytes (~4.7 MB) |
| Generator | Sketchfab-14.64.0 |
| Title | "Sabrina 3D avatar" by Poliko |
| Licence | CC-BY-4.0 — attribution must be retained in deployment material |
| Scenes / root | 1 scene; root node `Sketchfab_model` |
| Nodes | 116 |
| Meshes | 8 |

## Meshes, materials and textures

- Meshes: `Wolf3D_Body`, `Wolf3D_Hair`, `Wolf3D_Outfit_Footwear`, `Wolf3D_Outfit_Top`, `Wolf3D_Head`, `Wolf3D_Teeth`, plus 3 small accessory meshes (eyes at y≈1.61) and a mouth/teeth mesh at y≈1.54–1.58.
- 7 PBR materials (`Wolf3D_Eye`, `Wolf3D_Body`, `Wolf3D_Hair`, `Wolf3D_Skin`, `Wolf3D_Outfit_Footwear`, `Wolf3D_Outfit_Top`, `Wolf3D_Teeth`) with embedded JPEG/PNG textures (11 images). All textures are embedded in the GLB; no external texture files to provision.
- Model height ≈ 1.76 units (head/hair top ≈ 1.76, feet ≈ 0). The `Armature` and several mesh nodes carry a -90° X rotation and scale 100; Three.js `GLTFLoader` applies these transforms.

## Skeleton and animation

- 1 skin with **83 joints**: `_rootJoint`, `Hips`, `Spine`, `Spine1`, `Spine2`, `Neck`, `Head`, `HeadTop_End`, **LeftEye / RightEye**, full arms/fingers/legs. This is a humanoid rig **without IK metadata** and without any jaw, mouth, lip, eyelid or brow bones.
- 1 animation clip: **`Idle`, 22.33 s, 61 channels**. Channels include translation/rotation on `Head_06` and `Neck_05`, plus hand/finger motion. AnimationMixer can play this clip directly.
- Eye *bones* exist (`LeftEye_08`, `RightEye_09`) for subtle gaze, plus static `EyeLeft`/`EyeRight` meshes.

## Facial controls (critical finding)

| Control | Present? |
|---|---|
| Morph targets / blendshapes (`mesh.primitives[].targets`) | **No — all 8 meshes have 0 targets** |
| Named visemes (`targetNames`) | **No** |
| Jaw bone | **No** |
| Mouth / lip / cheek / brow bones | **No** |
| Eyelid / blink bones | **No** |
| Eye bones | Yes (2) |
| Head / neck bones | Yes |

## Lip-sync decision (honest fallback)

Phoneme-accurate and even jaw-accurate lip sync is **not possible** with this asset: it has neither blendshapes nor a jaw/mouth bone. The implementation therefore uses the best available honest fallback:

1. Play the actual Piper WAV through a single `HTMLAudioElement` owned by the kiosk hook.
2. Feed that element into a Web Audio `AnalyserNode`; drive subtle **head nod / posture motion** from the measured RMS amplitude while audio is playing.
3. Show an explicit on-screen "speaking" indicator in the kiosk UI.
4. **Update (2026-11-25):** a *runtime* morph target now parts the model's own
   lip vertices while the analyser reports speech, so the mouth visibly opens
   and closes. This is still amplitude-driven — **not phoneme lip sync** — and
   no face mesh is replaced or the GLB modified. See `docs/AVATAR_ANIMATION.md`.

This will be documented in the final report as **amplitude-driven speaking animation, not phoneme lip sync**. If a viseme-capable avatar is supplied later, only `AvatarController` needs a new driver; the kiosk/audio/RAG code is unaffected.

## Idle/listening/thinking realism

The existing `Idle` clip is used as the base layer, with two slightly detuned low-frequency offsets on head/neck (so motion does not look metronomic). Listening adds subtle eye/head attention, thinking a small head tilt, and speaking the amplitude-driven nod. All offsets are small and additive on top of the clip.
