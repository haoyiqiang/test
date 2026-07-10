import * as THREE from 'three';

/**
 * PhysicsSystem — 简易物理系统
 * 提供 AABB 碰撞检测、射线检测、世界碰撞体管理。
 */
export class PhysicsSystem {
  constructor() {
    /** @type {Array<{position: THREE.Vector3, size: THREE.Vector3}>} */
    this._colliders = [];
  }

  /**
   * 注册碰撞体
   * @param {{position: THREE.Vector3, size: THREE.Vector3}} object
   */
  addCollider(object) {
    this._colliders.push(object);
  }

  /**
   * 移除碰撞体
   * @param {{position: THREE.Vector3, size: THREE.Vector3}} object
   */
  removeCollider(object) {
    const idx = this._colliders.indexOf(object);
    if (idx !== -1) this._colliders.splice(idx, 1);
  }

  /**
   * AABB 碰撞检测与修正。
   * 检查给定位置和大小的 AABB 是否与已注册碰撞体重叠，
   * 若有重叠则在重叠最小的轴上推出。
   *
   * @param {THREE.Vector3} position — 提议的位置
   * @param {THREE.Vector3} size     — 碰撞体尺寸 (width, height, depth)
   * @param {Array<{position: THREE.Vector3, size: THREE.Vector3}>} [worldObjects]
   * @returns {{position: THREE.Vector3, collided: boolean}}
   */
  checkCollision(position, size, worldObjects) {
    const targets = worldObjects || this._colliders;
    const half = new THREE.Vector3(size.x / 2, size.y / 2, size.z / 2);
    const resolved = position.clone();
    let collided = false;

    for (const obj of targets) {
      const objHalf = new THREE.Vector3(obj.size.x / 2, obj.size.y / 2, obj.size.z / 2);

      // 计算各轴重叠量
      const overlapX =
        half.x + objHalf.x - Math.abs(resolved.x - obj.position.x);
      const overlapY =
        half.y + objHalf.y - Math.abs(resolved.y - obj.position.y);
      const overlapZ =
        half.z + objHalf.z - Math.abs(resolved.z - obj.position.z);

      if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) continue;

      collided = true;

      // 在重叠最小的轴上推出
      const minOverlap = Math.min(overlapX, overlapY, overlapZ);

      if (minOverlap === overlapX) {
        const dir = resolved.x > obj.position.x ? 1 : -1;
        resolved.x = obj.position.x + dir * (half.x + objHalf.x);
      } else if (minOverlap === overlapY) {
        const dir = resolved.y > obj.position.y ? 1 : -1;
        resolved.y = obj.position.y + dir * (half.y + objHalf.y);
      } else {
        const dir = resolved.z > obj.position.z ? 1 : -1;
        resolved.z = obj.position.z + dir * (half.z + objHalf.z);
      }
    }

    return { position: resolved, collided };
  }

  /**
   * 射线检测 — 对已注册碰撞体做 AABB 射线相交测试。
   *
   * @param {THREE.Vector3} origin      射线起点
   * @param {THREE.Vector3} direction   射线方向 (归一化)
   * @param {number}        maxDistance 最大检测距离
   * @param {Array<{position: THREE.Vector3, size: THREE.Vector3}>} [worldObjects]
   * @returns {{point: THREE.Vector3, distance: number, object: object}|null}
   */
  raycast(origin, direction, maxDistance, worldObjects) {
    const targets = worldObjects || this._colliders;
    let closestHit = null;
    let closestDist = maxDistance;

    for (const obj of targets) {
      const half = new THREE.Vector3(obj.size.x / 2, obj.size.y / 2, obj.size.z / 2);
      const min = new THREE.Vector3().subVectors(obj.position, half);
      const max = new THREE.Vector3().addVectors(obj.position, half);

      // Slab method for AABB ray intersection
      let tMin = -Infinity;
      let tMax = Infinity;

      const invDir = new THREE.Vector3(
        1 / (direction.x || 1e-12),
        1 / (direction.y || 1e-12),
        1 / (direction.z || 1e-12)
      );

      const t1 = (min.x - origin.x) * invDir.x;
      const t2 = (max.x - origin.x) * invDir.x;
      tMin = Math.max(tMin, Math.min(t1, t2));
      tMax = Math.min(tMax, Math.max(t1, t2));

      const t1y = (min.y - origin.y) * invDir.y;
      const t2y = (max.y - origin.y) * invDir.y;
      tMin = Math.max(tMin, Math.min(t1y, t2y));
      tMax = Math.min(tMax, Math.max(t1y, t2y));

      const t1z = (min.z - origin.z) * invDir.z;
      const t2z = (max.z - origin.z) * invDir.z;
      tMin = Math.max(tMin, Math.min(t1z, t2z));
      tMax = Math.min(tMax, Math.max(t1z, t2z));

      if (tMax < 0 || tMin > tMax) continue; // no hit

      const t = tMin >= 0 ? tMin : tMax;
      if (t < closestDist) {
        closestDist = t;
        const point = new THREE.Vector3().copy(direction).multiplyScalar(t).add(origin);
        closestHit = { point, distance: t, object: obj };
      }
    }

    return closestHit;
  }
}
