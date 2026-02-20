import * as THREE from 'three';
import { randomFloat } from './utils.js';

export const ITEM_TYPES = ['mushroom', 'shell', 'shield', 'banana', 'lightning'];

export class ItemManager {
  constructor(scene, track) {
    this.scene  = scene;
    this.track  = track;
    this.projectiles = []; // {mesh, velocity, life, owner}
    this.bananas     = []; // {mesh, life, position}
  }

  /** Return a random item type string. */
  getRandomItem() {
    return ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
  }

  /**
   * Fire a shell projectile.
   * @param {THREE.Vector3} position
   * @param {THREE.Vector3} direction  (unit vector)
   * @param {object} ownerKart
   */
  createProjectile(position, direction, ownerKart) {
    const geo  = new THREE.SphereGeometry(0.45, 8, 6);
    const mat  = new THREE.MeshLambertMaterial({ color: 0x22ddaa, emissive: 0x115544 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.position.y += 0.6;
    this.scene.add(mesh);

    const velocity = direction.clone().multiplyScalar(50);
    this.projectiles.push({ mesh, velocity, life: 4, travelDist: 0, owner: ownerKart });
  }

  /**
   * Drop a banana peel behind a kart.
   * @param {THREE.Vector3} position
   */
  createBanana(position) {
    const group = new THREE.Group();

    // Body – yellow elongated ellipsoid
    const bodyGeo = new THREE.SphereGeometry(0.3, 8, 6);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffee00 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(0.6, 0.4, 1.3);
    group.add(body);

    // Tip
    const tipGeo = new THREE.ConeGeometry(0.1, 0.25, 6);
    const tipMat = new THREE.MeshLambertMaterial({ color: 0xcc8800 });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.set(0, 0, 0.45);
    tip.rotation.x = Math.PI / 2;
    group.add(tip);

    group.position.copy(position);
    group.position.y = 0.3;
    group.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(group);
    this.bananas.push({ mesh: group, life: 30 });
  }

  /**
   * Apply lightning to all karts except source.
   * @param {Array} karts
   * @param {object} sourceKart
   */
  applyLightning(karts, sourceKart) {
    karts.forEach(k => {
      if (k !== sourceKart) {
        k.applyItem('lightning_hit');
      }
    });
  }

  /**
   * Update projectiles and bananas; check collisions with karts.
   * @param {number} deltaTime
   * @param {Array}  karts
   * @param {ParticleSystem} particles
   */
  update(deltaTime, karts, particles) {
    // ── Projectiles ─────────────────────────────────────────────────────────
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.life -= deltaTime;

      const step = proj.velocity.clone().multiplyScalar(deltaTime);
      proj.mesh.position.add(step);
      proj.travelDist += step.length();

      // Expire
      if (proj.life <= 0 || proj.travelDist > 200) {
        this.scene.remove(proj.mesh);
        proj.mesh.geometry.dispose();
        this.projectiles.splice(i, 1);
        continue;
      }

      // Collision with karts
      let hit = false;
      for (const kart of karts) {
        if (kart === proj.owner) continue;
        if (kart.spinTimer > 0) continue; // already spinning
        const dx = proj.mesh.position.x - kart.position.x;
        const dz = proj.mesh.position.z - kart.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 2.5) {
          // Check shield
          if (kart.shielded) {
            kart.shielded = false;
            kart._removeShieldMesh();
          } else {
            kart.spinOut();
            if (particles) particles.emit('hit', kart.position.clone(), 14);
          }
          hit = true;
          break;
        }
      }
      if (hit) {
        this.scene.remove(proj.mesh);
        proj.mesh.geometry.dispose();
        this.projectiles.splice(i, 1);
      }
    }

    // ── Bananas ─────────────────────────────────────────────────────────────
    for (let i = this.bananas.length - 1; i >= 0; i--) {
      const ban = this.bananas[i];
      ban.life -= deltaTime;

      if (ban.life <= 0) {
        this.scene.remove(ban.mesh);
        this.bananas.splice(i, 1);
        continue;
      }

      // Gentle bob
      ban.mesh.rotation.y += deltaTime * 1.5;

      for (const kart of karts) {
        if (kart.spinTimer > 0) continue;
        const dx = ban.mesh.position.x - kart.position.x;
        const dz = ban.mesh.position.z - kart.position.z;
        if (Math.sqrt(dx * dx + dz * dz) < 1.8) {
          if (kart.shielded) {
            kart.shielded = false;
            kart._removeShieldMesh();
          } else {
            kart.spinOut();
            if (particles) particles.emit('hit', kart.position.clone(), 10);
          }
          this.scene.remove(ban.mesh);
          this.bananas.splice(i, 1);
          break;
        }
      }
    }
  }
}
