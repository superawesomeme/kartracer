import * as THREE from 'three';

// Four preset color schemes for monsters
const COLOR_SCHEMES = [
  {
    name: 'Gremlock',
    body: 0x44cc44,
    belly: 0xaaffaa,
    eye: 0xffffff,
    pupil: 0x222222,
    horn: 0xffaa00,
    mouth: 0xff4444,
    tooth: 0xffffff,
    accent: 0x228822,
  },
  {
    name: 'Purplow',
    body: 0xaa44ff,
    belly: 0xddaaff,
    eye: 0xffffff,
    pupil: 0x111111,
    horn: 0xff66cc,
    mouth: 0xff4466,
    tooth: 0xffeedd,
    accent: 0x772299,
  },
  {
    name: 'Blazork',
    body: 0xff6633,
    belly: 0xffcc99,
    eye: 0xffffff,
    pupil: 0x222222,
    horn: 0xffee00,
    mouth: 0xcc2200,
    tooth: 0xffffff,
    accent: 0xcc3300,
  },
  {
    name: 'Zappie',
    body: 0x2299ff,
    belly: 0xaaddff,
    eye: 0xffffff,
    pupil: 0x001133,
    horn: 0x00ffcc,
    mouth: 0x0044aa,
    tooth: 0xeeffff,
    accent: 0x0055bb,
  },
];

/**
 * Create a cute monster character from Three.js primitives.
 * @param {THREE.Scene} scene  (not added here; caller adds group)
 * @param {number} colorScheme  0-3
 * @returns {THREE.Group}
 */
export function createMonster(scene, colorScheme = 0) {
  const scheme = COLOR_SCHEMES[colorScheme % COLOR_SCHEMES.length];
  const group = new THREE.Group();

  // ── Body ──────────────────────────────────────────────────────────────────
  const bodyGeo = new THREE.SphereGeometry(0.55, 16, 12);
  const bodyMat = new THREE.MeshLambertMaterial({ color: scheme.body });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 0.55, 0);
  group.add(body);

  // Belly highlight
  const bellyGeo = new THREE.SphereGeometry(0.32, 12, 10);
  const bellyMat = new THREE.MeshLambertMaterial({ color: scheme.belly });
  const belly = new THREE.Mesh(bellyGeo, bellyMat);
  belly.position.set(0, 0.5, 0.3);
  group.add(belly);

  // ── Eyes ─────────────────────────────────────────────────────────────────
  function makeEye(xOffset) {
    const eyeGroup = new THREE.Group();

    const whiteGeo = new THREE.SphereGeometry(0.145, 10, 8);
    const whiteMat = new THREE.MeshLambertMaterial({ color: scheme.eye });
    const white = new THREE.Mesh(whiteGeo, whiteMat);
    eyeGroup.add(white);

    const pupilGeo = new THREE.SphereGeometry(0.085, 8, 8);
    const pupilMat = new THREE.MeshLambertMaterial({ color: scheme.pupil });
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(0, 0, 0.1);
    eyeGroup.add(pupil);

    // Shine dot
    const shineGeo = new THREE.SphereGeometry(0.03, 6, 6);
    const shineMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const shine = new THREE.Mesh(shineGeo, shineMat);
    shine.position.set(0.04, 0.04, 0.14);
    eyeGroup.add(shine);

    eyeGroup.position.set(xOffset, 0.72, 0.44);
    return eyeGroup;
  }

  group.add(makeEye(-0.2));
  group.add(makeEye(0.2));

  // ── Mouth ────────────────────────────────────────────────────────────────
  const mouthGeo = new THREE.TorusGeometry(0.14, 0.035, 8, 12, Math.PI);
  const mouthMat = new THREE.MeshLambertMaterial({ color: scheme.mouth });
  const mouth = new THREE.Mesh(mouthGeo, mouthMat);
  mouth.position.set(0, 0.38, 0.5);
  mouth.rotation.set(0, 0, Math.PI); // arch downward = smile
  group.add(mouth);

  // Small teeth
  const toothGeo = new THREE.BoxGeometry(0.07, 0.07, 0.04);
  const toothMat = new THREE.MeshLambertMaterial({ color: scheme.tooth });
  [-0.07, 0.07].forEach(xOff => {
    const tooth = new THREE.Mesh(toothGeo, toothMat);
    tooth.position.set(xOff, 0.35, 0.52);
    group.add(tooth);
  });

  // ── Horns / Features by scheme ────────────────────────────────────────────
  if (colorScheme % 4 === 0) {
    // Green Gremlock: two sharp horns
    const hornGeo = new THREE.ConeGeometry(0.07, 0.35, 8);
    const hornMat = new THREE.MeshLambertMaterial({ color: scheme.horn });
    [-0.2, 0.2].forEach(xOff => {
      const horn = new THREE.Mesh(hornGeo, hornMat);
      horn.position.set(xOff, 1.08, 0);
      horn.rotation.z = xOff < 0 ? 0.25 : -0.25;
      group.add(horn);
    });
  } else if (colorScheme % 4 === 1) {
    // Purple Purplow: big round ears
    const earGeo = new THREE.SphereGeometry(0.22, 10, 8);
    const earMat = new THREE.MeshLambertMaterial({ color: scheme.body });
    const innerEarGeo = new THREE.SphereGeometry(0.12, 8, 6);
    const innerEarMat = new THREE.MeshLambertMaterial({ color: scheme.horn });
    [-0.52, 0.52].forEach(xOff => {
      const ear = new THREE.Mesh(earGeo, earMat);
      ear.position.set(xOff, 0.95, 0);
      group.add(ear);
      const inner = new THREE.Mesh(innerEarGeo, innerEarMat);
      inner.position.set(xOff * 0.88, 0.96, 0.08);
      group.add(inner);
    });
  } else if (colorScheme % 4 === 2) {
    // Orange Blazork: spiky crown of 3 spikes
    const spikeGeo = new THREE.ConeGeometry(0.05, 0.3, 6);
    const spikeMat = new THREE.MeshLambertMaterial({ color: scheme.horn });
    [{ x: 0, z: 0 }, { x: -0.22, z: 0.1 }, { x: 0.22, z: 0.1 }].forEach(p => {
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      spike.position.set(p.x, 1.1, p.z);
      group.add(spike);
    });
  } else {
    // Blue Zappie: single tall antenna with ball
    const antennaGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8);
    const antennaMat = new THREE.MeshLambertMaterial({ color: scheme.accent });
    const antenna = new THREE.Mesh(antennaGeo, antennaMat);
    antenna.position.set(0, 1.15, 0);
    group.add(antenna);

    const ballGeo = new THREE.SphereGeometry(0.07, 8, 8);
    const ballMat = new THREE.MeshLambertMaterial({ color: scheme.horn });
    const ball = new THREE.Mesh(ballGeo, ballMat);
    ball.position.set(0, 1.37, 0);
    group.add(ball);
  }

  // ── Little arms ────────────────────────────────────────────────────────────
  const armGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.28, 8);
  const armMat = new THREE.MeshLambertMaterial({ color: scheme.body });
  [-0.6, 0.6].forEach((xOff, i) => {
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.set(xOff, 0.52, 0.1);
    arm.rotation.z = i === 0 ? 0.8 : -0.8;
    group.add(arm);
  });

  group.name = scheme.name;
  return group;
}

export { COLOR_SCHEMES };
