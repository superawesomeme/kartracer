import * as THREE from 'three';

const TRACK_WIDTH = 20;
const NUM_COINS = 24;
const NUM_BOXES = 10;

// Circuit waypoints – kidney/oval circuit with a fun chicane
const WAYPOINT_LIST = [
  new THREE.Vector3(0,    0, -80),
  new THREE.Vector3(60,   0, -80),
  new THREE.Vector3(100,  0, -40),
  new THREE.Vector3(100,  0,   0),
  new THREE.Vector3(80,   2,  50),
  new THREE.Vector3(40,   4,  80),
  new THREE.Vector3(0,    4,  90),
  new THREE.Vector3(-40,  2,  80),
  new THREE.Vector3(-80,  0,  50),
  new THREE.Vector3(-100, 0,   0),
  new THREE.Vector3(-80,  0, -50),
  new THREE.Vector3(-40,  0, -80),
];

export class Track {
  constructor() {
    this.trackWidth = TRACK_WIDTH;

    // Build closed CatmullRomCurve3
    this.curve = new THREE.CatmullRomCurve3(WAYPOINT_LIST, true, 'catmullrom', 0.5);

    this.coinMeshes   = [];   // {mesh, collected, respawnTimer}
    this.boxMeshes    = [];   // {mesh, collected, respawnTimer, baseY}
    this._waypoints   = null; // cached evenly-spaced waypoints
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Build all track visuals into the scene. */
  createTrackMesh(scene) {
    this._buildGround(scene);
    this._buildRoad(scene);
    this._buildGuardrails(scene);
    this._buildStartFinishLine(scene);
    this._buildCoins(scene);
    this._buildMysteryBoxes(scene);
  }

  /** Returns ~20 evenly-spaced waypoints for AI navigation. */
  getWaypoints() {
    if (this._waypoints) return this._waypoints;
    const count = 20;
    this._waypoints = [];
    for (let i = 0; i < count; i++) {
      this._waypoints.push(this.curve.getPointAt(i / count));
    }
    return this._waypoints;
  }

  /** Position on track centre at parameter t (0..1). */
  getTrackPointAt(t) {
    return this.curve.getPointAt(t % 1);
  }

  /**
   * Returns { t, point, tangent, distance } for the nearest track point.
   * Uses a coarse + fine sweep.
   */
  getNearestTrackPoint(position) {
    const COARSE = 200;
    let bestT = 0;
    let bestDist = Infinity;

    for (let i = 0; i <= COARSE; i++) {
      const t = i / COARSE;
      const pt = this.curve.getPointAt(t);
      const dx = pt.x - position.x;
      const dz = pt.z - position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestDist) { bestDist = d; bestT = t; }
    }

    // Fine sweep ± 1/COARSE around bestT
    const FINE = 50;
    const step = 1 / COARSE;
    for (let i = -FINE; i <= FINE; i++) {
      const t = ((bestT + i * step / FINE) % 1 + 1) % 1;
      const pt = this.curve.getPointAt(t);
      const dx = pt.x - position.x;
      const dz = pt.z - position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestDist) { bestDist = d; bestT = t; }
    }

    const point   = this.curve.getPointAt(bestT);
    const tangent = this.curve.getTangentAt(bestT);
    return { t: bestT, point, tangent, distance: bestDist };
  }

  /** True if position is within trackWidth/2 of the centre line. */
  isOnTrack(position) {
    const { distance } = this.getNearestTrackPoint(position);
    return distance <= this.trackWidth / 2;
  }

  /** Animate coins & mystery boxes each frame. */
  update(deltaTime) {
    const t = performance.now() * 0.001;

    this.coinMeshes.forEach(c => {
      if (c.collected) {
        c.respawnTimer -= deltaTime;
        if (c.respawnTimer <= 0) {
          c.collected = false;
          c.mesh.visible = true;
        }
      } else {
        c.mesh.rotation.y += deltaTime * 2.5;
      }
    });

    this.boxMeshes.forEach((b, idx) => {
      if (b.collected) {
        b.respawnTimer -= deltaTime;
        if (b.respawnTimer <= 0) {
          b.collected = false;
          b.mesh.visible = true;
        }
      } else {
        b.mesh.rotation.y += deltaTime * 1.2;
        b.mesh.position.y = b.baseY + Math.sin(t * 2 + idx) * 0.4;
      }
    });
  }

  // ── Private builders ───────────────────────────────────────────────────────

  _buildGround(scene) {
    const geo  = new THREE.PlaneGeometry(500, 500);
    const mat  = new THREE.MeshLambertMaterial({ color: 0x3aaa3a });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.15;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  _buildRoad(scene) {
    // Sample points along curve and build a ribbon via ExtrudeGeometry
    const segments = 300;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      pts.push(this.curve.getPointAt(i / segments));
    }

    const roadMat  = new THREE.MeshLambertMaterial({ color: 0x444455 });
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x55bb55 });

    // Build road quads segment by segment
    const roadVerts  = [];
    const grassLVerts = [];
    const grassRVerts = [];

    for (let i = 0; i < segments; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const tang = new THREE.Vector3().subVectors(p1, p0).normalize();
      const up   = new THREE.Vector3(0, 1, 0);
      const perp = new THREE.Vector3().crossVectors(tang, up).normalize();

      const hw  = this.trackWidth / 2;
      const gw  = hw + 6; // grass strip width

      const l0 = p0.clone().addScaledVector(perp, -hw);
      const r0 = p0.clone().addScaledVector(perp,  hw);
      const l1 = p1.clone().addScaledVector(perp, -hw);
      const r1 = p1.clone().addScaledVector(perp,  hw);

      const gl0 = p0.clone().addScaledVector(perp, -gw);
      const gr0 = p0.clone().addScaledVector(perp,  gw);
      const gl1 = p1.clone().addScaledVector(perp, -gw);
      const gr1 = p1.clone().addScaledVector(perp,  gw);

      // Road quad (2 tris)
      roadVerts.push(l0.x, l0.y, l0.z,  r0.x, r0.y, r0.z,  l1.x, l1.y, l1.z);
      roadVerts.push(r0.x, r0.y, r0.z,  r1.x, r1.y, r1.z,  l1.x, l1.y, l1.z);

      // Left grass
      grassLVerts.push(gl0.x, gl0.y, gl0.z,  l0.x, l0.y, l0.z,  gl1.x, gl1.y, gl1.z);
      grassLVerts.push(l0.x,  l0.y,  l0.z,   l1.x, l1.y, l1.z,  gl1.x, gl1.y, gl1.z);

      // Right grass
      grassRVerts.push(r0.x, r0.y, r0.z,  gr0.x, gr0.y, gr0.z,  r1.x, r1.y, r1.z);
      grassRVerts.push(gr0.x, gr0.y, gr0.z, gr1.x, gr1.y, gr1.z, r1.x, r1.y, r1.z);
    }

    const mkMesh = (verts, mat) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      scene.add(m);
    };

    mkMesh(roadVerts,   roadMat);
    mkMesh(grassLVerts, grassMat);
    mkMesh(grassRVerts, grassMat);

    // Dashed centre line
    const dashMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const dashCount = 60;
    for (let i = 0; i < dashCount; i++) {
      const t  = i / dashCount;
      const p  = this.curve.getPointAt(t);
      const tg = this.curve.getTangentAt(t);
      const dashGeo = new THREE.BoxGeometry(0.25, 0.05, 1.4);
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.position.copy(p);
      dash.position.y += 0.03;
      dash.lookAt(p.clone().add(tg));
      scene.add(dash);
    }
  }

  _buildGuardrails(scene) {
    const segments = 120;
    const hw = this.trackWidth / 2 + 0.5;
    const redMat   = new THREE.MeshLambertMaterial({ color: 0xdd2222 });
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const p0 = this.curve.getPointAt(t0);
      const p1 = this.curve.getPointAt(t1);
      const tang = new THREE.Vector3().subVectors(p1, p0).normalize();
      const up   = new THREE.Vector3(0, 1, 0);
      const perp = new THREE.Vector3().crossVectors(tang, up).normalize();

      const len = p0.distanceTo(p1) + 0.05;
      const mat = i % 2 === 0 ? redMat : whiteMat;
      const railGeo = new THREE.BoxGeometry(0.4, 0.8, len);

      [-1, 1].forEach(side => {
        const rail = new THREE.Mesh(railGeo, mat);
        const centre = p0.clone().lerp(p1, 0.5).addScaledVector(perp, side * hw);
        rail.position.copy(centre);
        rail.position.y += 0.4;
        rail.lookAt(centre.clone().add(tang));
        scene.add(rail);
      });
    }
  }

  _buildStartFinishLine(scene) {
    const p  = this.curve.getPointAt(0);
    const tg = this.curve.getTangentAt(0);
    const up = new THREE.Vector3(0, 1, 0);
    const perp = new THREE.Vector3().crossVectors(tg, up).normalize();

    const cells = 8;
    const cellW = this.trackWidth / cells;

    for (let i = 0; i < cells; i++) {
      const offset = (i - cells / 2 + 0.5) * cellW;
      const mat = new THREE.MeshLambertMaterial({
        color: i % 2 === 0 ? 0xffffff : 0x111111,
      });
      const geo = new THREE.BoxGeometry(cellW, 0.08, 1.5);
      const mesh = new THREE.Mesh(geo, mat);
      const pos = p.clone().addScaledVector(perp, offset);
      mesh.position.copy(pos);
      mesh.position.y += 0.04;
      mesh.lookAt(pos.clone().add(tg));
      scene.add(mesh);
    }
  }

  _buildCoins(scene) {
    const goldMat = new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: 0x886600 });

    for (let i = 0; i < NUM_COINS; i++) {
      const t = i / NUM_COINS;
      const p = this.curve.getPointAt(t);
      const geo = new THREE.SphereGeometry(0.35, 10, 8);
      const mesh = new THREE.Mesh(geo, goldMat);
      mesh.position.set(p.x, p.y + 1.2, p.z);
      scene.add(mesh);
      this.coinMeshes.push({ mesh, collected: false, respawnTimer: 0 });
    }
  }

  _buildMysteryBoxes(scene) {
    const boxMat = new THREE.MeshLambertMaterial({ color: 0xee9900, emissive: 0x443300 });
    const qMat   = new THREE.MeshLambertMaterial({ color: 0xffffff });

    for (let i = 0; i < NUM_BOXES; i++) {
      const t = (i + 0.5) / NUM_BOXES;
      const p = this.curve.getPointAt(t);
      const baseY = p.y + 1.5;

      const group = new THREE.Group();

      const cubeGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
      const cube = new THREE.Mesh(cubeGeo, boxMat);
      group.add(cube);

      // "?" made from a flat plane with ? via a box cross approximation
      const vGeo = new THREE.BoxGeometry(0.15, 0.45, 0.15);
      const hGeo = new THREE.BoxGeometry(0.35, 0.15, 0.15);
      const dotGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);

      const qV = new THREE.Mesh(vGeo, qMat);
      qV.position.set(0, 0.1, 0.58);
      group.add(qV);

      const qH = new THREE.Mesh(hGeo, qMat);
      qH.position.set(0, 0.28, 0.58);
      group.add(qH);

      const qDot = new THREE.Mesh(dotGeo, qMat);
      qDot.position.set(0, -0.2, 0.58);
      group.add(qDot);

      group.position.set(p.x, baseY, p.z);
      scene.add(group);
      this.boxMeshes.push({ mesh: group, collected: false, respawnTimer: 0, baseY });
    }
  }
}
