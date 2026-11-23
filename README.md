# Shadow Skirr

A rhythm runner by hiyroscript where the music and the level are the same thing.

## Play

- **Developer build:** https://hiyroscript.github.io/shkr/ serves this repo as-is, and the repo is the developer build. All 30 levels are unlocked with three rainbow stars, and Settings has a developer section for unlocking, resetting and putting progress back. Opening the repo's `index.html` from disk gives the same build.
- **Release build:** the normal game, ready to upload to itch.io, Newgrounds and similar sites. Download [`shadow-skirr.zip`](https://github.com/hiyroscript/shkr/releases/download/latest/shadow-skirr.zip) from the rolling `latest` release, or from the `shadow-skirr-release` artifact of any **Build release** run on the Actions tab. `index.html` is at the root of the zip. See [Builds](#builds).

Either way there is nothing to install: open `index.html` in a browser.

## Controls

| Action | Keyboard | Mouse | Touch |
|---|---|---|---|
| Jump | `Space`, `↑`, `W` | left click | tap the right half of the screen |
| Roll | `↓`, `S` | right click | hold the left half of the screen |
| Pause / resume | `Esc` | pause button (top right) | pause button (top right) |

On the home screen, `←` / `→` browse levels and `Enter` or `Space` starts the selected level. On How to play, `←` / `→` step through the pages. `Esc` closes How to play, Settings or Levels and goes back home. When a card is open (new hazard, pause, level cleared, confirmations), `Enter` picks its first button. On the level 1 spike tip, `Enter` is "understood" and no other key does anything. The game also pauses itself when the tab is hidden or the window loses focus.

## Features

- 30 levels plus a home screen, each with its own soundtrack generated live with Web Audio. There are no audio files. Every track is themed to its level, a wooden flute and nylon guitar in the pine forest, a pipe organ and timpani at the storm lighthouse, a calliope and tuba at the carnival, with its own instruments, drum kit, groove and reverb space. On the home track and levels 11, 12 and 17-30 a quiet lead melody also plays exactly where the level asks you to act; the other levels leave it out and let their instruments carry the music. Besides the music there is one sound effect: a short, low thud and hiss when you crash, synthesised the same way. It has its own output, so the music volume doesn't change it and the music's fade-out on a crash doesn't cut it off.
- Every level lasts exactly one minute, and each one is measurably harder than the one before: difficulty rises by a steady 10 % per level, from a gentle first minute that anyone can clear to a level 30 about 15.9 times harder, a real expert challenge (see [Difficulty](#difficulty)). Levels 1-9 teach, 10-20 mix, 21-30 stack.
- Levels are built like hand-made set pieces, not one obstacle after another: Bloom towers and tall steps to land on between pits, Halo chains and Comet glides over spike beds, Fade bridges, Rail rides over spike fields with a blade to drop under, castle gates (Prism, gate and low tunnel), crusher decks, Anchor combs that ask for a press every half beat, Glass panes over Coils and a Zenith section on the ceiling. The ground climbs and drops in stairs and towers instead of staying flat, and bars, hanging walls, floating spike blocks, tunnels and crushers keep the space overhead as busy as the ground. Each level reads as clear sections: intro, build, first peak, a one-bar breather, the climax and a short outro, and the music's energy follows them.
- Later levels keep using every hazard the earlier ones introduced and often combine two or three at once: a Halo over a row of Fade tiles, Glass you dive through onto a Coil, a Mimic eye that reads your height inside a Thermal. Level 30 uses all 15. The music marks each combo with a short riser in the bar before it, and on levels with a lead line every special-hazard action (Bloom, Fade, Glass, Flicker, Mimic) plays an octave higher with its own glassy tone.
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
- Settings: sound effects on/off (the crash sound and the spike tip's rewind), music volume, screen shake on/off, objective tips on/off (the objective box at the start of a level and the level 1 spike tip), and reset all progress. Resetting progress keeps the settings.
- Reduced motion: with `prefers-reduced-motion: reduce`, the play button's pulse animation, the foliage sway and the drifting fog wisps are turned off. The runner keeps all its poses but drops the purely decorative extras: dust kicks and sparks, the ball's motion trail, the Coil shake, head and hand follow-through, the glide bob and the drifting limbs in a Thermal. Its Rail swing settles without wobbling. A new hazard card, and each How to play page, shows one still frame of its demo instead of the loop.
- Progress and settings are saved in `localStorage`.

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
  - crushers (from level 18): heavy blocks that pound the ground on every off-beat and lift on every beat. One you reach while it is down is a block to jump over; one you reach while it is up is overhead, so stay on the ground. The music's lead line plays on the ones to jump;
  - rolling blades (from level 22): saws rolling towards you along the ground at half your speed. Jump them as they arrive; the lead line plays on that moment.

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

## Project structure

```
shkr/
├── index.html          page markup (screens, HUD, overlay) and the script tags
├── css/
│   └── style.css       UI ported from hiyroscript/vl: tokens, type, chips, bars, orb, wipe, cards and panels
├── js/
│   ├── dev-config.js   developer build only: points the save at its own key (loaded first)
│   ├── sim.js          deterministic fixed-timestep simulation, shared by the game and the Node beatability solver
│   ├── levels.js       the 30 hand-written charts, the hazard list (HAZ), the newer plain obstacles (OBST) and the home screen chart (HOME)
│   ├── fixes.js        per-level fix-ups applied when a level compiles (currently empty)
│   ├── demo.js         precomputed input for the home screen's attract-mode demo (DEMO_SOL)
│   ├── music.js        the soundtrack engine: synthesised instruments, drums and reverbs, an arranger that writes each level's track from its spec and chart, a look-ahead scheduler, and the sound effects (MUSIC.sfx: crash, rewind)
│   ├── backdrops.js    the terrain background layer: five looping parallax strips of fog-grey silhouettes per world
│   ├── render.js       "fog silhouette" renderer: misty sky, grey layers, black terrain, colour only on hazards, and the runner's animation (RENDER.create makes a second one for the hazard previews)
│   ├── game.js         state, clock, input, HUD, home screen, objective box, new hazard cards and their previews, spike tip, How to play, results, rebirth
│   └── dev.js          developer build only: rainbow unlock-all default, developer section in Settings, soundtrack player, DEV badge (loaded last)
├── tools/
│   ├── build-release.sh   makes the release: the repo minus the developer code, with a guard against leaks
│   ├── parity-check.js    proves the release plays exactly like the source
│   ├── difficulty.js      scores every level's difficulty D and prints it against the 1.10-per-level curve
│   ├── density.js         measures how busy every chart is (obstacles per bar, gaps) against the density bands
│   ├── check-levels.js    checks every level: 60 s long, solvable and fair, hazards reused, on the curve, dense enough
│   └── music-check.js     checks every soundtrack: a lead (if any) on every action, on the grid, groove limits; with --render / --perf, loudness, voices and timing in Chromium
├── .github/
│   └── workflows/
│       └── build.yml   on every push to main: level checks, build, guard, parity check, zip, publish
├── docs/
│   └── hazards/        colour swatches for the README's hazard list, one SVG per hazard (colours from HAZ in js/levels.js)
├── README.md
└── max                 design brief
```

## How it works

- The simulation (`SIM`) runs on a fixed timestep measured in beats: 96 ticks per beat, 4 world units per beat. Because everything is in beats, a level plays the same at any tempo.
- Levels are written as compact chart strings. A phrase is `terrain/overlay`, each character is half a beat, and a level's form string chains one-letter phrase keys, with digits setting the musical energy (0-4) of the bars that follow.
- Each level's soundtrack is written from that level's spec (tempo, key, scale, chord progressions, kit, groove, instruments, space) and from its chart, the moment the level starts. Where a level has a lead line (the home track, levels 11, 12 and 17-30), it plays quietly on exactly the half-beats where the level asks for an action, a jump as a short melody note, a roll as a lower note that bends down, a special-hazard action with a glassy note an octave over it, and nowhere else in those bars. It is a light accent inside the mix, not a line on top of it, and it grows out of a two-bar motif that each section develops. The other levels leave the lead out. The form string's energy digits drive the arrangement: an intro, the groove coming in, counter-lines and extra percussion, a full drop, a stripped-down breather, a fill before each new section, a riser and roll into an energy-4 run, a crash and sub boom on the drop, and a cadence that rings out after the last bar. See Development notes (Music) for the details.
- The game clock follows the audio clock while music is playing, so input and visuals stay on the beat.

## Builds

One source tree, two builds:

| | Developer build | Release build |
|---|---|---|
| Where | this repo, served as-is by GitHub Pages at https://hiyroscript.github.io/shkr/ | [`shadow-skirr.zip`](https://github.com/hiyroscript/shkr/releases/download/latest/shadow-skirr.zip), or the `shadow-skirr-release` artifact of a workflow run |
| What | the whole repo: the game plus `js/dev-config.js` and `js/dev.js` | only what the game needs to run: `index.html`, `css/` and the game's `js/` files, with all developer code removed |
| Progress | every level unlocked with three rainbow stars on first load | the player's own: a new save starts at level 1 with no stars |
| Extras | developer section in Settings, DEV badge on the home screen | none |
| Save key | `shadowskirr.dev.v1` (snapshot for "put back": `shadowskirr.dev.snapshot`) | `shadowskirr.v1` (old `lumbra.v1` saves are migrated) |

The developer build needs no build step: Pages keeps deploying the `main` branch root exactly as before. Because the two builds use different save keys, the developer build never reads or writes a player's real save, even on the same origin.

**Developer section** (Settings, below the normal rows). Each progress action asks for confirmation first, keeps the settings (sound effects, music, shake, objective tips), and returns to the home screen.

- *Unlock all (rainbow)*: every level unlocked with three rainbow stars.
- *Reset progress*: a fresh game (level 1, no stars, no tries), to test the real first-time flow.
- *Put progress back*: restores unlocks, stars, tries and the selected level exactly as they were right before the last reset or unlock all. Both of those save a snapshot first. One level of undo, and the button is disabled when there is no snapshot.
- *Soundtracks*: a screen to listen to every track outside a run, the home track and the 30 levels, to judge and adjust the music. It shows the level's sound spec (`mu[12]`: kit, groove, lead and answer, harmony, bass, space, fx, trim) and a map of its bars (height = energy, a dot on the bar before each combo); click a bar to play from it (on the home track, the pass shows too). Play / stop, previous / next, what happens at the end of a track (stop, repeat, next), and mutes for each part (lead, answer, harmony, bass, drums, fx with the ambience bed): a mute plays on from the same beat without that part. Keys: `Space` play / stop, `←` / `→` previous / next track, `Esc` back to Settings, which restarts the home track. It needs no confirmation and doesn't touch progress or settings (the music volume applies).

**Release build.** `.github/workflows/build.yml` runs on every push to `main` (except pushes that only touch `max`, Markdown files or `docs/`, none of which go into the release) and on manual runs:

1. `node tools/check-levels.js` checks every level against the rules in [Difficulty](#difficulty) and stops the job on any failure.
2. `bash tools/build-release.sh dist/release` copies `index.html`, `css/` and `js/` and nothing else (no `README.md`, `max`, `tools/`, `.github/` or `.git`), deletes `js/dev.js` and `js/dev-config.js`, removes the `<!-- dev-only -->` lines from `index.html`, and stamps `<meta name="shkr-build" content="dev">` as `release · <short-sha> · <UTC date>`. Its guard then fails the build if the output still contains `dev.js`, `dev-config.js`, `dev-only`, `shadowskirr.dev`, the developer section's ids or text, or any definition of `SHKR_DEV` / `SHKR_DEV_INIT`; if `index.html` loads a file that is missing; or if the release holds a file that `index.html` does not load.
3. `node tools/parity-check.js . dist/release` checks that the release holds only `index.html`, `css/` and `js/`, and that every shared file is byte-identical (`index.html` may differ only by the removed dev-only lines and the stamp), then loads `sim.js`, `levels.js`, `fixes.js` and `demo.js` from both trees in separate `vm` contexts. Every level and the home chart must compile identically, each level's solver solution must replay to the same final state, a seeded run that dies part-way must match on every tick, and the attract-mode demo (`DEMO_SOL`) must replay identically. It prints a table and names the first differing field on failure.
4. Only if all three pass: zip `dist/release` with `index.html` at the root, upload it as the `shadow-skirr-release` artifact, and replace the rolling `latest` release (tag, title "Shadow Skirr — latest build", commit SHA, date and message in the notes). A manual run on another branch builds, checks and uploads the artifact but leaves `latest` alone.

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

- **Script load order matters.** The JS files are classic scripts that share top-level globals (`SIM`, `HAZ`, `LEVELS`, `HOME`, `FIXES`, `DEMO_SOL`, `MUSIC`, `BACKDROPS`, `RENDER`). They must load in this order, at the end of `<body>`, without `defer`, `async` or `type="module"`:
  `dev-config.js` → `sim.js` → `levels.js` → `fixes.js` → `demo.js` → `music.js` → `backdrops.js` → `render.js` → `game.js` → `dev.js`
  `dev-config.js` comes first so `game.js` sees the developer save key, and `dev.js` comes last. Both are stripped from the release, which loads `sim.js` through `game.js` only.
- **Don't convert to ES modules** unless you also refactor the shared globals and serve the game from a local server. Modules don't share a global scope and don't load from `file://`.
- **Runner animation** is view-only. The stickman section of `js/render.js` reads the simulation state, the beat and the frame time, but never writes to `SIM` state, so replays and the demo are unaffected. `game.js` passes each simulation event to it through `RENDER.cue`. Every tunable (run cycle keys, blend rates, ball, hang, glide, timings) is in the `ANIM` block at the top of that section.
- **New hazard cards** (`INTRO` in `js/game.js`): each hazard has its card text and a tiny preview chart in the same chart language as the levels, played by the real simulation with a scripted input (`in`, in beats) and drawn by a second renderer (`RENDER.create`) on the card's own canvas, with its own clock. It never touches the frozen game's state, clock or music. While the card is up the game is in mode `"intro"`: the run is set up and its first frame drawn, but the music and the clock only start on "Understood". If you change how a hazard works, check that its preview still plays out: run its chart and input through `SIM.step` and look for its event (`bounce`, `halo`, `rift`...) and no death before `to`.
- **Spike tip** (`TIP` in `js/game.js`): level 1 only (`lv`), its first compiled object with `v === "sp"` (`find`; `^`, `M` and `I` spikes), so a chart change moves it along. The game freezes `lead` beats before the spike's left edge and rewinds to the start of the bar at least `back` beats before it (tick 709 and tick 384 today). While the tip is still due, `beginRun` keeps `G.hist`, a `SIM.clone` of the state after every tick. In mode `"play"` the stepping loop stops at the freeze tick and the game freezes like a pause (`G.tip = "note"`, `G.paused`, music suspended, input dropped). `G.mark` is passed to `RENDER.frame` as `V.mark`, which draws the red ring; `RENDER.point()` turns its world position into screen pixels to place the `#tipNote` note above it. "Understood", `Enter` or the end of the `secs` countdown sets `G.tipDone` (this run only; `beginRun` clears it, so every run shows the tip) and starts the rewind (`G.tip = "rewind"`): the song stops, `MUSIC.sfx.rewind()` plays, and for `rewind` seconds each frame shows a recorded state further back (eased), with `body.rewinding` and `#rewindFx` giving the tape look. At the end the run carries on from a clone of the recorded state at the bar, with `MUSIC.start(song, beat)` and both clocks set to that beat; if the window lost focus meanwhile, it goes straight to the pause card. The countdown and the rewind only advance while the window has focus. Bot runs (`G.bot`), the home demo, previews and the tools never stop for the tip, and `js/sim.js` knows nothing about it.
- **How to play** (`HOWTO` in `js/game.js`): the basics and plain obstacle pages have charts in the same format as `INTRO`, and each hazard page reuses its `INTRO` entry. Each page plays through the same `preview()` as a hazard card, on its own renderer (sharper, sized to the canvas) with the JUMP / ROLL label turned on. The same rule applies: if you change how a move or an obstacle works, run every page's chart and input through `SIM.step` and check it reaches `to` with no `die` event. A death in a preview never plays the crash sound or shakes the screen; only a real run (mode `"play"`) does.
- **Crash sound** (`MUSIC.sfx.die()`, vl's "miss" recipe): a falling sawtooth and a closing noise sweep through its own compressor and gain straight to the destination, never through the music's mix or a song bus. `MUSIC.init()` builds that output with the audio context, because a brand-new compressor is nearly silent for its first moments. The offline render (`renderStats`) never builds or plays it.
- **Music** (`js/music.js`, specs in `mu` in `js/levels.js`). There are no audio files: every sound is synthesised, and anything percussive or plucked is computed once per audio context into an `AudioBuffer` (drum one-shots, Karplus-Strong strings, the reverb impulses, the noise beds) and reused.
  - **Spec.** `mu` keeps its first twelve fields (`bpm, root, scale, progA, progB`, then the old kit, bass, lead, arp, pad, swing and second voice, which are only defaults now). `mu[12]` names the rest: `kit`, `groove`, `bassStyle` and `bass`, `harm` and `comp`, `pad`, `drone`, `arp` (`"patch:pattern"`), `lead`, `answer`, `space`, `fx`, `ambience`, `col`, `rise`, `drop`, `motif`, `trim`; the header of `js/levels.js` lists the values. The bpm is gameplay (Difficulty): never change it for the music.
  - **Patches** (`PATCH`): oscillators on band-limited wave tables (warm saw, reed, organ drawbars, pipe, voice...), unison with stereo spread, 2- and 3-operator FM with the index scaled by pitch and velocity (bells, e-piano, mallets, kalimba, glass), Karplus-Strong plucked strings (koto, harp, guitars, harpsichord, pizzicato, oud, santur...), breath, bow and key-click noise, a filter envelope with key and velocity tracking, glide, delayed vibrato, tremolo, and per-part formant or body filters (choir "ah" / "oo", reeds, guitar body). Every patch has a `rng` (lowest and highest note) and the arranger keeps each part inside it. Patch gains are calibrated so every patch plays at the same loudness for its kind.
  - **Kits** (`KITS`, `FAM`): a kit names its one-shots and their pan per lane, and a pattern family; a family has bar variations per energy (velocity per step: `X` accent, `x`, `o` ghost) and a fill. `GROOVE` holds the swing, accent shape and micro-timing (at most 8 ms, never late on the downbeat kick). Electronic kits dip bass and harmony on every kick from energy 3.
  - **Space** (`SPACE`): reverb impulses with pre-delay, early reflections and damping (room, wood, courtyard, hall, palace, cathedral, cave with flutter echoes, plate, outdoor, underwater), a tempo-synced ping-pong delay, chorus, saturation, a muffled bus for the reef. Mix: per-group levels (the lead inside the mix, a light accent rather than a line on top), a 30 Hz high-pass on everything but kick and bass, broad shelves, a glue compressor and a limiter. The two compressors delay the output by 6 ms each, so every event is sent 12 ms early (`PROC`) and beat `b` still reaches the speakers at `t0 + b * spb`.
  - **Arranger** (`arrange`): `makeSong` writes the whole song as events on a grid of 48 ticks a beat: voice-led chords (smallest movement between voicings), the comping style, arps, drones, the bass style approaching each next chord, the drums with their fills, risers, the drop, and the closing cadence. The lead takes a 2-bar motif from the level (`motif`, normally its own name; The Last Light borrows the home screen's) and develops it per section (repeat, sequence, invert, reverse) onto the chart's onsets: chord tones on strong beats, no leap over a sixth inside a phrase, a resolution at the end of each section. Lead notes are short (held patches stop well before the next action), with no slides and no doubling. A spec can leave out the lead or the answer (`lead: "none"`, `answer: "none"`, levels 1-10 and 13-16 have no lead, level 1 no answer either): the line is still written, so the answers can echo it. The answer voice replies in empty bars and breathers, in another register. The home track loops: four passes of its 16 bars, voiced across the seam.
  - **The action rule.** On a level with a lead, every chart cell with an action gets exactly one lead note (group `l`, `act` 1, 2 or 3) at exactly `cell / 2` beats with no groove offset; no lead, doubling or cue note starts on any other cell of a bar that has actions. A level with `lead: "none"` has no lead, doubling or cue note at all. `tools/music-check.js` checks it for every track.
  - **Scheduler.** `schedule()` (every 25 ms and every frame) plays the events inside a 0.3 s look-ahead at `t0 + (loop pass * loop length + beat) * spb`, skips any that are more than 20 ms late, spreads a busy downbeat over a few calls (about 4 ms of work each while the next note is still 80 ms away), and caps the sound at 60 voices (the quietest, oldest drums and harmony go first). Waveshapers run without oversampling, which would delay their path by 128 samples. `start(song, beat)` brings held chords back in softly when it starts mid-song. `suspend()` / `resume()` fade the output over a few milliseconds around the context's own suspend and resume, so a pause never clicks.
  - **A new soundtrack:** give the level a `mu[12]` spec, run `node tools/music-check.js <n>` (a lead, if it has one, must land on every action), then `node tools/music-check.js --render <n>` and set `trim` to the dB it prints, so the track sits with the others. A new patch needs a `rng`, and its `g` set so `MUSIC._t.note` measures it with its kind.
  - **Checks:** `node tools/music-check.js` (headless, a few seconds) and `node tools/music-check.js --render --perf` (Chromium via Playwright, about half an hour): peaks, loudness spread, silent seconds, voices, the home loop's seams, the slowest `schedule()` call under 4× CPU throttling.
- **Save data** lives under the `localStorage` key `shadowskirr.v1` in the release and `shadowskirr.dev.v1` in the developer build. Saves from the old `lumbra.v1` key are migrated automatically on load, for the real key only.
- **Debug handle:** `window.__SHADOWSKIRR` exposes `G` (game state), `S()` (saved state), `startLevel(n)`, `keys` (input state), `getL(n)` (compiled level), `N` (level count), `saveState()`, `paintHome(retitle)`, `paintLevels()`, `startHome()`, `show(screen)`, `showCard({...})`, `hideCard()` and `setS(obj)`, which replaces the saved state through the same validation as loading. `window.__LUMBRA` is kept as a legacy alias for old scripts.
- **Fonts** (Space Grotesk, JetBrains Mono) load from Google Fonts. Offline, the page falls back to system fonts.

## Credits

A game by hiyroscript.
