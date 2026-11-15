// A page's soundscape, playing: what the page says is happening (src/scripts/scene_events.js) and what the visitor
// does (visitor.js) go to the engine (engine.js), which plays the tracks made for it in the sound studio
// (tools/sound-studio). No page uses this yet. When one's ready for its sound:
//
//   import soundscape from '../sounds/soundscapes/landing.json';
//   import { playSoundscape } from '../scripts/soundscape/index.js';
//   const playing = playSoundscape(audio, audioOut(), soundscape); // Once the page's sound has started (see sound.js)
//   playing.stop();

import { createEngine } from './engine.js';
import { watchVisitor } from './visitor.js';
import { onScene } from '../scene_events.js';

export function playSoundscape(audio, destination, soundscape) {
  const engine = createEngine(audio, destination);
  engine.load(soundscape);
  const hear = (message) => (message.kind === 'event' ? engine.event(message.name, message.detail) : engine.signal(message.name, message.value));
  const stopScene = onScene(hear);
  const stopVisitor = watchVisitor(window, { event: engine.event, signal: engine.signal });
  engine.event('open');
  return {
    engine,
    stop() {
      stopScene();
      stopVisitor();
      engine.dispose();
    },
  };
}
