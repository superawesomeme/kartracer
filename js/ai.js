import * as THREE from 'three';
import { normalizeAngle, randomFloat } from './utils.js';

export class AI {
  /**
   * @param {Kart}  kart       Kart instance controlled by this AI
   * @param {Array} waypoints  Array of THREE.Vector3 from track.getWaypoints()
   */
  constructor(kart, waypoints) {
    this.kart       = kart;
    this.waypoints  = waypoints;
    this.targetIdx  = 1;

    // Each AI has a personality (speed factor + steering jitter)
    this.speedFactor  = randomFloat(0.85, 1.1);
    this.jitter       = randomFloat(0.0, 0.015);
    this.reactionTime = 0;
    this.itemTimer    = randomFloat(1, 4); // delay before using held item
  }

  /**
   * Update AI steering toward next waypoint.
   * @param {number} deltaTime
   * @param {Array}  allKarts   All karts in the race (for obstacle avoidance)
   * @param {ItemManager} itemManager
   */
  update(deltaTime, allKarts, itemManager) {
    const kart = this.kart;
    if (kart.finished) return;

    // ── Find next waypoint ────────────────────────────────────────────────────
    const target   = this.waypoints[this.targetIdx];
    const dx       = target.x - kart.position.x;
    const dz       = target.z - kart.position.z;
    const distToWp = Math.sqrt(dx * dx + dz * dz);

    // Advance to next waypoint when close enough
    if (distToWp < 8) {
      this.targetIdx = (this.targetIdx + 1) % this.waypoints.length;
    }

    // ── Steering ──────────────────────────────────────────────────────────────
    const desiredAngle = Math.atan2(dx, dz);
    let angleDiff = normalizeAngle(desiredAngle - kart.angle);

    // Jitter for imperfect driving
    angleDiff += (Math.random() - 0.5) * this.jitter * 2;

    const steerAmount = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff) * 0.5, kart.turnSpeed);
    kart.angle += steerAmount;

    // ── Speed ─────────────────────────────────────────────────────────────────
    const targetSpeed = kart.maxSpeed * this.speedFactor * (1 + kart.coins * 0.01);
    const boost = kart.boostTimer > 0 ? 1.5 : 1;
    const slow  = kart.slowTimer  > 0 ? 0.45 : 1;

    const effectiveTop = targetSpeed * boost * slow;

    if (kart.speed < effectiveTop) {
      kart.speed = Math.min(kart.speed + kart.acceleration, effectiveTop);
    } else {
      kart.speed = Math.max(effectiveTop, kart.speed - kart.deceleration);
    }

    // ── Obstacle avoidance ────────────────────────────────────────────────────
    for (const other of allKarts) {
      if (other === kart) continue;
      const odx = other.position.x - kart.position.x;
      const odz = other.position.z - kart.position.z;
      const od  = Math.sqrt(odx * odx + odz * odz);
      if (od < 5 && od > 0.1) {
        // Steer away gently
        const avoidAngle = Math.atan2(odx, odz);
        const avoidDiff  = normalizeAngle(avoidAngle - kart.angle);
        kart.angle -= Math.sign(avoidDiff) * 0.012;
      }
    }

    // ── Use held item ─────────────────────────────────────────────────────────
    if (kart.heldItem) {
      this.itemTimer -= deltaTime;
      if (this.itemTimer <= 0) {
        this._useItem(allKarts, itemManager);
        this.itemTimer = randomFloat(2, 5);
      }
    }
  }

  _useItem(allKarts, itemManager) {
    const kart = this.kart;
    const item = kart.heldItem;
    kart.heldItem = null;

    switch (item) {
      case 'mushroom':
        kart.applyItem('mushroom');
        break;

      case 'shield':
        kart.applyItem('shield');
        break;

      case 'shell': {
        if (!itemManager) break;
        const dirVec = new THREE.Vector3(
          Math.sin(kart.angle), 0, Math.cos(kart.angle)
        ).normalize();
        itemManager.createProjectile(kart.position.clone(), dirVec, kart);
        break;
      }

      case 'banana':
        if (itemManager) {
          itemManager.createBanana(kart.position.clone());
        }
        break;

      case 'lightning':
        if (itemManager) {
          itemManager.applyLightning(allKarts, kart);
        }
        break;
    }
  }
}
