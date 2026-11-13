# Sound sandbox: what it should do

Ofer's spec, 2026-11-10. This is the goal for the tool. Build it a piece at a time,
and keep the main controls few and plain (everything else under "all controls").

## First: research existing tools

Before building any of this from scratch, look into existing tools that could be
hooked up to it (Tone.js and others), so we only build what nothing else already
does well. Do this research together with Ofer and decide with him. Until now the
site has used plain Web Audio (src/scripts/patch.js) and no libraries, so switching
is a real decision.

## a) Scenes and transitions

- Pull up any scene of the site (the pond, the dive into the wormhole, the portals,
  the art / music / bio pages...).
- Pull up the **transitions** between scenes too (pond → descending into the
  wormhole, wormhole → a portal, going home...), not only the scenes themselves.

## b) Events and actions in a scene

- For each scene (and transition), list every event or action that happens in it:
  things the page does (a raindrop lands, the descent starts, a portal appears...)
  and things the visitor does (move the mouse, click, scroll, hover, press a key...).

## c) Linking events to sounds

- Any event or action can be tied to a sound: either a **synth patch** Ofer makes,
  or a **sample** he picks.
- An event can also **change a setting in another patch** instead of (or as well
  as) playing a sound. Example: the raindrops. When the descent into the wormhole
  starts, that event changes a parameter of the raindrop patch (brighter, longer,
  lower, more echo...).

## d) The sampler

- Upload a sample.
- Shape it with: filters, reverb, echo, time stretch, reverse, distortion and
  bit-crush (bit distortion).
- Trim it (set where it starts and ends) and put an envelope on it.
- A small library of useful presets to start from.

## e) The synth

- A very simple analog-style synth, something like a Korg minilogue:
  a couple of oscillators, a filter, envelopes, an LFO, and not much more.

## Where things stand (save 88)

- Scenes: only the pond, as a live preview (scene.js). No transitions yet.
- Events: the pond's drops only (every / far / near / clicked), plus "all the time".
  The list of visitor actions (mouse, click, scroll...) was asked for, not built.
- Linking: tracks (tracks.js, saved to src/sounds/scenes/<scene>.json) play a patch
  or sound files on an event. Events changing another patch's settings: not yet.
- Sampler: + sampler makes a sample track; patch.js has filter, echo and random
  pitch for samples. No reverb, stretch, reverse, distortion, trimming, envelope
  or presets yet.
- Synth: patch.js has layers of waves (with pitch slides) and noise, a filter
  with slow breathing, wobble and echo. Not laid out like a minilogue yet.
