# Performer model

Builds `public/models/luminin-performer.glb`: the performer from the sprite sheets as a rigged 3D puppet, in flat
black like the sheets, with the guitar and the Luminin controller. Its build (chest, back, arms, jeans, shoes, head) is
matched to the sheets' silhouettes. It rests in a neutral stance (`NEUTRAL` in `model.js`), and the old swing is baked
in as an animation clip (`FullSwing`).

- Units: metres, y up, the performer facing +z. Standing height about 1.78 m.
- Rig: a node hierarchy, each part a rigid mesh under its joint:
  `performer > hips > spine > neck > head`, `spine > upperArm_L/R > foreArm > hand`,
  `hips > thigh_L/R > shin > foot`, and `guitar` under the root (x along the neck, z out of its face).
- Materials are named (skin, hair, shirt, jeans, shoes, guitar, controller_leds…), all black for now, for recolouring.

To rebuild: in this folder, `npm i`, `node serve.mjs`, then open `http://localhost:5288/build.html?mode=export` (it
writes to `out/`; copy that to `public/models/`). `silhouette.html` renders it as a black silhouette on white, as in the
sheets (`?angle=` round from the front, `?p=` a JSON of changes to the neutral pose), to compare against them.
`verify.html` loads the exported file back and plays the clip.

- `preview-neutral.png`: the neutral stance, from the sheets' angle, the front, the side and behind.
- `preview-match.png`: against the jolt-down sheet's frames 3 and 7, posed like them (sprite left, model middle; right,
  overlaid: black where they agree, red sprite only, blue model only).
