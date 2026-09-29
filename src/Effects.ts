import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

/** 着弾時の小さな水しぶき */
export class Effects {
  readonly group = new THREE.Group();
  private particles: Particle[] = [];
  private geo = new THREE.SphereGeometry(1, 8, 6);
  private mat = new THREE.MeshPhysicalMaterial({
    color: 0xd6f1ff,
    roughness: 0.05,
    transmission: 0.6,
    transparent: true,
    opacity: 0.85,
  });

  splash(point: THREE.Vector3, normal: THREE.Vector3, scale = 1, count = 14) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.scale.setScalar((0.004 + Math.random() * 0.006) * scale);
      mesh.position.copy(point);
      const dir = new THREE.Vector3().randomDirection();
      if (dir.dot(normal) < 0) dir.reflect(normal);
      dir.addScaledVector(normal, 0.8).normalize();
      const vel = dir.multiplyScalar((0.3 + Math.random() * 0.5) * scale);
      this.group.add(mesh);
      this.particles.push({ mesh, vel, life: 0.6 + Math.random() * 0.4 });
    }
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= 3 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.particles) this.group.remove(p.mesh);
    this.particles.length = 0;
  }
}
