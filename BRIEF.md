# Ocean Drive — brief (2026-09-27)

## The place

- **Where:** Ocean Drive, South Beach, Miami Beach, Florida. The famous stretch runs about 1.5 km (~1 mile) from 5th Street north to 15th Street.
- **One side:** a nearly unbroken row of low 1930s–40s Art Deco and Streamline Moderne hotels (Colony, Carlyle, Breakwater, Clevelander and others) in pastel paint, with porches, café terraces and vertical neon signs. Part of the Miami Beach Architectural District.
- **Other side:** Lummus Park: grass, a curving walkway and a row of palm trees, then a wide sand beach, lifeguard towers and the Atlantic.
- **Mood:** bright pastel and hard shadows by day; pink and orange at sunset (the sun sets behind the hotels, so the facades are backlit and the sky over the ocean goes pink); at night the neon takes over and the street becomes a slow cruise.
- **Fit with the cars:** Wedge '84 is the obvious hero (80s Miami). The streamliner echoes the Streamline Moderne buildings. The hypercar suits the neon night cruise.

## Possible directions

1. **Blender hero scene / film:** a modelled stretch of Ocean Drive (one or two blocks of hotels, palms, park, beach), the five cars cruising it, rendered in Cycles. Sunset and neon night versions. Output: hero stills plus a short film. Fits the Collect Car film pipeline.
2. **Browser free-roam, like Collect NYC:** the whole of South Beach (or just Ocean Drive, Collins and Washington Avenue) from open map data, drivable in the browser with the same stack, tiles and sign-in. Collect drops and races can be carried over.
3. **Short launch film:** a 30–60 s cinematic, built as a Three.js page with `seek(t)` or rendered in Blender, one car per beat, ending on a lineup in front of the hotels. Masters plus 9:16 and 1:1 cuts.
4. **Scene first, then reuse:** build the set once in Blender (option 1), export it as GLB, and use it both for the film and as a small drivable map in the browser.

## Open decisions (for Patrick)

- (none right now)

## Decided (2026-09-27)

- **Direction:** a walkable first-person browser scene of Ocean Drive at **sunrise** (golden hour, sun ~7° over the Atlantic), photoreal travel-photo look, built entirely in code. Full spec in `refs/spec.md`.
- **Collect cars:** the five Collect cars stand parked on Ocean Drive among the spec's generic parked cars (for now they don't drive).
- **Place:** Ocean Drive, Miami Beach (confirmed by the spec).
- **Stack:** Vite + TypeScript + Three.js in `game/` (same as Collect NYC). Everything procedural except the Collect car GLBs.
- **Hosting:** Vercel behind the same sign-in as Collect NYC / Demolition Derby (not public GitHub Pages).
- **Skill repos** named in the spec (threejs-skills, webgpu-claude-skill, threejs-game-skills): cloned to `~/blender/_reference/` and read as guidance only, nothing installed.
- **Done when:** every point of the spec's "success looks like this" list works in the browser (walk, bike, sand, climb the tower, ATV, swash, audio), shown with screenshots from cameras A–H.

## Status (2026-09-27)

**Done:** all eleven build stages of the spec (sky and lighting, hotels, palms, street with lamps and cars, park/promenade/beach/ocean/towers, people and birds, bike and ATV, walking with collisions and surfaces, synthesized spatial audio, loader/quality tiers/touch, polish), each checked from the eight review cameras with a critic pass. The success walkthrough was driven with real input in the browser: sidewalk walk (pavement steps), across the grass to the cruiser and riding it with the basket in frame, raked sand to a tower (pavement → sand steps), up the tower stairs onto the deck (wood), the ATV along the beach, standing in the swash (splashes when the water runs in). Final camera set in `renders/final/`.

**Performance:** medium tier (the default on this M4) renders the review cameras in 8–11 ms at 1600×900; the shadow map is refreshed every other frame; dynamic resolution backs off to 0.6 if frames run long. Phones get the low tier and touch controls.

**Online:** https://ocean-drive-theta.vercel.app, public (Patrick removed the sign-in on 2026-09-28 and asked for it to be published, drop garage included).

**GitHub (2026-09-29):** public repo https://github.com/drcollect/ocean-drive, playable on GitHub Pages at https://drcollect.github.io/ocean-drive/ (Actions workflow `.github/workflows/pages.yml`). It starts from a fresh history (the earlier history had the sign-in code in it); the Drop 01 spec (an internal proposal) is not in the repo.

**Trailer (2026-09-30):** 15 s, recorded by the game itself (`game/src/dev/trailer.ts`, `game/scripts/trailer.sh`): street crane, beach, a Collect Streamliner up Ocean Drive, the crash into the white convertible, a Secret Rare pull in the garage, the end card; the game's own sound and its bossa nova. `renders/ocean-drive-trailer.mp4` is the 1080p copy to post (not in git), `game/public/trailer.mp4` the site's, `renders/trailer.gif` the README's.

**Cars, second pass (same day):** the procedural parked cars were rebuilt as smooth lofted bodies (rounded sections, cut wheel arches, domed fascias, rounded corners) with tinted glass you can dimly see the cabin through, seats, dash and door cards inside, alloy wheels with discs and callipers, mirrors, wipers, a Florida rear plate, and lamps, grille, shut lines and handles drawn by the paint shader; three levels of detail swap with distance. Glass, chrome and trim reflect a street-level probe taken at startup; paint keeps the sky reflection (the probe's facades looked blotchy on hoods). Patrick's five Collect cars (from `~/blender/Collect Car`) stand in a row in front of the hotels where the walk starts, ten more are scattered along the street, and each load rolls a new drop: model, paint, neon accent and stripe as the Collect games roll them (16 paints, 8 accents, none/centre/twin/side stripes), every car in a different colour. `?drop=N` repeats a roll; camera I frames the row.

**Collect Drop garage (2026-09-28):** Patrick asked to simulate a Collect drop in 3D on Ocean Drive (spec pasted, saved as `refs/drop01-spec.md`): walk up to a garage, pay, the door opens on your car, see if it's a Secret Rare, inspect it. Built in Lummus Park across from the start: pay kiosk ($99, demo price), live-odds board, roller door, turntable showroom lit in the tier colour, card with look/ratings/spec/verify, four bays for earlier pulls, all state in the browser. The drop's tiers and looks reproduce the spec's five published editions exactly; per-car tuning is re-implemented (generator not available). The street's Collect cars are now Drop 01 editions too (the published five in the row).

**Weakest parts (next pass):** the people are simple mannequins; no ambient occlusion (only contact blobs under cars); the open sea far out is smooth; flying gulls read thin from some angles; the pickups' cabs still read a little open from some angles.
