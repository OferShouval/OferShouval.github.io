# Site rebuild — to do

Updated 9 November 2026 (save point 77). Placeholders on the site show as dashed "TODO" boxes in `npm run dev`.

## Content to gather and write

### Music
- [ ] **Unfamiliar State page**: a few lines for "about", and any more credits (players, producer, mixing and mastering, artwork)
- [ ] **Images page**: photos of the band, shows and artwork (it has three empty boxes for now)
- [ ] **Contact page**: check it's what you want (it has your email and the band's Instagram)
- [ ] Bandcamp and Spotify links, if the album should link out to them as well as play on the site
- [x] Unfamiliar State: songs, cover, credits, gapless player
- [x] Videos: all 9 YouTube videos from the channel

### Luminin page
- [ ] A sentence on the Baby's All Right show (under the video)
- [ ] The year of the Odysseus video
- [ ] Show clips: four slots waiting for clips (song title, venue, date)
- [ ] Photos: four slots waiting for photos
- [ ] Close-ups: check the song titles and write a line on each song's mood (one is called "red": is that its real title?)

### Art
- [x] Point in Passing is now a section on the film/animation page (`art/film-animation.html#point-in-passing`)
- [x] The old Point in Passing and Animation pages, and the release template, are archived in `archive/old-pages/`
- [x] The list of everything (`art/all.html`) is archived in `archive/art-list/`, with its links taken out. (Its cards were the only place that needed years for Sun Deity, the visualizers and the animation work.)

### Bio
- [ ] Update the text for the last 5 years (it still reads as written in 2021). **In progress:** the new bio is drafted in the Claude doc "Ofer Shouval — Bio (draft)" (https://claude.ai/artifact/VmuzUtSTfrdr63WRzpotTT): intro, Music, Creative technology and Teaching are done. Next: decide whether to drop the three unwritten sections (What connects it all, Background, What's next), then put it on the page: photo stays put while the text scrolls, intro a bit larger, small lowercase section labels, links to the album, Luminin and Baby's video, "resume · CV" at the bottom. The section headings (Music, Visual art, Teaching) match the site's sections and link to them
- [ ] Give the page its own look (the TV static idea)
- [x] Resume PDF: replaced with the 2026 one

### Teaching (in the navbar, showing an "under construction" sign)
- [ ] Teaching statement, courses, student projects and their permission. The earlier draft of the page (statement, course cards) is in `archive/teaching-draft/`

## Things to decide or finish building
- [ ] **Your own sounds**: the front page and music page sounds in `public/sounds/landing` and `public/sounds/music` aren't playing on any page yet
- [ ] **Old live page** (`music/live.html`): nothing links to it now. Delete it, or keep it for later?
- [ ] **Old recordings page**: it forwards to Unfamiliar State. Show the list again once there's a second release
- [ ] **Album player on iPhones**: test it, including whether it keeps playing with the screen locked
- [ ] **Art landing page**: anything left to do on it? Done so far: the mouse's Luminin-coloured trail, the signs in a column at the top right with the name of the hole pointed at shown at the top middle
- [ ] Favicon and link-preview tags, so shared links show an image and a description

## Before launch
- [ ] Test everything on a phone, especially the navbar and the sketches, which have no mouse there
- [ ] Push `2026_Updates` to GitHub as a backup
- [ ] Add the GitHub Actions deploy workflow
- [ ] Merge to `master` and set Pages → Source to "GitHub Actions" at the same time
- [x] Commit the pending changes: the projects rename, p5 2.x and the Sketchbook
- [x] Ghost Harp: the Pratt line is gone
