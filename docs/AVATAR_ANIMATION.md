# Avatar Mouth Animation and Eye Tracking — Report

## 1. Mouth movement

The GLB has no jaw bone, no mouth morph targets and no visemes. The face texture
does contain lip geometry: sampling the skin texture at face vertices located the
lip line at model-local `y ≈ 1.556–1.562`, `x ≈ ±0.02`, `z ≈ 0.13`, with the
existing teeth mesh immediately behind it.

**Implementation:** `frontend/src/avatar/mouthMorph.ts` builds a *runtime* morph
target on the existing `Wolf3D_Skin` head mesh. It displaces only vertices near
the lips (Gaussian falloff in x/y/z): the lower lip drops up to 0.019 model
units, the upper lip rises 0.006, and both move slightly inward so the parted
lips reveal the original teeth instead of clipping. No new mesh, no artificial
black oval, no material/colour changes, and the source GLB is untouched.

Two Three.js details were required: `geometry.morphTargetsRelative = true`
(the values are displacements, not absolute positions) and
`material.needsUpdate = true` (the material was compiled before the morph
attribute existed). Without these the face renders corrupted/black.

`AvatarController` drives `morphTargetInfluences[0]` from the existing Web Audio
analyser RMS, smoothed (fast attack 18/s, faster release 28/s) with a small
deterministic variation term so it is not a binary on/off flap. `setState()`
forces the influence to 0 whenever the state is not `speaking`, so stop,
playback failure, interruption and end-of-audio immediately close the mouth.

**This is amplitude-driven mouth movement, not phoneme/viseme lip sync.** For
true lip sync the avatar would need ARKit-style viseme blendshapes (or at least
a jaw bone plus lip morphs) and a phoneme/viseme mapping from the TTS output.

## 2. Eye tracking

Eye bones: `LeftEye_08` and `RightEye_09` (children of `Head_06`, 83-joint skin).
The controller discovers each bone's local forward axis at construction by
comparing candidate local basis vectors with the direction from the eye to the
camera — it does not assume +Z.

Cursor position is normalized to the avatar canvas rect in
`src/components/Avatar.tsx` (`pointermove` → NDC -1..1; `pointerleave`/`blur`
→ null). The controller converts NDC into a camera ray using the live FOV and
aspect, projects a target point at the eye's distance from the camera, and
computes a gaze direction. A quaternion rotates the eye's rest-forward vector
onto that gaze, clamped to ±14°. The result is converted into the eye bone's
parent space and smoothed with `slerp(delta * 8)`.

**Important:** the Idle clip also animates the eye bones, so slerping from
whatever the mixer wrote each frame never accumulated. The controller now keeps
its own `currentLocal` quaternion per eye and **assigns it after**
`mixer.update()`, making the mixer unable to overwrite the gaze. When the cursor
leaves, both eyes damp back to their rest rotation plus an irregular idle glance.

## 3. Files changed

- `frontend/src/avatar/mouthMorph.ts` — **new**, runtime lip morph builder.
- `frontend/src/avatar/AvatarController.ts` — mouth driver, eye rig, cursor
  tracking, post-mixer eye assignment, debug snapshot helper.
- `frontend/src/components/Avatar.tsx` — passes camera to the controller,
  registers/unregisters pointer listeners, computes NDC.

No backend, database, RAG, voice hook, Electron main, teacher portal or GLB file
changes. Event listeners are added once in `useEffect` and removed in cleanup;
no second animation loop was introduced.

## 4. Verification

Evidence: [mouth closed vs speaking](screenshots/mouth-animation.jpg) ·
[eyes left/right/up/down](screenshots/eye-tracking.jpg)

Runtime checks in Electron via Chrome DevTools Protocol:

| Check | Result |
|---|---|
| Morph target created on `Wolf3D_Skin` (index 0) | PASS |
| Mouth closed at idle / listening, opens at influence 1 with no face corruption | PASS (screenshots) |
| Real Piper WAV + analyser drives mouth: 0 → 0.039 → 0.73 → 0.17, returns to **0** on `setState('idle')` | PASS |
| Eye bones respond to cursor: left/right/up/down produce distinct clamped rotations | PASS (screenshots) |
| Eyes return to rest after cursor leaves (`setCursor(null)`) | PASS |
| Real `pointermove` events produce correct NDC; leaving viewport clears target | PASS |
| Zero WebGL/GLB console errors | PASS |
| `npm run build`, `npm run electron:build`, `npm run check:api-types` | PASS |

## 5. Remaining limitations

- Amplitude-driven only: no phoneme/viseme accuracy, no consonant shapes.
- At full influence the mouth opening is deliberately visible but simple; at
  typical speech levels the movement is subtler.
- No eyelid bones or blink morphs exist, so natural blinking was not added.
- rAF was throttled in the offscreen CDP test session, so animation updates were
  driven explicitly for measurement; the real kiosk uses the existing single
  render loop. Windows hardware was not available for testing.
