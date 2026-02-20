import * as THREE from 'three';
import { randomFloat } from './utils.js';

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = []; // active particle groups
  }

  /**
   * Emit a burst of particles.
   * @param {'coin_collect'|'speed_boost'|'hit'|'finish'} type
   * @param {THREE.Vector3} position
   * @param {number} count
   */
  emit(type, position, count = 12) {
    switch (type) {
      case 'coin_collect': this._emitCoinCollect(position, count); break;
      case 'speed_boost':  this._emitSpeedBoost(position, count);  break;
      case 'hit':          this._emitHit(position, count);         break;
      case 'finish':       this._emitFinish(position, count);      break;
    }
  }

  /** Call every frame with deltaTime in seconds. */
  update(deltaTime) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= deltaTime;

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        if (p.mesh.geometry) p.mesh.geometry.dispose();
        this.particles.splice(i, 1);
        continue;
      }

      const frac = p.life / p.maxLife;
      p.mesh.position.addScaledVector(p.velocity, deltaTime);
      p.velocity.y -= p.gravity * deltaTime;
      p.mesh.scale.setScalar(frac * p.startScale);

      if (p.mesh.material) {
        p.mesh.material.opacity = frac;
      }

      if (p.spin) {
        p.mesh.rotation.x += p.spin * deltaTime;
        p.mesh.rotation.z += p.spin * deltaTime * 0.7;
      }
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  _spawn(geo, color, position, velocity, life, startScale = 1, gravity = 4, spin = 0) {
    const mat  = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.particles.push({ mesh, velocity, life, maxLife: life, startScale, gravity, spin });
  }

  _emitCoinCollect(position, count) {
    const colors = [0xffd700, 0xffee44, 0xffcc00];
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.12, 5, 4);
      const vel = new THREE.Vector3(
        randomFloat(-3, 3),
        randomFloat(3, 7),
        randomFloat(-3, 3)
      );
      const color = colors[i % colors.length];
      this._spawn(geo, color, position.clone(), vel, randomFloat(0.5, 1.0), 1.4, 6, 3);
    }
  }

  _emitSpeedBoost(position, count) {
    const colors = [0xff8800, 0xffdd00, 0xff4400];
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.18, 5, 4);
      const angle = randomFloat(0, Math.PI * 2);
      const vel = new THREE.Vector3(
        Math.cos(angle) * randomFloat(1, 3),
        randomFloat(1, 4),
        Math.sin(angle) * randomFloat(1, 3)
      );
      this._spawn(geo, colors[i % colors.length], position.clone(), vel, randomFloat(0.3, 0.7), 1.6, 3, 2);
    }
  }

  _emitHit(position, count) {
    const colors = [0xff2200, 0xff8800, 0xffcc00];
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.2, 5, 4);
      const vel = new THREE.Vector3(
        randomFloat(-6, 6),
        randomFloat(2, 8),
        randomFloat(-6, 6)
      );
      this._spawn(geo, colors[i % colors.length], position.clone(), vel, randomFloat(0.4, 0.9), 1.8, 8, 5);
    }
  }

  _emitFinish(position, count) {
    const colors = [0xff0000, 0xff8800, 0xffff00, 0x00ff00, 0x0088ff, 0xaa00ff, 0xff0088];
    for (let i = 0; i < count * 3; i++) {
      const geo = new THREE.BoxGeometry(0.2, 0.2, 0.05);
      const vel = new THREE.Vector3(
        randomFloat(-8, 8),
        randomFloat(5, 15),
        randomFloat(-8, 8)
      );
      this._spawn(geo, colors[i % colors.length], position.clone(), vel, randomFloat(1.5, 3.0), 1.5, 5, 8);
    }
  }
}
