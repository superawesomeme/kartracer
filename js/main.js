import * as THREE from 'three';
import { Track }          from './track.js';
import { Kart }           from './kart.js';
import { AI }             from './ai.js';
import { ParticleSystem } from './particles.js';
import { ItemManager }    from './items.js';
import { HUD }            from './hud.js';
import { distance3D }     from './utils.js';

// ── Renderer / Scene / Camera ───────────────────────────────────────────────

const canvas   = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 120, 350);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 15, 30);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ── Lighting ────────────────────────────────────────────────────────────────

const ambient = new THREE.AmbientLight(0x404040, 0.6);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(80, 120, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far  = 500;
sun.shadow.camera.left = sun.shadow.camera.bottom = -200;
sun.shadow.camera.right = sun.shadow.camera.top   =  200;
scene.add(sun);

// Horizon fill light
const fill = new THREE.DirectionalLight(0xaabbff, 0.35);
fill.position.set(-60, 30, -80);
scene.add(fill);

// ── Track ────────────────────────────────────────────────────────────────────

const track = new Track();
track.createTrackMesh(scene);

// ── Kart start positions (staggered on start line) ───────────────────────────

const TOTAL_LAPS = 3;
const startT     = 0.0;
const startPt    = track.getTrackPointAt(startT);
const startTang  = track.curve.getTangentAt(startT);
const startPerp  = new THREE.Vector3()
  .crossVectors(startTang, new THREE.Vector3(0, 1, 0))
  .normalize();
const startAngle = Math.atan2(startTang.x, startTang.z);

function kartStart(row, col) {
  // row 0 = front, row 1 = back; col -1 = left, 0 = centre, 1 = right
  const pos = startPt.clone()
    .addScaledVector(startTang, -row * 5.5)
    .addScaledVector(startPerp,  col * 5);
  pos.y = startPt.y + 0.35;
  return pos;
}

// ── HUD ──────────────────────────────────────────────────────────────────────

const hud = new HUD();

// ── Karts ────────────────────────────────────────────────────────────────────

const playerKart = new Kart(scene, track, kartStart(0, 0), startAngle, 0, true, camera);
const aiKarts    = [
  new Kart(scene, track, kartStart(0, -1), startAngle, 1, false, null),
  new Kart(scene, track, kartStart(1,  1), startAngle, 2, false, null),
  new Kart(scene, track, kartStart(1, -1), startAngle, 3, false, null),
];
const allKarts = [playerKart, ...aiKarts];

// Set initial trackT so lap detection works from the beginning
allKarts.forEach(k => {
  const result = track.getNearestTrackPoint(k.position);
  k.trackT     = result.t;
  k.prevTrackT = result.t;
});

// ── AI controllers ────────────────────────────────────────────────────────────

const waypoints = track.getWaypoints();
const aiControllers = aiKarts.map(k => new AI(k, waypoints));

// ── Particle system & Item manager ───────────────────────────────────────────

const particles   = new ParticleSystem(scene);
const itemManager = new ItemManager(scene, track);

// ── Keyboard state ────────────────────────────────────────────────────────────

const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  // Prevent page scroll with arrow keys
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
    e.preventDefault();
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// ── Game State ────────────────────────────────────────────────────────────────

const gameState = {
  phase:       'waiting',  // waiting | countdown | racing | finished
  countdown:   3,
  totalLaps:   TOTAL_LAPS,
  elapsed:     0,
};

let lastTime = performance.now();

// ── Button handlers ───────────────────────────────────────────────────────────

document.getElementById('start-btn').addEventListener('click', () => {
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('game-view').classList.remove('hidden');
  startCountdown();
});

document.getElementById('restart-btn').addEventListener('click', () => {
  document.getElementById('finish-screen').classList.add('hidden');
  location.reload();
});

// ── Countdown ─────────────────────────────────────────────────────────────────

function startCountdown() {
  gameState.phase     = 'countdown';
  gameState.countdown = 3;
}

// ── Coin / Box collection ─────────────────────────────────────────────────────

const COIN_COLLECT_DIST = 3;
const BOX_COLLECT_DIST  = 4;

function checkPickups() {
  allKarts.forEach(kart => {
    // Coins
    track.coinMeshes.forEach(coin => {
      if (coin.collected) return;
      const d = distance3D(kart.position, coin.mesh.position);
      if (d < COIN_COLLECT_DIST) {
        coin.collected = true;
        coin.mesh.visible  = false;
        coin.respawnTimer  = 8;
        const gained = kart.collectCoin();
        if (gained > 0) {
          particles.emit('coin_collect', kart.position.clone().add(new THREE.Vector3(0, 1, 0)), 8);
        }
      }
    });

    // Mystery boxes
    track.boxMeshes.forEach(box => {
      if (box.collected) return;
      const d = distance3D(kart.position, box.mesh.position);
      if (d < BOX_COLLECT_DIST) {
        box.collected = true;
        box.mesh.visible  = false;
        box.respawnTimer  = 10;
        const item = itemManager.getRandomItem();
        kart.heldItem = item;
        if (kart.isPlayer) {
          hud.showItemMessage(itemIconName(item));
        }
      }
    });
  });
}

function itemIconName(item) {
  const map = { mushroom:'🍄 Mushroom!', shell:'🐚 Shell!', shield:'🛡️ Shield!', banana:'🍌 Banana!', lightning:'⚡ Lightning!' };
  return map[item] || item;
}

// ── Player item usage (Space) ─────────────────────────────────────────────────

let spacePressedLast = false;

function handlePlayerItem() {
  const spaceNow = !!keys['Space'];
  if (spaceNow && !spacePressedLast) {
    usePlayerItem();
  }
  spacePressedLast = spaceNow;
}

function usePlayerItem() {
  const item = playerKart.heldItem;
  if (!item) return;
  playerKart.heldItem = null;

  switch (item) {
    case 'mushroom':
      playerKart.applyItem('mushroom');
      particles.emit('speed_boost', playerKart.position.clone(), 12);
      break;

    case 'shield':
      playerKart.applyItem('shield');
      break;

    case 'shell': {
      const dir = new THREE.Vector3(
        Math.sin(playerKart.angle), 0, Math.cos(playerKart.angle)
      ).normalize();
      itemManager.createProjectile(playerKart.position.clone(), dir, playerKart);
      break;
    }

    case 'banana':
      itemManager.createBanana(playerKart.position.clone());
      break;

    case 'lightning':
      itemManager.applyLightning(allKarts, playerKart);
      particles.emit('hit', playerKart.position.clone().add(new THREE.Vector3(0, 3, 0)), 20);
      break;
  }
}

// ── Lap / Finish detection ────────────────────────────────────────────────────

let raceFinished = false;

function checkLaps() {
  allKarts.forEach(kart => {
    if (kart.finished) return;
    const crossed = kart.checkLapCrossing();
    if (crossed) {
      if (kart === playerKart) {
        if (kart.laps >= TOTAL_LAPS) {
          kart.finished   = true;
          kart.finishTime = gameState.elapsed;
          particles.emit('finish', kart.position.clone().add(new THREE.Vector3(0, 3, 0)), 20);
        }
      } else {
        if (kart.laps >= TOTAL_LAPS) {
          kart.finished   = true;
          kart.finishTime = gameState.elapsed;
        }
      }
    }
  });

  // Race ends when ALL karts finish or player finishes
  if (!raceFinished && playerKart.finished) {
    raceFinished = true;
    // Give AI a moment to finish too, then show screen
    setTimeout(showFinish, 2200);
  }
}

function showFinish() {
  gameState.phase = 'finished';
  const sorted = [...allKarts].sort((a, b) => {
    // Finished karts ranked by finish time, unfinished by score
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.getRaceScore() - a.getRaceScore();
  });
  hud.showFinishScreen(sorted, playerKart);
}

// ── Ranking update each frame ────────────────────────────────────────────────

function updateRankings() {
  const sorted = [...allKarts].sort((a, b) => b.getRaceScore() - a.getRaceScore());
  sorted.forEach((k, i) => { k.rank = i + 1; });
}

// ── Main Loop ────────────────────────────────────────────────────────────────

function loop(nowMs) {
  requestAnimationFrame(loop);

  const deltaTime = Math.min((nowMs - lastTime) / 1000, 0.05);
  lastTime = nowMs;

  if (gameState.phase === 'waiting') {
    renderer.render(scene, camera);
    return;
  }

  gameState.elapsed += deltaTime;

  // ── Countdown phase ─────────────────────────────────────────────────────
  if (gameState.phase === 'countdown') {
    gameState.countdown -= deltaTime;

    if (gameState.countdown <= -0.5) {
      gameState.phase     = 'racing';
      gameState.countdown = 0;
    }

    // Allow camera to follow even in countdown
    playerKart._updateCamera && playerKart._updateCamera();
    hud.update(playerKart, allKarts, gameState);
    track.update(deltaTime);
    renderer.render(scene, camera);
    return;
  }

  // ── Racing phase ─────────────────────────────────────────────────────────
  if (gameState.phase === 'racing' || gameState.phase === 'finished') {

    // Player kart
    if (!playerKart.finished) {
      handlePlayerItem();
      playerKart.update(deltaTime, keys);
    }

    // AI karts
    aiControllers.forEach((ai, i) => {
      ai.update(deltaTime, allKarts, itemManager);
      if (!aiKarts[i].finished) {
        aiKarts[i].update(deltaTime, {});
      }
    });

    // Systems
    if (gameState.phase === 'racing') {
      checkPickups();
      checkLaps();
    }
    updateRankings();
    itemManager.update(deltaTime, allKarts, particles);
    particles.update(deltaTime);
    track.update(deltaTime);

    hud.update(playerKart, allKarts, gameState);
    renderer.render(scene, camera);
  }
}

// ── Decorative elements ───────────────────────────────────────────────────────

function addEnvironment() {
  // Trees as simple cone+cylinder combos scattered around
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a4f2e });
  const leafMat  = new THREE.MeshLambertMaterial({ color: 0x227722 });
  const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x339933 });

  const treePositions = [
    [-130, 0, -90], [130, 0, 80], [-120, 0, 60], [110, 0, -60],
    [-90, 0, 100], [0, 0, -110], [60, 0, 110], [-60, 0, 110],
    [120, 0, 20], [-120, 0, -20], [0, 0, 110], [-50, 0, -100],
    [50, 0, -100], [130, 0, -30], [-130, 0, 30],
  ];

  treePositions.forEach(([x, , z]) => {
    const group = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.55, 3, 8);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.5;
    group.add(trunk);

    const leavesGeo = new THREE.ConeGeometry(3.5, 6, 8);
    const mat = Math.random() > 0.5 ? leafMat : leafMat2;
    const leaves = new THREE.Mesh(leavesGeo, mat);
    leaves.position.y = 6;
    group.add(leaves);

    // check we're not too close to track
    const tp = new THREE.Vector3(x, 0, z);
    const near = track.getNearestTrackPoint(tp);
    if (near.distance > 18) {
      group.position.set(x, 0, z);
      scene.add(group);
    }
  });

  // Grandstand bleachers near start line
  const blGeo = new THREE.BoxGeometry(14, 4, 3);
  const blMat = new THREE.MeshLambertMaterial({ color: 0x4488ff });
  const bl = new THREE.Mesh(blGeo, blMat);
  const sp = track.getTrackPointAt(0);
  bl.position.set(sp.x + 18, sp.y + 2, sp.z);
  scene.add(bl);

  // Crowd dots
  const crowdMat = new THREE.MeshLambertMaterial({ color: 0xff6622 });
  for (let ci = 0; ci < 20; ci++) {
    const cGeo = new THREE.SphereGeometry(0.35, 6, 5);
    const crowd = new THREE.Mesh(cGeo, crowdMat);
    crowd.position.set(
      sp.x + 11 + Math.random() * 12,
      sp.y + 3 + Math.random() * 2,
      sp.z + (Math.random() - 0.5) * 2.5
    );
    scene.add(crowd);
  }
}

addEnvironment();

// Kick off render loop immediately (will be in 'waiting' until start is clicked)
requestAnimationFrame(loop);
