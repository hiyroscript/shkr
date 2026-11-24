# Shadow Skirr

A rhythm runner by hiyroscript where the music and the level are the same thing.

## Play

- **Developer build:** https://hiyroscript.github.io/shkr/ serves this repo as-is, and the repo is the developer build. All 30 levels are unlocked with three rainbow stars, and Settings has a developer section for unlocking, resetting and putting progress back, and for playing Infinite Shadow from a chosen seed. Opening the repo's `index.html` from disk gives the same build.
- **Release build:** the normal game, ready to upload to itch.io, Newgrounds and similar sites. Download [`shadow-skirr.zip`](https://github.com/hiyroscript/shkr/releases/download/latest/shadow-skirr.zip) from the rolling `latest` release, or from the `shadow-skirr-release` artifact of any **Build release** run on the Actions tab. `index.html` is at the root of the zip. See [Builds](#builds).

Either way there is nothing to install: open `index.html` in a browser.

## Controls

| Action | Keyboard | Mouse | Touch |
|---|---|---|---|
| Jump | `Space`, `↑`, `W` | left click | tap the right half of the screen |
| Roll | `↓`, `S` | right click | hold the left half of the screen |
| Pause / resume | `Esc` | pause button (top right) | pause button (top right) |

The home screen holds two cards, Infinite Shadow above the levels: `↑` / `↓` (or `PageUp` / `PageDown`, the mouse wheel, a swipe or drag, or a tap on the edge of the other card peeking in) switch between them, and `Enter` or `Space` starts the card in view. On the levels card, `←` / `→` browse levels. On How to play, `←` / `→` step through the pages. `Esc` closes How to play, Settings or Levels and goes back home; in Settings, while the language list is open, the first `Esc` closes only the list. When a card is open (new hazard, pause, level cleared, Infinite Shadow's results, confirmations), `Enter` picks its first button. On the level 1 spike tip, `Enter` is "understood" and no other key does anything. The game also pauses itself when the tab is hidden or the window loses focus.

## Features

- **Infinite Shadow**, an endless run you play against your own high score, generated while you run through The Convergence, where all 30 worlds have collided. See [Infinite Shadow](#infinite-shadow).
- 30 levels plus a home screen, each with its own soundtrack, composed by hand and played live with Web Audio. There are no audio files. Every theme is written for its level the way hiyroscript/alva's are, with a real melody, a counter-line, chords, bass and drums, and sections that follow the level, on instruments that fit it: a wooden flute over a picked nylon guitar in Whispering Pines, a pipe organ, string tremolo and timpani at the Storm Lighthouse, a calliope and a music box at the Carnival, a swung big band on High Steel, a ney, oud and darbuka in the Lantern Bazaar. The Last Light brings the home screen's piano melody back to close the game. Besides the music there is one sound effect: a short, low thud and hiss when you crash, synthesised the same way. It has its own output, so the music volume doesn't change it and the music's fade-out on a crash doesn't cut it off.
- Every level lasts exactly one minute, and each one is measurably harder than the one before: difficulty rises by a steady 10 % per level, from a gentle first minute that anyone can clear to a level 30 about 15.9 times harder, a real expert challenge (see [Difficulty](#difficulty)). Levels 1-9 teach, 10-20 mix, 21-30 stack.
- Levels are built like hand-made set pieces, not one obstacle after another: Bloom towers and tall steps to land on between pits, Halo chains and Comet glides over spike beds, Fade bridges, Rail rides over spike fields with a blade to drop under, castle gates (Prism, gate and low tunnel), crusher decks, Anchor combs that ask for a press every half beat, Glass panes over Coils and a Zenith section on the ceiling. The ground climbs and drops in stairs and towers instead of staying flat, and bars, hanging walls, floating spike blocks, tunnels and crushers keep the space overhead as busy as the ground. Each level reads as clear sections: intro, build, first peak, a one-bar breather, the climax and a short outro, and the music's energy follows them.
- Later levels keep using every hazard the earlier ones introduced and often combine two or three at once: a Halo over a row of Fade tiles, Glass you dive through onto a Coil, a Mimic eye that reads your height inside a Thermal. Level 30 uses all 15. The music marks each combo with a short riser in the bar before it.
- The home screen plays an attract-mode demo run behind the menu.
- The runner is animated procedurally and stays in step with the music. The run cycle is locked to the beat: a foot strikes on every beat and half-beat, and the planted foot never skids along the ground. Jumps get a take-off crouch and a landing crouch, and a Halo air jump is a tucked front flip. Rolls and dives curl into a spinning ball, and charging a Coil revs it up. Moving between poses blends smoothly instead of snapping.
- 15 hazards, each introduced on its own level. How each one works is described in [Hazards](#hazards).
- New hazard cards: the first time you start the level that brings in a hazard (from the home screen, "next level" or "replay"; not on a restart), the game waits, frozen at the start with no music, behind a card that names the hazard, says in a few plain words what to do, and shows it in a small looping preview: the runner meeting that hazard and using it, drawn by the game's own renderer in the level's colours. "Understood" (or `Enter`) starts the run from the first beat.
- How to play (home screen, top right): a carousel of short pages, each with a live looping demo drawn by the game's own renderer, a name and a sentence or two. The pages cover the basics (jump, roll, dive), every plain obstacle (spikes, pits, bars, hanging walls, steps, floating spike blocks, spiked steps, low tunnels, hurdles, crushers, rolling blades) and all 15 hazards, the hazard pages with the same text and demo as their new hazard cards and the level that brings each one in. While a demo presses a button, JUMP or ROLL shows at the bottom of it. "Next" and "back" step through the pages, with dots showing where you are. Below are the hazard colours and a short summary of the goal and the controls.
- Objective box: at the start of a level, a box says "Run to the end" and shows the jump and roll controls side by side. It fades out by itself after a few seconds (later while the mouse is over it), or, on a level with a new hazard card, sits right above the card and leaves with it. Its "Don't show again" checkbox turns it off; the Objective tips setting turns it back on.
- Level 1 spike tip: on level 1 only, for its first spike only, on every run. About one beat before the runner reaches that spike, the game freezes with the music silent. There is no card: the spike gets a red circle, and a note next to it says "Avoid the spikes" and how to jump, with an "understood" button and a 5-second countdown. Either one (or `Enter`) makes the note go, and then the run plays backwards like a rewinding tape (sepia, scan lines, "◀◀ rewind", a tape whirr) to the start of the bar before, about four beats ahead of the spike. From there it plays on with the music, so you get a run-up to the spike you were just shown. With reduced motion the rewind is a short still, then a cut. The countdown and the rewind hold while the window is out of focus or the tab is hidden. It shows again on every new run of level 1: starting or replaying it, restarting from pause, or the retry after a crash. Only the rewound part of a run goes past the spike without it. Nothing about it is saved. The Objective tips setting turns it off.

  | Level | Hazard | Level | Hazard | Level | Hazard |
  |---|---|---|---|---|---|
  | 1 | <img src="docs/hazards/bloom.svg" width="12" height="12" alt=""> Bloom | 11 | <img src="docs/hazards/anchor.svg" width="12" height="12" alt=""> Anchor | 21 | <img src="docs/hazards/mimic.svg" width="12" height="12" alt=""> Mimic |
  | 3 | <img src="docs/hazards/halo.svg" width="12" height="12" alt=""> Halo | 13 | <img src="docs/hazards/rail.svg" width="12" height="12" alt=""> Rail | 23 | <img src="docs/hazards/glass.svg" width="12" height="12" alt=""> Glass |
  | 5 | <img src="docs/hazards/drift.svg" width="12" height="12" alt=""> Drift | 15 | <img src="docs/hazards/rift.svg" width="12" height="12" alt=""> Rift | 25 | <img src="docs/hazards/coil.svg" width="12" height="12" alt=""> Coil |
  | 7 | <img src="docs/hazards/fade.svg" width="12" height="12" alt=""> Fade | 17 | <img src="docs/hazards/comet.svg" width="12" height="12" alt=""> Comet | 27 | <img src="docs/hazards/flicker.svg" width="12" height="12" alt=""> Flicker |
  | 9 | <img src="docs/hazards/prism.svg" width="12" height="12" alt=""> Prism | 19 | <img src="docs/hazards/thermal.svg" width="12" height="12" alt=""> Thermal | 29 | <img src="docs/hazards/zenith.svg" width="12" height="12" alt=""> Zenith |

- Star rating per level, based on how many tries the first clear took: 1 try earns three rainbow stars, up to 3 tries three stars, up to 7 tries two stars, more than that one star. Try counts are recorded per level, and clearing a level unlocks the next one.
- Rebirth: on a cleared level, "rebirth level" clears that level's stars and tries. Unlocked levels stay unlocked.
- Settings: language (the first row; see [Languages](#languages)), sound effects on/off (the crash sound and the spike tip's rewind), music volume, screen shake on/off, objective tips on/off (the objective box at the start of a level or a run and the level 1 spike tip), and reset all progress. Resetting progress also resets Infinite Shadow (best score and distance, runs, time played) and keeps the settings, the language included.
- Language flag: on the home screen, a small round flag of the current language sits right under the "settings" chip. It opens Settings with the language list open.
- Reduced motion: with `prefers-reduced-motion: reduce`, the play button's pulse animation, the foliage sway and the drifting fog wisps are turned off. The home cards snap without sliding or scaling; in Infinite Shadow a world fracture is a cross-fade with no flying shards, and no score numbers pop up. The runner keeps all its poses but drops the purely decorative extras: dust kicks and sparks, the ball's motion trail, the Coil shake, head and hand follow-through, the glide bob and the drifting limbs in a Thermal. Its Rail swing settles without wobbling. A new hazard card, and each How to play page, shows one still frame of its demo instead of the loop.
- Progress and settings are saved in `localStorage`.

## Infinite Shadow

An endless run at a fixed 144 bpm through **The Convergence**, where all 30 worlds have collided into one. One crash ends the run; the goal is to beat your own best score. There are no stars, tries, rebirth or next level.

**Starting.** The home screen stacks two cards in a vertical scroller: Infinite Shadow on top, the levels below, each showing an edge of the other with a label and a chevron. The header and footer stay where they are; the footer's progress rail belongs to the levels, so it fades out on the Infinite Shadow card, which shows its own best instead. Behind the Infinite Shadow card the attract demo becomes an Infinite Shadow run from a fresh seed, generated a couple of milliseconds a frame while the home screen idles and played by the generator's own validated input, fractures and all: it comes on once 20 bars and its first world are ready (a few seconds after the page opens), goes on being made while it plays, and loops after 96 bars. It runs on the home theme's clock and the home music keeps playing across a card switch, because two tempos crossfading on every flick between cards would jar; everything is in beats, so the run looks the same at either tempo. The card you were on is remembered (`homeCard`, the levels by default). The scroller is a labelled region, the card out of view is `aria-hidden` with its buttons out of the tab order, focus follows the card, and the peeking edge never covers the play button at any screen size.

**A run.** The play button wipes to a one-bar count-in (four sticks), then the run starts. The objective box says "Survive as long as you can", with its own "Don't show again" (separate from the levels' box; the Objective tips setting turns both back on). Hazard cards, the spike tip and every other freeze are never shown in a run. `Esc`, the pause button, a hidden tab or a lost window focus pause it: resume, restart (a new run from a new seed) or quit. A restarted or quit run counts as a run and as time played, never as a best. About 0.6 s after a crash comes the results card: the score, the best, time survived (m:ss), distance (1 unit = 1 m, 9.6 m a second), hazards used and a chip with the hazard used most, then "run again" (first, solid) and "home". A new best gets its own headline, a burst of particles, and the old best crossed out.

**Score.** One point for every half-beat cell run, 25 for every hazard used (a Bloom bounce, a Halo air jump, a Fade tile, a Prism gate, a Rail grab, a Rift, a Comet glide, getting past a Mimic eye, breaking Glass, a Coil launch, landing on a Flicker tile, and leaving a Drift, Anchor, Thermal or Zenith zone), and 50 for every combo piece cleared. A small "+25" pops up in the hazard's colour, and "+50 combo" (or "+75 combo" right after a use) in the combo's. With reduced motion nothing pops. The score depends only on the seed and the input, so a replay scores the same.

**HUD.** The score, big and in tabular figures, top left; "best 1234" and the pause button top right. The rail along the top is a chase bar that fills towards your best; once you pass it, it turns into a solid bright line with a "new best" tag. In the world, the distance of your best run is marked by a dashed line with a "best" tag.

**Speed and difficulty.** The tempo never changes. Difficulty is measured with the same D as the levels (see [Difficulty](#difficulty)), per minute (36 bars at 144 bpm):

| Part | Bars | Aim |
|---|---|---|
| Warm-up | 1-8 | about D(3); the first 2 bars hold no hazard |
| Ramp | 9-54 (to about 90 s) | climbing from D(3) to the cruise band |
| Cruise | 55 on, for ever | every minute inside D(10) to D(14) (0.95 to 1.39), never above about D(16) |

Inside that, difficulty breathes in waves like a level's sections: a build, a peak (where combos come), a one-bar breather with no input, a second peak and a cool-down, in cycles of 12, 16 or 20 bars whose order varies. A minute's presses are aimed at the D its waves ask for (actions per bar from the level each bar aims at, scaled by how D compares to actions per second over the last 36 bars and by the breathers the minute will hold), and once two thirds of a minute are made, no chunk may take that minute out of the band.

**Fairness.** Every chunk is solved from the exact state the run reaches it in, with the margin 0.08 and inputs changed only every 12 ticks (DEC 12), then replayed at margin 0 on the real stream. It passes the view rule (every input is for something on screen a beat ahead, at the narrowest view), the density band of levels 10-20 (3.5 to 5.0 obstacle characters a bar, averaged over the last 36 bars, each chunk within 0.8 of it) with no gap over 2 beats between busy cells except at a breather, and the ground never stays at one height for more than 3 bars. A chunk that fails any rule is thrown away and made again: new knob values (4 tries), then another template (8), then the plain safe generator (3), then a quiet chunk with no hazard, and in the end flat ground. There is no cheap death: nothing you cannot see in time, and nothing the solver could not get through.

**How the world is made** (`js/infinite.js`, global `INF`, no DOM or audio). Everything comes from one 32-bit seed, fresh for every run (`crypto.getRandomValues`, or `Math.random` without it): the same seed is the same run. The generator writes chart phrases in the same language as `js/levels.js`, so every hazard's rules stay in `js/sim.js`:

- **Chunks** of 2 to 4 bars (a breather is 1), each `. content ..`, so it starts and ends on a neutral seam: flat solid ground with no zone, rail or glide open. The ground stays between -6 and +10 units.
- **Atoms and connective terrain**: a table of measured motifs (pits, steps up and down, towers, spikes, bars, hanging walls, floating blocks, tunnels, crushers, rolling blades) and the pairs of them that may touch (measured by solving every pair).
- **Set pieces** for all 15 hazards, each with its own knobs (lengths, heights, counts, spacing), and **combos** from an explicit table of which hazards go together and how (overlapping, chained, or one inside the other's zone).
- **Variety**: every hazard comes round at least every 75 bars, and none is in more than two pieces in a row; a template is not used again within 8 bars, the same template with the same knob values not within 5 minutes, and a template used again changes at least 2 knobs.
- **Biomes**: 16 to 32 bars of one world, all 30 worlds (each level's theme) before any repeats, in a seeded shuffle, never two of a family (woods, sea, iron, halls...) in a row.

**The Convergence.** The renderer holds two worlds at once. Where one biome meets the next there is a fracture about 2 bars wide: a torn, jagged diagonal crack with a faint white glow, shards of the old world's far layer drifting off, the ground's detail style switching, and both worlds' particles mixed. With reduced motion it is a plain cross-fade with no shards. Far away in the fog, collision motifs from a third world hang in the sky: a ring-sun, zeppelins, the Inverted Citadel's towers. Hazard colours never change.

**Music.** `THEMES.inf`, hand-written at 144 bpm in E dorian, with a section for each wave phase (intro, groove, build, peak, the breather, climax, cool-down) and lydian for the intro and breathers. The lead and its answer change with each world's family (flute and organ in the woods, music box and upright bass by the sea, oud and brass in sand and fire, kalimba and string tremolo in iron and city, piano and celesta in halls, caves and sky). The home screen's piano melody recurs as the action line: every press gets a lead note taken from it, on a chord tone on the beat. A riser marks the bar before each combo. The song is written bar by bar as the world is made (`MUSIC.makeStream`, `MUSIC.extend`), and played events are dropped, so its list stays short.

**Performance.** The run starts with 16 bars made (during the wipe) and stays at least 12 bars ahead. Generation runs at the end of each frame in what is left of it: a steady few tenths of a millisecond (the measured cost of a bar, times the bars the runner eats a frame, with headroom), more when the buffer is short; if it ever fell under 3 bars, a safe chunk would be made at once. Everything two screens behind the runner is trimmed from the stream (`SIM.trim`), and the generator keeps the last 80 bars of its own memory (the difficulty control reads 36, the combo rate 72). The next world's backdrop is built 1.5 ms a frame from 24 bars before its fracture, with a GPU downscale instead of a blur filter for its far layers. Under 4× CPU throttling a run measures close to a level (frame p50 about 24 ms against 18 to 20, generation p50 1.1 ms a frame); unthrottled both hold 60 fps.

**Save.** `inf: { best, bestDist, runs, totalTime, objHide }`: best score, the distance its run ended at, runs, seconds played, and the objective box's "Don't show again".

**Checks.** `node tools/infinite-check.js` runs the generator on 300 seeds of 10 minutes each (`--seeds N`, `--minutes M`, `--seed S` for one seed with every minute's terms, `--ci` for the CI size: 24 seeds of 6 minutes). It replays every chunk on its own and every seed's whole run in one go, and checks every hard rule (margin 0.08 at DEC 12, the view rule, density, gaps, flat ground, the height band, no input in a breather), D per minute against the band and the ceiling, all 15 hazards in every 3-minute window and none in more than two pieces in a row, combos 4 to 10 places a minute while cruising, the safe generator under 0.5 % of chunks, that a seed always makes the same run, and that 300 seeds' first 32 bars are all different. It prints a table of D per minute (average, minimum, maximum, target, terms), hazard uses, combo rate, the fallback rate and generation time per chunk (p50, p95, max), and exits non-zero on any failure.

## Languages

The whole game can be played in ten languages. English is the main one: it is the default, and any string missing from another language falls back to it.

| Code | Language | Flag | `<html lang>` |
|---|---|---|---|
| `en` | English | United States | `en` |
| `zh` | 中文 (Mandarin, Simplified Chinese) | China | `zh-Hans` |
| `es` | Español | Spain | `es` |
| `ru` | Русский | Russia | `ru` |
| `ja` | 日本語 | Japan | `ja` |
| `pt` | Português (Brazil) | Brazil | `pt-BR` |
| `de` | Deutsch | Germany | `de` |
| `fr` | Français | France | `fr` |
| `ko` | 한국어 | South Korea | `ko` |
| `pl` | Polski | Poland | `pl` |

- **Choosing.** Settings has Language as its first row: a chip with the current language's round flag and its own name. It opens a list of all ten, the current one marked (`aria-pressed`, `aria-current`). Arrow keys move between them, `Home` / `End` jump to the ends, `Enter` picks, `Esc` closes the list. Picking applies at once, with no reload: every screen, card, How to play page, the HUD, the objective box, the spike tip and the JUMP / ROLL label on the demos. The round flag under the home screen's "settings" chip shows the current language and opens Settings with the list open.
- **Default.** Until the player picks one, the game uses the first of the browser's languages (`navigator.languages`) it has, matched by prefix (`zh-TW` → 中文, `pt-PT` → Português), else English. That guess is not saved; a choice is (`lang` in the save, `null` until then). Resetting progress keeps it. `<html lang>` follows the language, so screen readers, hyphenation and fonts follow it too.
- **Names.** Hazard and level names are translated where a translation reads well, and kept as proper nouns in katakana / Hangul in Japanese and Korean. They read the same on the hazard cards, in How to play and on the home screen. `js/levels.js` keeps its English names as data; the game translates them when it shows them.
- **Fonts.** Space Grotesk and JetBrains Mono cover Latin (and the mono, Cyrillic). Chinese, Japanese, Korean and Cyrillic otherwise come from system fonts: `--disp` and `--mono` in `css/style.css` end in Cyrillic-capable sans faces and a CJK stack (`--cjk`) whose order follows `:lang()`, so Han characters get Chinese shapes in Chinese and Japanese shapes in Japanese. In Chinese, Japanese and Korean the wide letter-spacing of tags, chips and labels is dropped. Long words (German, Russian, Polish, Portuguese) wrap or hyphenate instead of running out of their box, and a home-screen title with a word too long for it shrinks until it fits.
- **Flags** are drawn as inline SVG by `I18N.flagSVG(code)`: no image files and no emoji (Windows has no flag emoji). Each flag covers its circle like `object-fit: cover`, centred on the part that matters, with a thin dark outline; the US flag shows its canton and stripes with a reduced star pattern, Spain has no coat of arms, Brazil's globe has no motto, and France uses three equal bands. Every flag gets its own clip-path ids.

**Adding a string.** Give it a stable id, add it to `STR.en` in `js/i18n.js` with the English text, then to every other language. In the page, mark the element `data-i18n="id"` (text) or `data-i18n-aria="id"` (`aria-label`); in `js/game.js`, use `t("id")`, with `{name}` / `{n}` placeholders filled from `t("id", { name: ... })`. A count that changes the words uses a plural family (`id.one`, `id.few`, `id.many`, `id.other`) and `tn("id", n)`, which picks the form with `Intl.PluralRules`. Run `node tools/i18n-check.js`.

**Adding a language.** Add it to `LANGS` in `js/i18n.js` (code, its own name, flag id, `<html lang>` code), a full `STR` table with every English key, and a flag in `FLAGS`. If its script needs other fonts, extend the stacks in `css/style.css`. `tools/i18n-check.js` lists the ten languages it expects, so update it too.

`node tools/i18n-check.js` fails if a language is missing a key English has or has one English doesn't, if a string's placeholders differ from the English ones, if a plural family is incomplete, if the English level or hazard names drift from `js/levels.js`, if `index.html` or `js/game.js` uses an id English doesn't have, or if a flag doesn't draw. It runs on every release build. The developer-only UI (`js/dev.js`) stays in English.

## Hazards

Everything in the game is timed in beats, so the timings below hold at every tempo. Touching anything deadly, or falling into a pit, sends you back to the start of the level for a new try.

### The basics

- **Jump** keeps you in the air for one beat and lifts your feet to about one and a half times your height. A press up to 0.2 beats before you land still counts, and so does one up to 0.15 beats after you run off a ledge.
- **Roll** lasts at least a quarter of a beat, and you stay down while something is still overhead.
- **Dive:** roll while you are in the air and you fall three times as fast. It cuts a jump short, and it is how you break Glass.
- **Plain obstacles** take the colours of each level's scenery:
  - spikes, wide spikes and tall spikes: jump them;
  - bars hanging just above the ground: roll under them;
  - walls that hang down to just above your head: stay on the ground and don't jump;
  - pits: jump them;
  - steps up and down. Running into the face of a step up kills you, so jump onto it. The tallest steps are too high for a plain jump and always come with a Bloom, Halo, Rift or Coil to get you up;
  - floating spike blocks at mid height (from level 2): too high to run under standing and too low to clear with a jump from close up. Roll under, or jump early;
  - spiked steps (from level 6): a step up with spikes along its top edge. Jump from further back so you land past them;
  - low tunnels (from level 10): a long, low ceiling with spikes on top. Roll through the whole of it; you can't jump inside;
  - hurdle pairs (from level 14): a spike with a bar one beat after it. Jump the spike, then roll (or dive) as soon as you come down;
  - crushers (from level 18): heavy blocks that pound the ground on every off-beat and lift on every beat. One you reach while it is down is a block to jump over; one you reach while it is up is overhead, so stay on the ground;
  - rolling blades (from level 22): saws rolling towards you along the ground at half your speed. Jump them as they arrive.

Every hazard below has its own colour, so you can always tell it from the scenery. A **zone** hazard (Drift, Anchor, Thermal, Zenith) is a tinted band with dashed edges: its rules apply while you are inside it.

### <img src="docs/hazards/bloom.svg" width="16" height="16" alt=""> Bloom (level 1, red `#FF2952`)

A bounce pad on the ground. Run onto it and it throws you about twice as high as a normal jump, for about one and a half beats in the air. Blooms sit in front of wide pits and tall steps. Jumping over one skips the bounce, and it never hurts you. If you are still holding roll when it launches you, you won't dive until you let go.

### <img src="docs/hazards/halo.svg" width="16" height="16" alt=""> Halo (level 3, cyan `#19E3E3`)

A ring floating at head height. Jump through it and you get one extra jump in mid-air, which you keep until you land. Press jump again in the air to use it. A Halo you touch while running on the ground is wasted, because landing clears the extra jump.

### <img src="docs/hazards/drift.svg" width="16" height="16" alt=""> Drift (level 5, purple `#A64DFF`, zone with rising bubbles)

Low gravity. Jumps last one and a half beats instead of one and go about a third higher. The pits and obstacles inside are spaced for these longer, floatier jumps.

### <img src="docs/hazards/fade.svg" width="16" height="16" alt=""> Fade (level 7, green `#1FE05C`)

Stepping-stone tiles over a pit. A tile starts to fade the moment you touch it and is gone a little under half a beat later (0.42 beats). Land and jump straight on. Tiles you never touch stay put. A row of tiles fades all at once, counted from when you first touch it.

### <img src="docs/hazards/prism.svg" width="16" height="16" alt=""> Prism (level 9, orange `#FF9F1A`)

A spinning crystal at head height, followed by a gate: a tall column of orange diamonds that you can't jump over. Run or jump through the crystal and the gate opens as you reach it. Reach the gate without the crystal and it kills you. Rolling under the crystal misses it.

### <img src="docs/hazards/anchor.svg" width="16" height="16" alt=""> Anchor (level 11, sky blue `#1FA8FF`, zone with falling chevrons)

Heavy gravity. Jumps last only half a beat and reach about 70% of the usual height. The obstacles inside are packed tight to match: narrow pits and small spikes, often one every half beat.

### <img src="docs/hazards/rail.svg" width="16" height="16" alt=""> Rail (level 13, lime `#B5F51B`)

A bar overhead that you can hang from.

- Jump and keep holding jump: near the top of the jump you grab the rail and ride along it.
- Hold jump to keep hanging, and let go to drop. You also drop at the end of the rail.
- Hold roll while hanging to pull your legs up over tall posts.
- You can't hang past a spiked blade on the rail. Let go before it, run under it on the ground, then jump and grab the rail again.

### <img src="docs/hazards/rift.svg" width="16" height="16" alt=""> Rift (level 15, magenta `#EE3DFF`)

A portal at head height with a dashed line up to its exit. Run or jump into it and it lifts you straight up to about twice the height of a jump, where you hang still for an instant and then fall. Rifts get you onto ledges too tall to jump. Rolling under one misses it, and each Rift works once per try. A Rift sits right in front of the tall step it lifts you onto, so run straight in and you fall against the step's face before you are over it: tap roll just before the Rift, so that you stand up inside it, a little later and closer to the step, and you land on top.

### <img src="docs/hazards/comet.svg" width="16" height="16" alt=""> Comet (level 17, yellow `#FFEE1A`)

A comet floating just above head height. Catch it in mid-air and you glide level for one beat, carried across pits without falling. Roll to drop out of the glide early, and landing ends it. It only works in the air: running under it does nothing.

### <img src="docs/hazards/thermal.svg" width="16" height="16" alt=""> Thermal (level 19, orange-red `#FF5B2E`, zone with rising wavy lines)

An updraft that carries you up on its own, to almost twice the height of a jump. Jump does nothing inside it, and holding roll makes you sink (or roll along the ground if you are already down). Inside, rocks rise from the ground and blocks hang from above. Float over the rocks, and sink under the blocks.

### <img src="docs/hazards/mimic.svg" width="16" height="16" alt=""> Mimic (level 21, deep blue `#3D6BFF`)

An eye on a post, followed by a beam.

- When you pass the eye, it records whether you were in the air (more than about half your height off the ground) or on the ground. Its pupil looks up or down to show what it saw.
- The beam then fires at the height where you were:
  - if you passed the eye on the ground, the beam runs along the ground, and you must jump over it;
  - if you passed the eye in the air, the beam fills the space above head height, and you must stay on the ground.
- In short: whatever you did at the eye, do the opposite at the beam. Until the eye has seen you, the beam's path is a dashed line.

### <img src="docs/hazards/glass.svg" width="16" height="16" alt=""> Glass (level 23, bright green `#4BEB2A`)

A glass pane high above the ground, often level with the ground you just came from. You can run across it, and bumping its underside while jumping just stops you. To get below it, dive onto it: roll in mid-air as you land, and it shatters and you fall through. Running into its edge side-on kills you, like a wall.

### <img src="docs/hazards/coil.svg" width="16" height="16" alt=""> Coil (level 25, teal `#19E8A6`)

A spring on the ground.

- Roll onto it and keep holding roll to charge it. The spring squeezes down as it charges.
- Let go of roll, or roll off its end, to launch.
- You need at least 0.15 beats of charge. A full beat of charge gives the biggest launch, as high as a Bloom bounce.
- Jumping off the Coil instead throws the charge away.

### <img src="docs/hazards/flicker.svg" width="16" height="16" alt=""> Flicker (level 27, pink `#FF3DB5`)

Floor tiles in two sets. One set is solid and the other is only a dashed outline that you fall through. Every jump you make swaps the sets, including a Halo's mid-air jump. Bloom bounces, Coil launches and Rift lifts don't swap them. Count your jumps so the tile you land on is solid when you get there.

### <img src="docs/hazards/zenith.svg" width="16" height="16" alt=""> Zenith (level 29, indigo `#6A4DFF`, zone with upward chevrons)

Gravity flips. When you enter the zone you are thrown up onto the ceiling and run along it upside down, with the level mirrored above you. Jump and roll still work relative to you: jump pushes you away from the ceiling. Leaving the zone flips you back down. A gap in the ceiling is a pit like any other.

## Difficulty

Every level is scored with one number, **D**, measured from the level itself and from the solver's path through it:

| Term | What it measures |
|---|---|
| `aps` | required actions per second: presses of jump or roll on a minimal winning path, plus the releases whose timing matters (dropping off a Rail, launching off a Coil) |
| `gap` | the 10th-percentile time between consecutive actions (the fastest bursts) |
| `slack` | the largest safety margin (0 to 0.3) the level still solves with; less slack means tighter timing somewhere |
| `mech` | mean number of different hazards in each 2-bar window |
| `combo` | places per minute where two different hazards are within 2 beats of each other, or one sits inside another's zone |
| `rest` | fraction of bars with no action |

```
D = aps · (1 + 0.2·mech) · (1 + 0.15·combo/10) · (1 + 0.3·(0.3 − slack)/0.3) · (1 − 0.5·rest) · (0.25 / max(gap10, 0.12))^0.1
```

Level 1 sets the anchor, and every level n is built to land within ±1.5 % of `D(1) · 1.10^(n−1)`, and at 1.08 to 1.12 times the level before it, so D rises strictly and steadily from level to level and level 30 is about 15.9 times level 1. The 10 % step is the design rule of the game, not a fit to the measurements: when a level misses, the level is rebuilt, never the weights. Level 1 is anchored low on purpose (single, generously timed inputs at 112 bpm, D ≈ 0.40), so that the climb ends at "really hard but fair". The bands: levels 1-9 are easy (1× to 2.14×), 10-20 medium (2.36× to 6.12×), 21-30 hard (6.73× to 15.86×). `tools/difficulty.js` explains the weights.

The climb comes from four places at once. Tempo rises from 112 to 200 bpm (0 or 4 bpm per level, and a level always has bpm / 4 bars, so it stays one minute long). Required presses rise from about one a bar on level 1 to three or four a bar on level 30, where Anchor combs ask for one every half beat. Mixing rises from one hazard in view to three or four, with combos stacked back to back. And the last levels each have one deliberately tight window (still solvable with the 0.04 margin), which shows up as less slack.

### Density

Every level is also kept busy. Counting the chart the way `tools/density.js` does (each chart character is half a beat; obstacle characters are the non-`.` characters of the terrain row; a cell is busy when its terrain is not `.` or its overlay holds a hazard object):

| Levels | Obstacle characters per bar | Longest gap between busy cells after the 2-bar intro |
|---|---|---|
| 1-9 | 2.5 to 3.5 | 3 beats |
| 10-20 | 3.5 to 5.0 | 2 beats |
| 21-30 | 5.0 to 7.0 | 1.5 beats, except one breather bar (up to 4 beats) before the climax |

The ground also never stays at one height for more than 3 bars after the intro (most levels stay under 2): steps, drops, pits, tiles and Glass give every level a height profile. Many obstacle characters need no input at all (a hanging wall to stay under, a step down, the pit cells under a Comet glide or a Rail ride), which is how level 1 can be dense and still gentle. From level 10, something hangs overhead in roughly a quarter to a half of the busy cells (`density.js` prints it as `over`).

Every level is also checked for fairness: it must solve with a safety margin (0.12 on level 1, 0.08 on 2-10, 0.06 on 11-20, 0.04 on 21-30) and, on levels 1-20, with inputs changed only every 12 ticks, so no move needs a window shorter than two solver decisions.

```sh
node tools/difficulty.js          # the D table: every level's terms, D, target, % off, ratio to the level before (10-20 or 1-30 also work)
node tools/density.js             # instant: obstacle characters per bar, median and longest gaps, empty bars, against the bands
node tools/check-levels.js        # every rule: 60 s, solvable and fair, hazard reuse, obstacle variety, set pieces, the curve and the ratio, density
```

`check-levels.js` exits non-zero on any failure and runs on every release build, before the build step. It takes several minutes, because it solves every level several times.

Infinite Shadow is scored with the same D, a minute (36 bars) at a time, and kept inside the band of levels 10 to 14 once it cruises; see [Infinite Shadow](#infinite-shadow). The density bands, the fairness margin 0.08, DEC 12 and the view rule are shared code: `INF.rules` in `js/infinite.js` is what `density.js`, `difficulty.js`, `check-levels.js` and `infinite-check.js` all call.

## Project structure

```
shkr/
├── index.html          page markup (screens, HUD, overlay) and the script tags
├── css/
│   └── style.css       UI ported from hiyroscript/vl: tokens, type, chips, bars, orb, wipe, cards and panels
├── js/
│   ├── dev-config.js   developer build only: points the save at its own key (loaded first)
│   ├── sim.js          deterministic fixed-timestep simulation, shared by the game and the Node beatability solver; also streams Infinite Shadow (SIM.stream / append / trim)
│   ├── levels.js       the 30 hand-written charts, the hazard list (HAZ), the newer plain obstacles (OBST) and the home screen chart (HOME)
│   ├── i18n.js         the languages: every player-visible string in ten languages (I18N.t), and the round flags as inline SVG
│   ├── fixes.js        per-level fix-ups applied when a level compiles (currently empty)
│   ├── infinite.js     Infinite Shadow's generator (INF): waves, biomes, set pieces, combos, validation; the density, D and view rules the tools share (INF.rules)
│   ├── demo.js         precomputed input for the home screen's attract-mode demo (DEMO_SOL)
│   ├── synth.js        the instruments and the notation of the themes, ported from hiyroscript/alva's audio engine
│   ├── themes.js       the soundtracks: a theme composed by hand for the home screen, each of the 30 levels and Infinite Shadow
│   ├── music.js        the soundtrack engine: writes a level's theme out as notes on the beat grid, a look-ahead scheduler that plays them in time with the run, the master mix, and the sound effects (MUSIC.sfx: crash, rewind)
│   ├── backdrops.js    the terrain background layer: five looping parallax strips of fog-grey silhouettes per world
│   ├── render.js       "fog silhouette" renderer: misty sky, grey layers, black terrain, colour only on hazards, and the runner's animation (RENDER.create makes a second one for the hazard previews)
│   ├── game.js         state, clock, input, HUD, home screen and its cards, objective box, new hazard cards and their previews, spike tip, How to play, results, rebirth, Infinite Shadow's runs
│   └── dev.js          developer build only: rainbow unlock-all default, developer section in Settings, Infinite Shadow seeds, soundtrack player, DEV badge (loaded last)
├── tools/
│   ├── build-release.sh   makes the release: the repo minus the developer code, with a guard against leaks
│   ├── i18n-check.js      checks the translations: the same keys and placeholders in every language, the ids the game uses, the flags
│   ├── parity-check.js    proves the release plays exactly like the source
│   ├── difficulty.js      scores every level's difficulty D and prints it against the 1.10-per-level curve
│   ├── density.js         measures how busy every chart is (obstacles per bar, gaps) against the density bands
│   ├── check-levels.js    checks every level: 60 s long, solvable and fair, hazards reused, on the curve, dense enough
│   ├── infinite-check.js  checks Infinite Shadow's generator on many seeds: fairness, D per minute, coverage, combos, fallbacks, determinism
│   ├── sim-parity.js      proves the streaming refactor of sim.js left the levels and the demo bit-for-bit as they were (old sim.js from git)
│   └── music-check.js     checks every soundtrack: its theme's notation and instruments, the grid, the swing; with --render / --perf, loudness, voices and timing in Chromium
├── .github/
│   └── workflows/
│       └── build.yml   on every push to main: translation, level and Infinite Shadow checks, build, guard, parity check, zip, publish
├── docs/
│   └── hazards/        colour swatches for the README's hazard list, one SVG per hazard (colours from HAZ in js/levels.js)
├── README.md
└── max                 design brief
```

## How it works

- The simulation (`SIM`) runs on a fixed timestep measured in beats: 96 ticks per beat, 4 world units per beat. Because everything is in beats, a level plays the same at any tempo.
- Levels are written as compact chart strings. A phrase is `terrain/overlay`, each character is half a beat, and a level's form string chains one-letter phrase keys, with digits setting the musical energy (0-4) of the bars that follow.
- Each level's soundtrack is a theme composed for it (`js/themes.js`): a hook, a counter-line, chords, a bass line and drums, in sections that follow the form string's energy digits. An intro, the groove coming in, a build, a full peak, the one-bar breather with a riser into the climax (the longest climaxes climb in two or three steps), a short outro, and a sting that rings out after the last bar. It plays at the level's tempo, on the same beat grid as the chart, and a soft riser marks the bar before each combo. The home screen's theme loops, four passes that are each a little different. See Development notes (Music) for the details.
- The game clock follows the audio clock while music is playing, so input and visuals stay on the beat.
- Infinite Shadow plays on a stream instead of a compiled level. `SIM.stream(def)` makes an empty one (its end is `Infinity`), `SIM.append(L, phrase, energy)` compiles one more chunk onto its end with the same per-cell code `SIM.compile` uses (one shared builder), and `SIM.trim(L, x, s)` drops what is far behind. The chart and energy arrays grow as it does, and every position stays an exact multiple of a cell, so a long run stays precise. The levels compile exactly as they did before the refactor: `node tools/sim-parity.js` compares the old `sim.js` (from git) with the new one on every level, the solver, replays, a tick-by-tick lockstep, the demo and 300 random charts. `SIM.step` also emits a few events the score needs (`fade`, `flick`, `dodge`, and `exit` plus a zone's letter when you leave Drift, Anchor, Thermal or Zenith); they change no state, so the levels play the same.

## Builds

One source tree, two builds:

| | Developer build | Release build |
|---|---|---|
| Where | this repo, served as-is by GitHub Pages at https://hiyroscript.github.io/shkr/ | [`shadow-skirr.zip`](https://github.com/hiyroscript/shkr/releases/download/latest/shadow-skirr.zip), or the `shadow-skirr-release` artifact of a workflow run |
| What | the whole repo: the game plus `js/dev-config.js` and `js/dev.js` | only what the game needs to run: `index.html`, `css/` and the game's `js/` files, with all developer code removed |
| Progress | every level unlocked with three rainbow stars on first load | the player's own: a new save starts at level 1 with no stars |
| Extras | developer section in Settings (Infinite Shadow seeds included), DEV badge on the home screen | none |
| Save key | `shadowskirr.dev.v1` (snapshot for "put back": `shadowskirr.dev.snapshot`) | `shadowskirr.v1` (old `lumbra.v1` saves are migrated) |

The developer build needs no build step: Pages keeps deploying the `main` branch root exactly as before. Because the two builds use different save keys, the developer build never reads or writes a player's real save, even on the same origin.

**Developer section** (Settings, below the normal rows). Each progress action asks for confirmation first, keeps the settings (sound effects, music, shake, objective tips, language, the home card), and returns to the home screen.

- *Unlock all (rainbow)*: every level unlocked with three rainbow stars. Infinite Shadow is left as it is.
- *Reset progress*: a fresh game (level 1, no stars, no tries, and Infinite Shadow with no best, runs or time), to test the real first-time flow.
- *Put progress back*: restores unlocks, stars, tries, the selected level and Infinite Shadow's record exactly as they were right before the last reset, unlock all or set best to 0. Each of those saves a snapshot first. One level of undo, and the button is disabled when there is no snapshot.
- *Infinite Shadow seed*: shows the seed of the last run this session (hex and decimal) and plays the exact run of a typed seed (`0x1f2e3d4c` or `123456`); a seed that isn't one is marked and nothing starts.
- *Set best to 0*: Infinite Shadow's best score and distance back to 0, to see a first new best again (runs and time played stay).
- *Soundtracks*: a screen to listen to every track outside a run, the home track, the 30 levels and Infinite Shadow's endless stream, to judge and adjust the music. Infinite Shadow's track is generated from one fixed seed as it plays; its bar map shows a window of bars around the one playing, with each bar's wave phase and world. It shows the level's theme (tempo, key and scale, the instruments of each part, reverb, swing and level) and a map of its bars (height = energy, a dot on the bar before each combo); click a bar to play from it (on the home track, the pass shows too). Play / stop, previous / next, what happens at the end of a track (stop, repeat, next), and mutes for each part (lead, answer, harmony, bass, drums, fx, as the theme's channels name them): a mute plays on from the same beat without that part. Keys: `Space` play / stop, `←` / `→` previous / next track, `Esc` back to Settings, which restarts the home track. It needs no confirmation and doesn't touch progress or settings (the music volume applies).

**Release build.** `.github/workflows/build.yml` runs on every push to `main` (except pushes that only touch `max`, Markdown files or `docs/`, none of which go into the release) and on manual runs:

1. `node tools/i18n-check.js` checks the translations (see [Languages](#languages)), `node tools/check-levels.js` checks every level against the rules in [Difficulty](#difficulty), and `node tools/infinite-check.js --ci` checks Infinite Shadow's generator on 24 seeds of 6 minutes (about two minutes; see [Infinite Shadow](#infinite-shadow)). Any one stops the job on any failure.
2. `bash tools/build-release.sh dist/release` copies `index.html`, `css/` and `js/` and nothing else (no `README.md`, `max`, `tools/`, `.github/` or `.git`), deletes `js/dev.js` and `js/dev-config.js`, removes the `<!-- dev-only -->` lines from `index.html`, and stamps `<meta name="shkr-build" content="dev">` as `release · <short-sha> · <UTC date>`. Its guard then fails the build if the output still contains `dev.js`, `dev-config.js`, `dev-only`, `shadowskirr.dev`, the developer section's ids or text, or any definition of `SHKR_DEV` / `SHKR_DEV_INIT`; if `js/infinite.js` touches the page, audio, storage or the developer hooks (it must stay pure, so the tools run the file the game does); if `index.html` loads a file that is missing; or if the release holds a file that `index.html` does not load.
3. `node tools/parity-check.js . dist/release` checks that the release holds only `index.html`, `css/` and `js/`, and that every shared file is byte-identical (`index.html` may differ only by the removed dev-only lines and the stamp), then loads `sim.js`, `levels.js`, `fixes.js`, `infinite.js` and `demo.js` from both trees in separate `vm` contexts. Every level and the home chart must compile identically, each level's solver solution must replay to the same final state, a seeded run that dies part-way must match on every tick, and the attract-mode demo (`DEMO_SOL`) must replay identically. The first 64 bars of a fixed Infinite Shadow seed must generate the same chunks, chart, input path and compiled stream in both, and that path must replay the same on both streams, tick by tick. It prints a table and names the first differing field on failure.
4. Only if all of them pass: zip `dist/release` with `index.html` at the root, upload it as the `shadow-skirr-release` artifact, and replace the rolling `latest` release (tag, title "Shadow Skirr — latest build", commit SHA, date and message in the notes). A manual run on another branch builds, checks and uploads the artifact but leaves `latest` alone.

The gate cannot be skipped: there is no flag for it, and it runs in the same job as the zip.

To build and check locally:

```sh
bash tools/build-release.sh /tmp/shadow-skirr
node tools/parity-check.js . /tmp/shadow-skirr
```

**The dev-only marker rule.** Anything that exists only for the developer build must be removable by the build:

- A whole developer file goes in `js/` and is deleted by `tools/build-release.sh` (add it there and to `DEV_FILES` in `tools/parity-check.js`).
- Anything else the game needs at runtime must be loaded by `index.html`, because the release keeps only `index.html` and the files it loads. A file in `css/` or `js/` that `index.html` doesn't load fails the build.
- Any line of `index.html` that only the developer build should have ends with `<!-- dev-only -->` on the same line, like the two dev `<script>` tags.
- Shared code (`js/*.js` other than the dev files, `css/style.css`) must not contain developer code. `js/game.js` only reads the optional `window.SHKR_DEV.saveKey` and calls `window.SHKR_DEV_INIT` if it exists, which does nothing in the release.

## Development notes

- **Script load order matters.** The JS files are classic scripts that share top-level globals (`SIM`, `HAZ`, `LEVELS`, `HOME`, `I18N`, `FIXES`, `INF`, `DEMO_SOL`, `SYNTH`, `THEMES`, `MUSIC`, `BACKDROPS`, `RENDER`). They must load in this order, at the end of `<body>`, without `defer`, `async` or `type="module"`:
  `dev-config.js` → `sim.js` → `levels.js` → `i18n.js` → `fixes.js` → `infinite.js` → `demo.js` → `synth.js` → `themes.js` → `music.js` → `backdrops.js` → `render.js` → `game.js` → `dev.js`
  `dev-config.js` comes first so `game.js` sees the developer save key, and `dev.js` comes last. Both are stripped from the release, which loads `sim.js` through `game.js` only.
- **Don't convert to ES modules** unless you also refactor the shared globals and serve the game from a local server. Modules don't share a global scope and don't load from `file://`.
- **Runner animation** is view-only. The stickman section of `js/render.js` reads the simulation state, the beat and the frame time, but never writes to `SIM` state, so replays and the demo are unaffected. `game.js` passes each simulation event to it through `RENDER.cue`. Every tunable (run cycle keys, blend rates, ball, hang, glide, timings) is in the `ANIM` block at the top of that section.
- **New hazard cards** (`INTRO` in `js/game.js`): each hazard has a tiny preview chart in the same chart language as the levels (its card text is `hazard.<k>.body` in `js/i18n.js`), played by the real simulation with a scripted input (`in`, in beats) and drawn by a second renderer (`RENDER.create`) on the card's own canvas, with its own clock. It never touches the frozen game's state, clock or music. While the card is up the game is in mode `"intro"`: the run is set up and its first frame drawn, but the music and the clock only start on "Understood". If you change how a hazard works, check that its preview still plays out: run its chart and input through `SIM.step` and look for its event (`bounce`, `halo`, `rift`...) and no death before `to`.
- **Spike tip** (`TIP` in `js/game.js`): level 1 only (`lv`), its first compiled object with `v === "sp"` (`find`; `^`, `M` and `I` spikes), so a chart change moves it along. The game freezes `lead` beats before the spike's left edge and rewinds to the start of the bar at least `back` beats before it (tick 709 and tick 384 today). While the tip is still due, `beginRun` keeps `G.hist`, a `SIM.clone` of the state after every tick. In mode `"play"` the stepping loop stops at the freeze tick and the game freezes like a pause (`G.tip = "note"`, `G.paused`, music suspended, input dropped). `G.mark` is passed to `RENDER.frame` as `V.mark`, which draws the red ring; `RENDER.point()` turns its world position into screen pixels to place the `#tipNote` note above it. "Understood", `Enter` or the end of the `secs` countdown sets `G.tipDone` (this run only; `beginRun` clears it, so every run shows the tip) and starts the rewind (`G.tip = "rewind"`): the song stops, `MUSIC.sfx.rewind()` plays, and for `rewind` seconds each frame shows a recorded state further back (eased), with `body.rewinding` and `#rewindFx` giving the tape look. At the end the run carries on from a clone of the recorded state at the bar, with `MUSIC.start(song, beat)` and both clocks set to that beat; if the window lost focus meanwhile, it goes straight to the pause card. The countdown and the rewind only advance while the window has focus. Bot runs (`G.bot`), the home demo, previews and the tools never stop for the tip, and `js/sim.js` knows nothing about it.
- **How to play** (`HOWTO` in `js/game.js`): the basics and plain obstacle pages have charts in the same format as `INTRO` and an `id` for their text (`howto.<id>.name` / `.body` in `js/i18n.js`), and each hazard page reuses its `INTRO` entry and its hazard's text. Each page plays through the same `preview()` as a hazard card, on its own renderer (sharper, sized to the canvas) with the JUMP / ROLL label turned on. The same rule applies: if you change how a move or an obstacle works, run every page's chart and input through `SIM.step` and check it reaches `to` with no `die` event. A death in a preview never plays the crash sound or shakes the screen; only a real run (mode `"play"`) does.
- **Crash sound** (`MUSIC.sfx.die()`, vl's "miss" recipe): a falling sawtooth and a closing noise sweep through its own compressor and gain straight to the destination, never through the music's mix or a song bus. `MUSIC.init()` builds that output with the audio context, because a brand-new compressor is nearly silent for its first moments. The offline render (`renderStats`) never builds or plays it.
- **Music** (`js/themes.js`, `js/synth.js`, `js/music.js`). There are no audio files: every sound is synthesised, and anything struck or plucked is rendered once per audio context into an `AudioBuffer` (drums, strings, mallets, bells, the reverbs) and reused. Every level and the home screen has a theme composed by hand. The engine is hiyroscript/alva's (its notation, instruments, DSP and bar renderer, converted to a classic script), so a theme reads like one of Alva's stage themes:
  - **A theme** is data: `bpm` (the level's own, checked), `tonic` (MIDI of degree 1), `scale`, `swing`, `reverb`, `delay`, `level`, its `channels` (an instrument: a `tone` rendered per note, a `synth` built live or a `drum`; its `gain`, `pan`, `octave`, sends, and its `role`: lead, answer, harmony, bass, drums or fx), its `parts` and its `sections`. Levels 4-30 are written with `build()` at the top of `js/themes.js`: a `song` list of sections `[name, bars, chords, play, options]`, where a melody given as `mel(lines, last)` is fitted to its section's length and ends on its cadence `last`.
  - **The notation** (top of `js/synth.js`): a melody in scale degrees (`>5:4 3:2` = degree 5 for a quarter, accented, then 3 for an eighth; `'` / `,` octaves, `#` / `b` semitones, `.:4` a rest), a chord-relative line in chord tones only (`R 3 5 7 8 9 10 12`), a chord a bar (`1 4 6 5`, shapes `7`, `add9`, `sus2`, `sus4`, `5`: `47` is the 4 chord with a seventh), a drum line a character a sixteenth (`X` accent, `x`, `o` ghost).
  - **A section** is bars, chords, and what each channel plays (a part, or a list taken in turn on each pass of a loop), with an optional fill on its last bar, a crash on its first and a riser into its end. `form` lists a level's sections: their bars must add up to the level's exactly, and they follow its energy digits (intro, groove, build, peak, the one-bar breather, the climax, the outro). `end` is the closing sting after the last bar. The home theme has `loop` and `passes` instead.
  - **Instruments.** Tones: piano, Rhodes, nylon and steel guitar, harp, oud, koto, santur, harpsichord, pizzicato, upright bass, pluck, vibraphone, marimba, kalimba, celesta, glass, music box, bells, timpani. Synths: brass, lead, pad, choir, strings (`staccato` for an ostinato or a tremolo), bass, drone, chant, flute, reed (accordion, clarinet, sax, bassoon), organ (`pipe`), calliope, harmonica, riser, swell (wind, rain, steam, `kind: "rumble"`). Lead, bass, drone, chant, flute, calliope and harmonica play one note at a time, so a chord part needs another instrument. Drums: kick, snare (`gated`), clap, hats (`open`), crash, tick, rim, snap, brush, shaker, wood, log, cowbell, anvil, chain, gong, frame drum, riq, doum and tek, taiko, toms, boom.
  - **Tempo.** `mu` in `js/levels.js` is just `[bpm]`. The bpm is gameplay (Difficulty): never change it for the music; a theme is written at it, and `makeSong` refuses one that isn't.
  - **Songs.** `makeSong` writes the whole song up front as events on a grid of 48 ticks a beat: the form's sections bar by bar (`SYNTH.renderBar`), every note's velocity varied a little, the sting at `bars * 4` beats and a soft riser over the second half of the bar before each combo. A theme's bus has a 30 Hz high-pass, its reverb, a tempo-synced ping-pong delay and the kick's pump (`duck` on the kick, `pump` on what it pumps). The master has broad shelves, a glue compressor, a limiter and a safety curve. The two compressors delay the output by 6 ms each, so every event is sent 12 ms early (`PROC`) and beat `b` still reaches the speakers at `t0 + b * spb`.
  - **Levels.** Each role is set by measurement (K-weighted stems from `renderStats` with `only`, 40 s from bar 6): the melody about -22, harmony and bass -25, drums -24 and the answer -28, so the melody sits about 3 dB over the band. Then the theme's `level` puts the whole mix at -20.8 dBFS RMS at full volume (`music-check --render`), so every track plays as loud as the others.
  - **Scheduler.** `schedule()` (every 25 ms and every frame) plays the events inside a 0.3 s look-ahead at `t0 + (loop pass * loop length + beat) * spb`, skips any that are more than 20 ms late, and spreads a busy downbeat over a few calls (about 4 ms of work each while the next note is still 80 ms away). Waveshapers run without oversampling, which would delay their path by 128 samples. `start(song, beat)` brings a synth's held chords back in softly when it starts mid-song, and renders only the tones of the first bars before it starts. The rest are rendered ahead: what time a `schedule()` call has left (up to 3 ms) goes to the tones of the next 3 seconds' notes, one at a time, so a new section never has several to render at once. `suspend()` / `resume()` fade the output over a few milliseconds around the context's own suspend and resume, so a pause never clicks.
  - **Infinite Shadow's theme** (`THEMES.inf`) is a stream theme: `phases` maps each wave phase to a section, `modes` swaps the scale for some phases, `pairs` gives the lead and answer instruments for each world family, `hook` is the part the action line samples (the home melody), and `countIn` the count-in bar. `MUSIC.makeStream(def, g)` writes bars as the generator `g` makes them and `MUSIC.extend(S)` writes the new ones; the scheduler drops events once played. A stream looks 8 seconds ahead for tones to render, at most 1.2 ms a call, because each new world brings a new pair of instruments. `node tools/music-check.js inf` checks it (the grid, the groove, a lead note on every action cell, the count-in), and `--render inf` measures its loudness.
  - **A new theme:** read the level's name, backdrop and energy form (`L.energy`), write its hook and sections, add it to `THEMES` under the level's number, run `node tools/music-check.js <n>`, measure its stems and set its channels' gains, set its `level` from `node tools/music-check.js --render <n>`, then listen in the Soundtracks player.
  - **Checks:** `node tools/music-check.js` (headless, a few seconds: the notation, the instruments, the grid and the swing) and `node tools/music-check.js --render --perf` (Chromium via Playwright, about half an hour): peaks, loudness spread, silent seconds, voices, the home loop's seams, the slowest `schedule()` call under 4× CPU throttling.
- **Save data** lives under the `localStorage` key `shadowskirr.v1` in the release and `shadowskirr.dev.v1` in the developer build. Besides progress (`unlocked`, `sel`, `rec`) it holds the settings: `music`, `sfx`, `shake`, `objective` and `lang` (a language code, or `null` to follow the browser), the home card in view (`homeCard`: `"levels"` or `"inf"`), and Infinite Shadow's record, `inf: { best, bestDist, runs, totalTime, objHide }`. Loading validates every field and falls back to the default for one that is missing or wrong, so older saves load as they are. Saves from the old `lumbra.v1` key are migrated automatically on load, for the real key only.
- **Debug handle:** `window.__SHADOWSKIRR` exposes `G` (game state), `S()` (saved state), `startLevel(n)`, `keys` (input state), `getL(n)` (compiled level), `N` (level count), `saveState()`, `paintHome(retitle)`, `paintLevels()`, `startHome()`, `show(screen)`, `showCard({...})`, `hideCard()` and `setS(obj)`, which replaces the saved state through the same validation as loading, plus `launchInf(seed)` (an Infinite Shadow run from that seed, from wherever you are) and `INF_DEF`. During a run `G.inf` holds its generator (`G.inf.g`: the stream `L`, the solver's input `path`, the chunks and their stats), its seed and score; `G.lastSeed` is the last run's seed. `window.__LUMBRA` is kept as a legacy alias for old scripts.
- **Fonts** (Space Grotesk, JetBrains Mono) load from Google Fonts. Offline, the page falls back to system fonts. Chinese, Japanese, Korean and (for Space Grotesk) Cyrillic always come from system fonts; see [Languages](#languages).

## Credits

A game by hiyroscript.
