# Ocean Drive — build spec (from Patrick, 2026-09-27)

Pasted by Patrick as the chosen direction. It was written generically, without the Collect cars; Patrick added: "plus the Collect cars", which for now just stand parked on Ocean Drive. Hosting changed from GitHub Pages to Vercel behind sign-in (like Collect NYC). The three skill repos are read only, not installed.

---

Build a complete walkable first-person browser scene of Ocean Drive, Miami Beach at sunrise. Use Three.js + Vite. The result must look like real travel photography of South Beach at golden hour, not a video game.

REFERENCE LOOK FROM THE FINISHED SCENE
- Time: sunrise, sun a hand's width above the Atlantic, about 7° above the horizon.
- Sky: pale blue overhead, warm gold and peach at the horizon, long thin clouds with gold sun-facing edges and violet-lavender undersides.
- Light: warm gold on west-facing hotel facades, cool blue-gray shadows. Long raking shadows stretch the full width of the street from palms, lamps, cars, and towers.
- Atmosphere: humid aerial haze. Distant blocks go soft and warm. Contact-hardening shadows: sharp at the base of a palm trunk, soft at the far tip.
- Water: turquoise shallows, darker open ocean, bright glitter path under the sun, small rolling breakers, lace foam, wet reflective sand below the swash line.
- Sand: wide pale beach with raked linear grooves, footprint-churned relief, wrack line, long low-sun shadows across the texture.
- Mood: quiet early morning, almost empty, calm, photoreal, slightly hazy.

WORLD LAYOUT
Build a continuous 680-meter district along Z from -340 to +340.
Cross-section from west to east:
1. Art Deco hotel row and café patios
2. sidewalk
3. Ocean Drive roadway with yellow center lines, parked cars, occasional moving car
4. east sidewalk
5. grass park strip with benches and palms
6. concrete promenade
7. low fence / posts with tropical ground plants
8. wide white sand beach
9. wet sand and swash
10. Atlantic Ocean going to the horizon

Include six cross streets. Use far LOD for hotels and palms beyond the near blocks so the street feels long.

HOTELS — about 40 unique procedural buildings
Pastel Art Deco only: pink, mint, cream, lemon, lavender, coral, pale aqua, peach.
Each hotel must vary: floor count, width, color, window rhythm, roofline.
Required architectural details:
- rounded corners and curved bays
- eyebrow slabs / ledges over windows
- porthole windows
- recessed windows that reflect sky
- stepped parapets
- pylon and blade signs
- stucco weathering streaks
- ground-floor café patios with white tables, chairs, pink/blue/white umbrellas, striped awnings
Invented names only, no real brands or logos. Use names like MARISOL, ORCHIDEA, BELLA MAR, CORALINE, SEAGROVE, FAIRHOLM.
Storefront lettering is simple geometric caps, generated in code, not a font file.

PALMS — about 160 trees
Three species mixed: coconut (leaning, heavy crown), royal (taller, straighter), sabal (fan).
Place them along both sidewalks, the park strip, and the beach edge.
Fronds sway in a shared wind field. Leaflet shadows must be cut from the same alpha as the leaves so shadow patterns match the canopy.
No repeated clone-stamp rows. Vary lean, height, trunk texture, and crown density.

STREET FURNITURE AND CARS
- black Deco street lamps with white globes
- black trash cans
- benches in the park
- weathered asphalt, faded yellow lane paint, crosswalks
- parked cars in mixed colors: black sedans, silver/gold sedans, red pickup, white convertible
- one 1950s white convertible near the curb
- cars should feel slightly simplified but correctly scaled, with long sunrise shadows
- no brand badges

BEACH AND LIFEGUARD TOWERS
Three climbable Miami Beach lifeguard towers, spaced along the sand.
Classic South Beach tower design: raised cabin, stairs, railings, flagpole, colorful paint blocks (teal, yellow, coral, mint). One tower has the sun flaring through the cabin.
Beside at least one tower: a small red lifeguard ATV and a trash can.
Sand must show:
- dry baked upper beach with raked lines
- mid beach with footprints
- wrack / seaweed line
- dark wet mirror sand
- swash that runs in around the player's feet

OCEAN
Procedural water, not a stock plane.
- sun glitter path
- turquoise near shore, deeper blue-gray farther out
- timed breakers and foam matching the audio schedule
- shallow refraction / wet-sand sheen where water thins out
Birds over the water: a line of pelicans flying low, plus distant specks.

PEOPLE AND BIRDS
Sparse morning life only.
People: jogger on the promenade, walker on wet sand, café worker on a patio, cyclist on the path. All cast the same long sunrise shadows.
Birds:
- pelicans in a line over the water
- gulls that flee when the player walks at them
- sanderlings chasing the swash
- grackles on patios
- one frigatebird high up
- cormorants near the water
Keep counts low. Morning, not crowded noon.

VEHICLES THE PLAYER CAN RIDE
1. Beach cruiser bicycle
   - chrome handlebars
   - front wicker basket
   - first-person riding camera showing bars + basket
   - freewheel / chain tick sound
2. Lifeguard ATV
   - small red utility ATV
   - black front rack
   - first-person riding camera showing rack + bars
   - engine sound
Press E near either to mount / dismount. Simple drive model: steer with mouse/A-D, move with W/S, collide with buildings and stay on ground.

PLAYER CONTROLS
Desktop:
- click to pointer-lock, start audio, begin walking
- mouse look
- WASD walk
- Shift faster walk
- Space jump
- E mount / dismount
- M mute
- Esc release pointer
Mobile:
- tap to start / fullscreen
- left joystick move
- drag elsewhere to look
- on-screen jump, ride, mute buttons
Collision and surfaces: pavement, curb, grass, dry sand, wet sand, shallow water, wooden tower stairs.
Footstep sound and walk feel must change per surface. In the swash, feet splash and water runs around them.

AUDIO — all synthesized, no audio files
Web Audio API, spatial HRTF.
Sources:
- row of wave voices along the shore, locked to visible swash
- gull calls from visible birds
- wind volume from nearby palm count
- surface footsteps: pavement, grass, dry sand, wet sand, wood, splash
- slow passing car with Doppler
- soft generative bossa nova from one patio, louder as you approach
- bike freewheel
- ATV engine
The swash you see arriving at your feet is the swash you hear.

RENDERING AND PERFORMANCE
- physically inspired sky scattering, not a flat gradient
- following shadow camera snapped to shadow-map texels so shadows do not shimmer
- contact-hardening shadows
- light bloom around the sun and glitter path
- subtle color grading: warm highlights, cooler shadow fill
- AA (MSAA or FXAA by tier)
- quality tiers: high / medium / low from GPU, core count, memory
  high: 8192 shadow map
  medium: 4096
  low: 2048, reduced ocean/sand/audio
- dynamic resolution down to 0.6 if frames drop
- far LOD for distant hotels and palms
Target: smooth desktop framerate in Chromium.

ZERO EXTERNAL ASSETS
Do not download or load any models, textures, images, fonts, or audio files.
Generate hotels, palms, cars, bike, ATV, sand, ocean, sky, clouds, signs, people, birds, and every sound in code.
Procedural noise for stucco, asphalt, sand, water.
(Exception added by Patrick: the five Collect car GLBs from ~/blender/Collect Car/export.)

LOADER
Sunrise title card: "Ocean Drive" / Miami Beach morning.
Progress bar tracks real build stages: sky, hotels, palms, street, beach, ocean, people, audio.

STACK AND STRUCTURE
- Vite
- Three.js only runtime dependency
Suggested files: src/main, src/sky, src/quality, src/renderer/, src/world/ (hotels, palms, street, cars, beach, ocean, people, birds, LOD), src/vehicles/ (bike, ATV), src/player/ (walker, collision, surfaces, touch), src/audio/, src/textures/

BUILD METHOD
Before writing code, read: github.com/cloudai-x/threejs-skills, github.com/dgreenheck/webgpu-claude-skill, github.com/majidmanzarpour/threejs-game-skills, and find skills for Three.js cinematic outdoor scenes.

Build one system at a time in this order:
1. sky and lighting
2. hotels
3. palms
4. street, lamps, parked cars
5. park, promenade, beach, ocean, towers
6. people and birds
7. bike and ATV
8. walking, collision, surfaces
9. synthesized spatial audio
10. loader, quality tiers, touch controls
11. full-scene polish

After each system, screenshot these cameras and compare to real Ocean Drive / South Beach sunrise photos:
A. street looking north between hotels and palms
B. street looking south with parked cars and café patios
C. first-person on the bike in the park strip
D. wide beach toward the sun and wet sand
E. close lifeguard tower with sun flare and ATV
F. first-person riding the ATV down the beach
G. standing in the swash looking into the glitter path
H. looking back from the sand toward the hotel row

Critic pass: list only specific fakes — wrong pastel colors, plastic water, repeated hotels, game-engine palms, missing long shadows, empty street, hard horizon, no haze, toy cars, dry-looking wet sand, no contact shadows, billboard trees, neon nightlife look. Fix those before continuing.

RULES
- No real hotel names, brands, or logos
- No video-game UI chrome except an optional fps HUD behind ?hud=1
- No night neon, no crowds, no GTA parody
- Sequential work, don't spawn huge parallel jobs
- Deploy (Vercel behind sign-in, see above)
- Give a live link and a repo that runs with npm install && npm run dev

SUCCESS LOOKS LIKE THIS
A person clicks, locks the mouse, and can:
- walk the sidewalk past mint and pink hotels and café umbrellas
- look down a palm-lined street into warm haze
- cut across grass to a beach cruiser and ride with a wicker basket in frame
- walk onto raked sand toward a colorful lifeguard tower
- climb the tower stairs
- mount the red ATV and drive the beach
- stand in the incoming swash with the sun path on the water
- hear waves, gulls, palm wind, patio music, and footsteps change from pavement to sand

It must feel like standing on Ocean Drive at sunrise, generated entirely in code.
