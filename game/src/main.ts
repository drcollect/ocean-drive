// Ocean Drive: a walkable Miami Beach sunrise, generated in code.
import { Fog, PerspectiveCamera, Scene, Vector3 } from 'three';
import type { Ctx } from './core/ctx';
import { cameraPose, type CamPose } from './dev/cameras';
import { Input } from './player/input';
import { Player } from './player/player';
import { buildBikeModel } from './vehicles/bikeModel';
import { ATV_DEF, BIKE_DEF, Ride } from './vehicles/ride';
import { Soundscape } from './audio';
import { detectQuality } from './quality';
import { installHaze } from './renderer/haze';
import { Pipeline } from './renderer/pipeline';
import { captureProbe } from './renderer/probe';
import { buildDropGarage, type DropGarage } from './drop/garage';
import { Driving } from './vehicles/drive';
import { installShadows, SunRig } from './renderer/shadows';
import { skyConstants } from './sky/atmosphere';
import { buildSky } from './sky/sky';
import { Title } from './ui/title';
import { buildFarCity } from './world/far';
import { buildHotels } from './world/hotels';
import { buildPalms } from './world/palms';
import { buildCars } from './world/cars';
import { buildFurniture } from './world/furniture';
import { buildStreet } from './world/street';
import { buildPark } from './world/park';
import { Grass } from './world/grass';
import { buildBeach } from './world/beach';
import { buildTowers } from './world/towers';
import { buildOcean } from './world/ocean';
import { swashAt } from './world/surf';
import { buildBody, buildPeople, gait } from './world/people';
import { buildBirds } from './world/birds';
import { terrainHeight } from './world/layout';

const params = new URLSearchParams(location.search);

async function boot(): Promise<void> {
  const q = detectQuality();
  const title = new Title();
  installHaze();
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const pipe = new Pipeline(canvas, q);
  installShadows(pipe.renderer, q);
  const renderer = pipe.renderer;

  const scene = new Scene();
  scene.fog = new Fog(0xffffff, 1, 2); // enables the haze chunks; the numbers are unused
  const camera = new PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.15, 16000);
  camera.rotation.order = 'YXZ';
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  const consts = skyConstants();
  const sunIrr = new Vector3(...consts.sunIrradiance);
  const sunI = Math.max(sunIrr.x, sunIrr.y, sunIrr.z);
  const sun = new SunRig(q, sunIrr.clone().divideScalar(sunI), sunI);
  scene.add(sun.light, sun.target);

  const ctx: Ctx = await title.stage('sky', () => {
    const sky = buildSky(renderer, q);
    scene.add(sky.dome);
    scene.environment = sky.env;
    scene.environmentIntensity = 1;
    return { scene, q, sky, renderer, camera, updaters: [] };
  });

  const hotels = await title.stage('hotels', () => {
    const hotels = buildHotels(ctx);
    scene.add(hotels.group);
    for (const m of buildFarCity()) scene.add(m);
    ctx.updaters.push(() => hotels.update(camera.position));
    (window as unknown as { __hotels: unknown }).__hotels = hotels;
    return hotels;
  });
  const palms = await title.stage('palms', () => {
    const palms = buildPalms(ctx);
    scene.add(palms.group);
    ctx.updaters.push((t) => palms.update(t, camera.position));
    return palms;
  });
  const cars = await title.stage('street', async () => {
    for (const m of buildStreet()) scene.add(m);
    const cars = await buildCars();
    scene.add(cars.root);
    ctx.updaters.push((t, dt) => cars.update(t, dt, camera.position));
    return cars;
  });
  (window as unknown as { __cars: unknown }).__cars = cars;
  const towers = await title.stage('beach', () => {
    const park = buildPark(palms.specs);
    scene.add(park.root);
    const grass = new Grass(q.grass);
    scene.add(grass.mesh);
    ctx.updaters.push((t) => grass.update(t, camera.position));
    const beach = buildBeach();
    for (const m of beach.meshes) scene.add(m);
    const towers = buildTowers(ctx);
    scene.add(towers.group);
    const canByAtv = new Vector3(93.2, terrainHeight(93.2, -125.4), -125.4);
    scene.add(buildFurniture(palms.specs, park.lampSpots, [canByAtv]).root);
    ctx.updaters.push((t) => {
      park.update(t, camera.position);
      beach.update(t, camera.position);
      towers.update(t);
    });
    return towers;
  });
  await title.stage('ocean', () => {
    const ocean = buildOcean(ctx);
    for (const m of ocean.meshes) scene.add(m);
    const sw = { depth: 0, edgeX: 0, flow: 0, highX: 0 };
    ctx.updaters.push((t) => {
      swashAt(camera.position.x, camera.position.z, t, sw);
      ocean.update(t, camera, { x: camera.position.x, z: camera.position.z, wet: sw.depth > 0 });
    });
  });
  (window as unknown as { __towers: unknown }).__towers = towers;
  const life = await title.stage('people', () => {
    const people = buildPeople(hotels.musicSpot);
    scene.add(people.group);
    const birds = buildBirds();
    scene.add(birds.group);
    const cafeSpots = hotels.specs.flatMap((s) => s.cafe.map((c) => new Vector3(c.x, c.y, c.z)));
    ctx.updaters.push((t, dt) => {
      people.update(t, dt, camera.position);
      birds.update(t, dt, camera.position, cafeSpots);
    });
    return { people, birds };
  });
  (window as unknown as { __life: unknown }).__life = life;

  pipe.exposure = Number(params.get('exp') ?? 0.62);
  pipe.toneMap = Number(params.get('tm') ?? 2);

  // ---- the rides and you
  const bikeModel = buildBikeModel('#9ad8cb');
  scene.add(bikeModel.root);
  const bike = new Ride(BIKE_DEF, bikeModel.root, bikeModel.wheels, bikeModel.front, 22.8, 57.5, Math.PI + 0.25);
  const atv = new Ride(ATV_DEF, towers.atv.root, towers.atv.wheels, towers.atv.bars, towers.atvHome.x, towers.atvHome.z, towers.atvHome.yaw);
  const input = new Input(canvas);
  if (q.mobile || ('ontouchstart' in window && navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches)) input.enableTouch();
  const rides = [bike, atv];
  const player = new Player(camera, rides);
  // any car you stand next to: E gets you in
  const driving = new Driving(scene, rides);
  driving.sources.push(cars.carCandidates);
  cars.knockWith((c) => driving.loose(c));
  player.drive = driving;
  scene.add(player.feetMesh.root);
  // your own long shadow: a body only the sun sees (layer 1 is in the shadow camera, not the view)
  const shadowBody = buildBody({ skin: '#d9a784', top: '#f3efe6', bottom: '#6f7f6a', shoes: '#d9a784', hair: '#4a3526', shorts: true });
  shadowBody.root.traverse((o) => o.layers.set(1));
  scene.add(shadowBody.root);
  sun.light.shadow.camera.layers.enable(1);

  // the Collect Drop garage in the park: pay at the kiosk, the door rolls up on your car
  let soundRef: Soundscape | null = null;
  const garage: DropGarage = await buildDropGarage({ scene, renderer, sky: ctx.sky, input, audio: () => soundRef?.engine ?? null });
  scene.add(garage.root);
  player.interactables.push(garage.interactable);
  driving.sources.push(garage.carCandidates);
  garage.knockWith((c) => driving.loose(c));
  // knocked cars slide on, sparks fly
  ctx.updaters.push((t, dt) => driving.update(dt, t, player.riding));
  ctx.updaters.push((t, dt) => garage.update(t, dt, camera.position));

  // the cars reflect the street, not only the sky: one probe from the middle of the road where you start,
  // taken once the first frames have drawn the sun's shadow map
  let probeFrame = 0;
  ctx.updaters.push(() => {
    if (++probeFrame !== 3) return;
    cars.setEnv(captureProbe(renderer, scene, ctx.sky, 0, 1.1, camera.position.z, [cars.root, player.feetMesh.root]));
  });

  // the soundscape (the context wakes up on the first click)
  const sound = await title.stage('audio', () =>
    new Soundscape(q, {
      camera,
      player,
      bike,
      atv,
      car: cars.moving,
      carVisible: () => cars.moving.visible,
      calls: () => life.birds.calls,
      palmsNear: (x, z, r) => palms.crownsNear(x, z, r),
      musicSpot: hotels.musicSpot,
    }),
  );
  soundRef = sound;
  // crashes: sound, sparks when cars meet, and the alarm of a parked car you knocked loose
  Ride.onCrash = (x, y, z, s, carOnCar) => {
    sound.crashes.hit(x, y, z, s, carOnCar);
    if (carOnCar && s > 2.5) driving.spark(x, y, z, s);
  };
  driving.onLoose = (r) => {
    if (!/#|silver/.test(r.def.label ?? '')) sound.crashes.alarm(r.pos.x, r.pos.y + 0.8, r.pos.z);
  };

  const poseParam = params.get('pose'); // x,z,eye,yawDeg,pitchDeg
  const applyPose = (p: CamPose) => {
    if (p.ride === 'bike') {
      bike.pos.set(p.pos.x, terrainHeight(p.pos.x, p.pos.z), p.pos.z);
      bike.yaw = Math.PI - p.yaw;
      bike.speed = 0;
      bike.place(0);
      player.teleport(p.pos.x, p.pos.z, p.yaw, p.pitch);
      player.mount(bike);
      player.pitch += p.pitch;
    } else if (p.ride === 'atv') {
      atv.pos.set(p.pos.x, terrainHeight(p.pos.x, p.pos.z), p.pos.z);
      atv.yaw = Math.PI - p.yaw;
      atv.speed = 0;
      atv.place(0);
      player.teleport(p.pos.x, p.pos.z, p.yaw, p.pitch);
      player.mount(atv);
      player.pitch += p.pitch;
    } else {
      player.teleport(p.pos.x, p.pos.z, p.yaw, p.pitch);
    }
  };
  if (poseParam) {
    const [x, z, , yaw, pitch] = poseParam.split(',').map(Number);
    applyPose({ pos: new Vector3(x, 0, z), yaw: (yaw * Math.PI) / 180, pitch: (pitch * Math.PI) / 180 });
  } else applyPose(cameraPose(params.get('cam') ?? 'A'));

  const fixedT = params.get('t');
  let time = fixedT !== null ? Number(fixedT) : 0;
  let frozen = fixedT !== null;
  let last = performance.now();
  let started = false;

  renderer.info.autoReset = false;
  const hud = document.getElementById('hud') as HTMLDivElement;
  const hint = document.getElementById('pause') as HTMLDivElement;
  const showHud = params.get('hud') === '1';
  if (showHud) hud.style.display = 'block';

  // recording (dev/trailer.ts): the loop can be paused and stepped by hand, and the camera flown from code
  let paused = false;
  let camHook: ((t: number, dt: number) => void) | null = null;

  const step = (dtMs: number, now: number, draw = true) => {
    const dt = Math.min(dtMs / 1000, 0.1);
    if (!frozen) time += dt;
    player.update(started ? dt : 0, time, input);
    camHook?.(time, dt);
    // the shadow-only body walks with you
    shadowBody.root.visible = !player.riding;
    shadowBody.root.position.copy(player.feet);
    shadowBody.root.rotation.y = Math.PI - player.yaw;
    gait(shadowBody, time * 5.6 * Math.min(1, player.speed), Math.min(1, Math.max(0, (player.speed - 1.6) / 1.5)));
    // bike cranks turn with the rear wheel
    bikeModel.cranks.rotation.x = bike.odo / (2 * Math.PI * BIKE_DEF.wheelR) * Math.PI * 2 / 2.2;
    camera.updateMatrixWorld();
    ctx.sky.update(time, camera);
    sun.follow(camera.position.z);
    sun.tick();
    for (const u of ctx.updaters) u(time, dt);
    if (player.muteRequested) sound.toggleMute();
    sound.update(time, dt);
    if (draw) {
      renderer.info.reset();
      pipe.render(scene, camera, time);
    }
    pipe.tick(dtMs, now);
    if (started) {
      const msg = player.prompt || (!input.s.locked && !input.s.touch ? 'Click to walk' : '');
      hint.textContent = msg;
      hint.classList.toggle('on', msg !== '');
    }
    if (showHud) {
      const info = renderer.info;
      hud.textContent = `${q.tier} ${pipe.fps.toFixed(0)} fps  scale ${pipe.scale.toFixed(1)}\ncalls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k\n${player.surface} ${player.feet.x.toFixed(1)} ${player.feet.z.toFixed(1)}\n${q.gpu}`;
    }
  };
  const frame = (now: number) => {
    const dtMs = now - last;
    last = now;
    if (!paused) step(dtMs, now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const start = () => {
    if (started) return;
    started = true;
    title.hide();
    if (!input.s.touch) input.lock();
    else document.documentElement.requestFullscreen?.().catch(() => {});
    sound.start().catch(() => {});
    onStart.forEach((f) => f());
  };
  const onStart: (() => void)[] = [];
  title.ready(input.s.touch ? 'Tap to start' : 'Click to start');
  if (input.s.touch) (document.querySelector('#title .keys') as HTMLElement).textContent = 'Left thumb: walk · drag: look · buttons: jump, use (ride, pay), mute';
  title.onStart(start);

  // ---- dev hooks
  (window as unknown as { __od: unknown }).__od = {
    ready: true,
    q,
    scene,
    camera,
    pipe,
    player,
    bike,
    atv,
    look(x: number, z: number, eye: number, yawDeg: number, pitchDeg: number) {
      void eye;
      applyPose({ pos: new Vector3(x, 0, z), yaw: (yawDeg * Math.PI) / 180, pitch: (pitchDeg * Math.PI) / 180 });
      title.hide(true);
    },
    cam(id: string) {
      applyPose(cameraPose(id));
      title.hide(true);
      return id;
    },
    freeze(t?: number) {
      frozen = true;
      if (t !== undefined) time = t;
    },
    run() {
      frozen = false;
    },
    set exposure(v: number) {
      pipe.exposure = v;
    },
    consts,
    /** Render one frame now and save it to .shots/<name>.png (dev server only). */
    async shot(name: string) {
      step(0, performance.now());
      const url = canvas.toDataURL('image/png');
      await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: url });
      return name;
    },
    info() {
      const i = renderer.info;
      return { calls: i.render.calls, tris: i.render.triangles, fps: pipe.fps, scale: pipe.scale };
    },
    /** drive the walker from code: keys held for ms */
    async hold(codes: string[], ms: number) {
      started = true;
      for (const c of codes) window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
      await new Promise((r) => setTimeout(r, ms));
      for (const c of codes) window.dispatchEvent(new KeyboardEvent('keyup', { code: c }));
    },
    /** hold keys and simulate `seconds` at 60 Hz synchronously (deterministic tests) */
    sim(codes: string[], seconds: number) {
      started = true;
      for (const c of codes) window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
      const n = Math.round(seconds * 60);
      for (let i = 0; i < n; i++) step(1000 / 60, performance.now());
      for (const c of codes) window.dispatchEvent(new KeyboardEvent('keyup', { code: c }));
    },
    press(code: string) {
      started = true;
      window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    },
    onStart,
    sound,
    /** recording: stop the loop (true) and step it by hand; with draw false a step only simulates */
    pause(on: boolean) {
      paused = on;
      started = true;
      last = performance.now();
    },
    step(dtMs: number, draw = true) {
      step(dtMs, performance.now(), draw);
    },
    /** fly the camera from code after the player has placed it (null gives it back) */
    set camHook(f: ((t: number, dt: number) => void) | null) {
      camHook = f;
    },
    get time() {
      return time;
    },
    canvas,
    input,
    driving,
    garage,
    /** average ms per frame over n synchronous frames (forces the GPU to finish) */
    /** the Collect Drop: pull (an edition, or at random), reset, the state */
    drop: {
      pull: (edition?: number) => garage.debugPull(edition),
      reset: () => garage.reset(),
      state: () => garage.state,
      phase: () => garage.phase(),
    },
    bench(n = 30) {
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      step(16.7, performance.now());
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) step(16.7, performance.now());
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return (performance.now() - t0) / n;
    },
  };
  if (params.get('cam') || poseParam) title.hide(true);
  // the trailer recorder, on the dev server only
  if (import.meta.env.DEV) void import('./dev/trailer');
}

boot().catch((e) => {
  console.error(e);
  new Title().error(String(e?.message ?? e));
});
