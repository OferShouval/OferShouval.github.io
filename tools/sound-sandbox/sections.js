// The site's sections, as the sound sandbox sorts its sounds: each one's patches are in src/sounds/patches/<id>, sounds
// dropped on the sandbox while working on it go into public/sounds/<its first sound folder>, and its pages (the
// .html files in its folder, or the ones it lists) show in the sandbox's preview. Used by dev-server.js and sandbox.js.
export const sections = [
  { id: 'landing', label: 'landing', pages: ['/'], soundFolders: ['landing'] },
  { id: 'music', label: 'music', folder: 'music', soundFolders: ['music', 'unfamiliar-state'] },
  { id: 'art', label: 'art', folder: 'art', soundFolders: ['art'] },
  { id: 'bio', label: 'bio', folder: 'bio', soundFolders: ['bio'] },
  { id: 'teaching', label: 'teaching', folder: 'teaching', soundFolders: ['teaching'] },
  { id: 'shared', label: 'shared', pages: [], soundFolders: ['shared'] }, // Sounds for more than one section (no page of its own)
];

export const sectionOf = (id) => sections.find((section) => section.id === id);

// Which section a sound in public/sounds belongs to, from its folder (null if none claims it)
export function soundSection(src) {
  const folder = src.split('/')[2];
  return sections.find((section) => section.soundFolders.includes(folder))?.id ?? null;
}
