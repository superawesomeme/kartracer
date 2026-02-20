import * as THREE from 'three';
import { createMonster } from './monster.js';
import { lerp, clamp, normalizeAngle } from './utils.js';

const KART_COLORS = [0xff3333, 0x3399ff, 0xffdd00, 0x22cc66];
const MONSTER_NAMES = ['Gremlock', 'Purplow', 'Blazork', 'Zappie'];

export class Kart {
  /**
   * @param {THREE.Scene} scene
   * @param {object}      track   Track instance
   * @param {THREE.Vector3} startPosition
   * @param {number}      startAngle   radians
   * @param {number}      monsterType  0-3
   * @param {boolean}     isPlayer
   * @param {THREE.Camera} camera  (player only)
   */
  constructor(scene, track, startPosition, startAngle, monsterType, isPlayer, camera) {
    this.scene      = scene;
    this.track      = track;
    this.isPlayer   = isPlayer;
    this.camera     = camera;
    this.monsterType = monsterType;
    this.name       = MONSTER_NAMES[monsterType % 4];

    // Physics state
    this.position   = startPosition.clone();
    this.angle      = startAngle;
    this.speed      = 0;
    this.maxSpeed   = 25;
    this.acceleration  = 0.3;
    this.deceleration  = 0.15;
    this.turnSpeed     = 0.03;

    // Race state
    this.coins      = 0;
    this.heldItem   = null;
    this.laps       = 0;
    this.rank       = 1;
    this.trackT     = 0;   // progress along track curve (0..1)
    this.prevTrackT = 0;
    this.finished   = false;
    this.finishTime = Infinity;

    // Item effects
    this.spinTimer        = 0;   // > 0 = spinning
    this.boostTimer       = 0;   // > 0 = speed boost
    this.slowTimer        = 0;   // > 0 = slowed by lightning
    this.shielded         = false;
    this._shieldMesh      = null;
    this._boostMultiplier = 1.5;

    // Camera lerp targets (player only)
    this._camPos    = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();

    this._buildMesh();
  }

  // ── Build visual ────────────────────────────────────────────────────────────

  _buildMesh() {
    this.group = new THREE.Group();

    // Kart body
    const bodyGeo = new THREE.BoxGeometry(1.8, 0.6, 2.8);
    const bodyMat = new THREE.MeshLambertMaterial({ color: KART_COLORS[this.monsterType % 4] });
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.y = 0.4;
    this.group.add(this.bodyMesh);

    // Front windshield bump
    const shieldGeo = new THREE.BoxGeometry(1.5, 0.35, 0.8);
    const shieldMat = new THREE.MeshLambertMaterial({ color: 0x88ccff, transparent: true, opacity: 0.7 });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.position.set(0, 0.72, -0.5);
    this.group.add(shield);

    // Wheels – 4 cylinders
    this.wheels = [];
    const wGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12);
    const wMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.32, 8);
    const hubMat = new THREE.MeshLambertMaterial({ color: 0x888888 });

    const wheelPositions = [
      [-1.05,  0.35,  1.0],
      [ 1.05,  0.35,  1.0],
      [-1.05,  0.35, -1.0],
      [ 1.05,  0.35, -1.0],
    ];
    wheelPositions.forEach(([x, y, z]) => {
      const wGroup = new THREE.Group();
      const wheel = new THREE.Mesh(wGeo, wMat);
      wheel.rotation.z = Math.PI / 2;
      wGroup.add(wheel);
      const hub = new THREE.Mesh(hubGeo, hubMat);
      hub.rotation.z = Math.PI / 2;
      wGroup.add(hub);
      wGroup.position.set(x, y, z);
      this.group.add(wGroup);
      this.wheels.push(wGroup);
    });

    // Monster on top
    this.monster = createMonster(this.scene, this.monsterType);
    this.monster.position.set(0, 0.85, 0.2);
    this.monster.scale.setScalar(0.55);
    this.group.add(this.monster);

    // Position group
    this.group.position.copy(this.position);
    this.scene.add(this.group);

    // Initialise smooth camera positions
    if (this.isPlayer && this.camera) {
      const behind = this._getCameraOffset();
      this._camPos.copy(behind);
      this._camTarget.copy(this.position).add(new THREE.Vector3(0, 3, 0));
      this.camera.position.copy(this._camPos);
      this.camera.lookAt(this._camTarget);
    }
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  /**
   * @param {number} deltaTime
   * @param {object} keys  { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Space }
   */
  update(deltaTime, keys) {
    if (this.finished) return;

    // ── Timers ────────────────────────────────────────────────────────────────
    if (this.spinTimer  > 0) this.spinTimer  -= deltaTime;
    if (this.boostTimer > 0) this.boostTimer -= deltaTime;
    if (this.slowTimer  > 0) this.slowTimer  -= deltaTime;

    // ── Compute effective max speed ───────────────────────────────────────────
    const coinBoost = 1 + clamp(this.coins, 0, 10) * 0.01;
    let topSpeed = this.maxSpeed * coinBoost;
    if (this.boostTimer > 0) topSpeed *= this._boostMultiplier;
    if (this.slowTimer  > 0) topSpeed *= 0.45;

    // ── Spin-out ──────────────────────────────────────────────────────────────
    if (this.spinTimer > 0) {
      this.angle += 4.5 * deltaTime;
      this.speed  = lerp(this.speed, 0, 0.08);
      this._applyMotion(deltaTime);
      this._syncMesh(deltaTime);
      return;
    }

    // ── Player controls ───────────────────────────────────────────────────────
    if (this.isPlayer) {
      if (keys['ArrowUp']) {
        this.speed = Math.min(this.speed + this.acceleration, topSpeed);
      } else if (keys['ArrowDown']) {
        this.speed = Math.max(this.speed - this.acceleration * 1.5, -topSpeed * 0.4);
      } else {
        // Decelerate naturally
        if (this.speed > 0) this.speed = Math.max(0, this.speed - this.deceleration);
        else if (this.speed < 0) this.speed = Math.min(0, this.speed + this.deceleration);
      }

      if (this.speed !== 0) {
        const turnFactor = clamp(Math.abs(this.speed) / topSpeed, 0.3, 1);
        if (keys['ArrowLeft'])  this.angle += this.turnSpeed * turnFactor * (this.speed > 0 ? 1 : -1);
        if (keys['ArrowRight']) this.angle -= this.turnSpeed * turnFactor * (this.speed > 0 ? 1 : -1);
      }
    }

    this._applyMotion(deltaTime);
    this._handleTrackBounds();
    this._syncMesh(deltaTime);
    this._updateCamera();
  }

  // ── Motion helpers ──────────────────────────────────────────────────────────

  _applyMotion(deltaTime) {
    this.position.x += Math.sin(this.angle) * this.speed * deltaTime;
    this.position.z += Math.cos(this.angle) * this.speed * deltaTime;
  }

  _handleTrackBounds() {
    const result = this.track.getNearestTrackPoint(this.position);
    this.trackT  = result.t;

    if (result.distance > this.track.trackWidth / 2 + 0.5) {
      // Push back toward track centre
      const dir = new THREE.Vector3().subVectors(result.point, this.position);
      dir.y = 0;
      dir.normalize();
      this.position.addScaledVector(dir, (result.distance - this.track.trackWidth / 2) * 0.35);
      this.speed *= 0.6;

      // Lose coins on hard collision
      if (result.distance > this.track.trackWidth / 2 + 2) {
        this.loseCoins(2);
      }
    }

    // Snap Y to track surface
    this.position.y = lerp(this.position.y, result.point.y + 0.35, 0.25);
  }

  _syncMesh(deltaTime) {
    this.group.position.copy(this.position);

    // Smooth angle interpolation
    const targetQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0), this.angle
    );
    this.group.quaternion.slerp(targetQuat, 0.2);

    // Wheel rotation from speed
    const wheelRot = this.speed * deltaTime * 0.8;
    this.wheels.forEach(w => {
      w.rotation.x += wheelRot;
    });

    // Monster slight wobble
    if (this.monster) {
      this.monster.rotation.y = Math.sin(performance.now() * 0.002) * 0.08;
    }

    // Shield visual
    if (this.shielded && this._shieldMesh) {
      this._shieldMesh.rotation.y += deltaTime * 2;
    }
  }

  _getCameraOffset() {
    const back  = new THREE.Vector3(
      -Math.sin(this.angle) * 15,
      5,
      -Math.cos(this.angle) * 15
    );
    return this.position.clone().add(back);
  }

  _updateCamera() {
    if (!this.isPlayer || !this.camera) return;

    const targetPos    = this._getCameraOffset();
    const targetLookAt = this.position.clone().add(new THREE.Vector3(0, 3, 0));

    this._camPos.lerp(targetPos, 0.1);
    this._camTarget.lerp(targetLookAt, 0.15);

    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camTarget);
  }

  // ── Lap counting ────────────────────────────────────────────────────────────

  checkLapCrossing() {
    const curr = this.trackT;
    const prev = this.prevTrackT;

    // Detect forward crossing of t=0 (wrap from ~1 → ~0)
    if (prev > 0.85 && curr < 0.15) {
      this.laps++;
      this.prevTrackT = curr;
      return true;
    }
    this.prevTrackT = curr;
    return false;
  }

  // ── Item / coin API ─────────────────────────────────────────────────────────

  collectCoin() {
    if (this.coins >= 10) return 0;
    this.coins = Math.min(10, this.coins + 1);
    return 1;
  }

  loseCoins(count) {
    const lost = Math.min(this.coins, count);
    this.coins = Math.max(0, this.coins - lost);
    return lost;
  }

  /**
   * Apply a collected item effect.
   * @param {string} itemType
   */
  applyItem(itemType) {
    switch (itemType) {
      case 'mushroom':
        this.boostTimer = 3;
        break;

      case 'shield':
        this.shielded = true;
        this._addShieldMesh();
        break;

      case 'lightning_hit':
        this.slowTimer = 3;
        this.loseCoins(3);
        break;

      default:
        break;
    }
  }

  /** Trigger a spin-out (from shell/banana hit). */
  spinOut() {
    if (this.spinTimer > 0 || this.shielded) return;
    this.spinTimer = 1.2;
    this.loseCoins(3);
  }

  // ── Shield visual ────────────────────────────────────────────────────────────

  _addShieldMesh() {
    if (this._shieldMesh) return;
    const geo = new THREE.SphereGeometry(2.0, 12, 8);
    const mat = new THREE.MeshLambertMaterial({
      color: 0x44eeff, transparent: true, opacity: 0.28, side: THREE.DoubleSide
    });
    this._shieldMesh = new THREE.Mesh(geo, mat);
    this._shieldMesh.position.set(0, 0.5, 0);
    this.group.add(this._shieldMesh);
  }

  _removeShieldMesh() {
    if (!this._shieldMesh) return;
    this.group.remove(this._shieldMesh);
    this._shieldMesh.geometry.dispose();
    this._shieldMesh = null;
  }

  /** Compute a sortable race score for ranking. */
  getRaceScore() {
    return this.laps + this.trackT;
  }
}
