# Steam store page: RPG Reactor

Everything Steamworks asks for, ready to paste or upload. Release: **Thursday 21 January 2027, 10:00 Pacific**, six days before RPG Maker U2U (27 January on the US store). Price **$9.99 USD**.

## Dates that follow from the release

| By | What | Why |
| --- | --- | --- |
| Now, this week | Fill the store page, upload the art, press **Mark as Ready for Review** | Steam asks for 7 business days before the page should be live |
| Early December | Press **Post as Coming Soon** as soon as it is approved | Wishlists start; the Winter Sale (mid December to early January) brings traffic |
| 7 January 2027 at the latest | Page public as Coming Soon | Steam: a new product's Coming Soon page must be up two weeks before release |
| About 8 January 2027 | Upload the release build and submit it for build review | Leaves time for a resubmission |
| 21 January 2027, 10:00 PT | Press **Release** | Wishlisters get Steam's email |

## Answers (the owner, 2026-11-21)

1. **Platforms:** Windows, macOS and Linux at launch. macOS still needs its NW.js moved to 0.120 (`nwjs-mac` is 0.107) and the editor seen on a Mac before the build review (about 8 January).
2. **AI disclosure:** yes, saying where AI was used; the text is under "Content Survey" below.
3. **Content Survey:** no mature-content flags; the text is below.
4. **Languages:** only those the editor fully supports: all 18 (the i18n test fails if any of them shows an untranslated English string).

## Done in Steamworks (2026-11-21, app 4817110, store item 1208164)

Store Presence checklist: **complete**.

- Basic Info: 18 interface languages (no audio or subtitles; Portuguese-Portugal and Spanish-Latin America taken off), system requirements for Windows, macOS and Linux, support site (GitHub issues), genres RPG, Strategy and Game Development (primary), release date **Jan 21, 2027, 10:00 AM PST**, shown as the exact date.
- Description: short description and About This Software, as above.
- Graphical assets: the four store capsules and page background, ten screenshots (all Gameplay, all ages), the four library images; the logo placed by the owner.
- Price: **$9.99** with Steam's regional conversions, sent for Valve's review, set to publish automatically once approved.
- Client images: shortcut icon uploaded, app icon generated from it.
- Content survey (**published** 2026-11-21; ratings Brazil 14, Germany 16): no mature categories; online interactivity and in-game chat; violence: fantasy violence, killing, realistic blood (the red droplets of the pierce, bite and snipe effects); no drugs; AI disclosure as above. Nudity: "Contains some nudity" (the Character Builder's unclothed base body, the owner's call).

- Store localization (2026-11-21): the description, short description and system requirements in Steam's 16 recommended languages (French, Italian, German, Spanish-Spain, Greek, Indonesian, Japanese, Polish, Portuguese-Brazil, Russian, Simplified and Traditional Chinese, Turkish, Korean, Thai, Vietnamese), uploaded through the store's Localization tab. The files are in `localization/` (`english.json` is Steam's export); AI-translated with the editor's own terms, structure checked, not yet read by native speakers. Steam's store tool has no Arabic.
- Base languages (published): the editor's 18 languages on the depots.
- First build: the 0.99.6 zips through Upload Depots via HTTP, BuildID 26841284 on the default branch (depots 4817111 Windows, 4817112 macOS, 4817113 Linux).
- Trailer: v8 (`trailer/rpg-reactor-trailer-v8-steam.mp4`, 8 Mbit/s) replaced v7 in the one trailer slot.
- Linux runtime (published): Steam Linux Runtime 3.0 (sniper), all branches. Without a mapping Steam's client failed the launch ("compatibility tool failed", AppError_51, `Tool 0 "" is unknown` in `compat_log.txt`). The Steam build was seen starting in sniper on a hidden display; Runtime 4.0 lacks `libatspi.so.0`, which NW.js needs.
- Steam features (published 2026-11-21): 10 achievements with icons (Supported Features: Steam Achievements ticked); Workshop on (ISteamUGC file transfer, ready-to-use "Designs", square thumbnails, title and description), visible to developers only. Steam Workshop is ticked in Supported Features once the Workshop is public, which needs a 948x203 branding image and one public item. Detail: [ACHIEVEMENTS.md](ACHIEVEMENTS.md).

Support email: admin@psychronic.com (saved). Left for the owner: publishing the Steamworks settings (icons) if Steamworks asks; **Mark as Ready for Review** on the store page (2 to 3 business days; Coming Soon by 7 January); the builds (depots, launch options, upload). The build review currently takes **up to 14 business days**, so the first build should be uploaded by mid-December.

## Trailer

Not required by Steam's checklist, but strongly recommended. **v1** (2026-11-21): `trailer/rpg-reactor-trailer-v1.mp4` (not in git; in the Dropbox folder), 69.5 s, 1920 x 1080, 30 fps, H.264 about 19 Mbit/s, AAC 320k, on *Nightshade Strike* (from 1:10.9; the logo lands on the drop at 1:24.3, cuts on its 142.8 BPM bars). Footage recorded in the real game and editor on the hidden display (`~/.cache/rr-tests/trailer-game.cjs`, `trailer-tactical.cjs`), cut by `~/.cache/rr-tests/trailer/build_trailer.py`. Steam's Trailers tab takes the file (too large for the browser tool; upload by hand).

Not in v1 yet: the grapple (no roof edge in reach from the raid's start; needs the party staged beside a building), the Character Builder (did not finish building on the hidden display), the Database and event editor. Ideas for a second trailer: battles on *Quantum Overdrive* (its break at 2:50 and return at 3:10).

## Basic info

- **Name:** RPG Reactor
- **Type:** Software (Application). Steam category: Game Development.
- **Developer / Publisher:** Psychronic Games
- **Release date:** 21 January 2027
- **Price:** $9.99 USD (Steam suggests the other currencies from it)
- **Links (Basic Info tab only; links are not allowed in the description):** the project's website, Discord and GitHub, whichever you want shown.

## Short description

Steam shows this beside the header capsule. Plain text, no line breaks.

> Your RPG, built your way. Paint classic 2D maps or build lit HD-2D and full 3D worlds. Design 3D characters and props, generate effects and sounds, and pick classic, tactical or action battles. Play online, share on the Steam Workshop, and deploy to desktop and the web.

(270 characters. About the engine itself; importing and converting projects is in the long description. Owner, 2026-11-22. The 16 translations are in `localization/`.)

## About This Game

On Steam since 2026-11-22: `description-en.txt` (Steam's markup). It leads with the engine; opening MV/MZ projects and importing older games is its own section near the end (owner, 2026-11-22). The seven `[img]{STEAM_APP_IMAGE}/extras/rr-...[/img]` lines are MP4 loops uploaded under the description's custom images (Steam takes MP4/WebM up to 12 s, shown 780 px wide): `description-media/` holds them, cut from the trailer's caption-free footage by `~/.cache/rr-tests/steam-desc/make.py`. The translations in `localization/` carry the same lines.

## Screenshots

In `screenshots/`, 1920 x 1080, in this order on Steam (2026-11-22); all Gameplay and suitable for all ages. The ten before are in `screenshots/replaced-2026-11-22/` (too many of North Haven and of battles).

| File | Shows |
| --- | --- |
| `01-g2-north-haven.jpg` | The game: North Haven's square in HD-2D |
| `02-character-builder.jpg` | The Character Builder, a dressed character |
| `03-g6-battle-fire.jpg` | A Classic battle, a fire spell landing |
| `04-builder-blueprint.jpg` | The Builder: an inn and a cottage stamped from blueprints |
| `05-lighting.jpg` | Lighting on the Reactor Room |
| `06-g3-lake.jpg` | The game: a lake shore on the open road |
| `07-e5-effect-generator.jpg` | The Effect generator |
| `08-terrain-water.jpg` | The Builder's Terrain group: a lake and paths |
| `09-foliage-flowers.jpg` | The Builder's Foliage group: painting flowers |
| `10-event-editor.jpg` | The event editor |
| `11-g8-battle-light.jpg` | A light spell in battle |
| `12-e6-prop-builder.jpg` | The Prop Builder |
| `13-database.jpg` | The Database, Actors |
| `14-sound-effect-generator.jpg` | The Sound Effect Generator |

New pictures were taken by `~/.cache/rr-tests/steam-shots-v2.cjs` (editor) and `steam-shots-v2-game.cjs` (game).

## Art

In `art/`, at Steam's exact sizes. Capsules carry only the art and the title, as Steam's rules require.

| Steamworks slot | File | Size |
| --- | --- | --- |
| Header Capsule | `header_capsule.png` | 920 x 430 |
| Small Capsule | `small_capsule.png` | 462 x 174 |
| Main Capsule | `main_capsule.png` | 1232 x 706 |
| Vertical Capsule | `vertical_capsule.png` | 748 x 896 |
| Page Background | `page_background.jpg` | 1438 x 810 |
| Library Capsule | `library_capsule.png` | 600 x 900 |
| Library Header | `library_header.png` | 920 x 430 |
| Library Hero (no text; the reactor core sits in the centred safe area) | `library_hero.png` | 3840 x 1240 |
| Library Logo (transparent; place it bottom left) | `library_logo.png` | 1280 x 433 |
| Community Icon | `community_icon.jpg` | 184 x 184 |
| Client Icon | `client_icon.ico` (also `client_icon_32.png`) | 32 x 32 and up |

Made from `editor/images/splash-screen-01.png` (the art above its painted title) and the title lettering cut from `editor/images/logo.png`; the script is `~/.cache/rr-tests/demo-assets/steam_art.py` on the desktop.

## Languages

Tick **Interface** for: English, Japanese, Spanish (Spain), Traditional Chinese, Simplified Chinese, Russian, Portuguese (Brazil), German, French, Greek, Korean, Arabic, Italian, Polish, Indonesian, Vietnamese, Thai, Turkish. Leave Full Audio and Subtitles unticked (the editor has no voice-over).

## Content Survey

**Mature content:** none of the categories. If it asks for a description: "Fantasy combat in the included sample game."

**AI-generated content disclosure.** Pre-generated content (paste):

> AI tools were used during development. Much of RPG Reactor's source code was written with AI coding assistants, directed, reviewed and tested by the developer. The editor's translations into 17 languages were made with AI assistance. Some artwork was made with AI image generation and edited by the developer: the store and splash art (the reactor key art and the logo illustration) and some images in the included sample project. RPG Reactor does not generate content with AI while it runs.

Live-generated content: **none** (nothing in the editor, the runtime or the online server calls an AI service; checked 2026-11-21).

To confirm before submitting: that the translations and some of the sample project's images were made with AI help (the text says so; take out what is not true).

## System requirements

Measured sizes: the editor with its NW.js runtime and the sample project come to about 2.5 GB on disk.

**Windows**
- Minimum: Windows 10 64-bit; dual-core 2 GHz processor; 8 GB RAM; graphics with WebGL 2 (Intel UHD 620 or better, Direct3D 11, OpenGL or Vulkan); 4 GB available space.
- Recommended: Windows 10 or 11 64-bit; quad-core processor; 16 GB RAM; a dedicated graphics card (GTX 1060 / RX 580 or better); 4 GB available space on an SSD.

**macOS**
- Minimum: macOS 12 Monterey or later; 8 GB RAM; graphics with WebGL 2; 4 GB available space.
- Recommended: an Apple Silicon Mac; 16 GB RAM; 4 GB available space.

**Linux** (SteamOS + Linux)
- Minimum: 64-bit Ubuntu 22.04 or similar; dual-core 2 GHz; 8 GB RAM; graphics with WebGL 2 on Mesa or NVIDIA drivers; 4 GB available space.
- Recommended: quad-core; 16 GB RAM; dedicated graphics; 4 GB on an SSD.

These are a judgement from the machines the project is tested on (an Iris Xe laptop runs the sample game, with Auto quality, at 45 to 60 frames a second), not a formal test.

## Tags

Pick up to 20 in the tag tool; most relevant first: Game Development, RPG, JRPG, Software, Level Editor, Design & Illustration, Utilities, 3D, 2D, Pixel Graphics, Turn-Based Combat, Tactical RPG, Action RPG, Moddable, Character Customization, Sci-fi, Fantasy, Multiplayer, Open World, Indie.

## Builds (SteamPipe)

One depot per platform. The packaged editor from `editor/build-scripts/release-editor.cjs --target windows|linux` goes into each depot as is.

- **Windows depot:** launch option `RPG Reactor.exe`.
- **macOS depot:** the signed and notarized `RPG Reactor.app` (`--target macos`; needs `MACOS_SIGNING_IDENTITY` and a notary profile, see `release-config.cjs`).
- **Linux depot:** the editor's Linux launcher in the package root.
- `steampipe/` holds build scripts with the App and Depot IDs left to fill in. Uploading needs `steamcmd` signed in as the Steamworks account (Steam Guard), so the upload itself is yours.
