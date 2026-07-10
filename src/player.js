import * as THREE from 'three';

/**
 * PlayerController — 第一人称玩家控制器。
 * 处理 WASD 移动、空格跳跃、Shift 静步、重力与碰撞。
 * 相机跟随在玩家眼睛高度。
 */
export class PlayerController {
  /**
   * @param {THREE.Camera} camera
   * @param {object}       physics — PhysicsSystem 实例 (须有 checkCollision 方法)
   */
  constructor(camera, physics) {
    this._camera = camera;
    this._physics = physics;

    /** 玩家位置 (脚底) */
    this.position = new THREE.Vector3(0, 0, 5);

    /** 速度向量 */
    this.velocity = new THREE.Vector3(0, 0, 0);

    /** 玩家碰撞尺寸 (宽, 高, 深) */
    this.size = new THREE.Vector3(0.6, 1.8, 0.6);

    /** 眼睛高度 (从脚底算) */
    this.eyeHeight = 1.6;

    /** 生命值与护甲 */
    this.health = 100;
    this.armor = 0;

    // 移动参数
    this.runSpeed = 5;       // m/s
    this.walkSpeed = 2;      // m/s (Shift)
    this.jumpSpeed = 8;      // m/s 初始跳跃速度
    this.gravity = -20;      // m/s²

    // 状态
    this._onGround = false;

    // 临时向量 (避免每帧创建)
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._moveDir = new THREE.Vector3();
    this._proposedPos = new THREE.Vector3();
    this._centerPos = new THREE.Vector3();
  }

  /**
   * 每帧更新。
   * @param {number} dt    — delta time (秒)
   * @param {object} input — InputManager 实例
   */
  update(dt, input) {
    // ── 1. 获取相机方向 (仅水平分量) ──────────────
    this._camera.getWorldDirection(this._forward);
    this._forward.y = 0;
    this._forward.normalize();

    this._right.crossVectors(this._forward, this._camera.up).normalize();

    // ── 2. 读取输入，计算水平移动方向 ────────────
    this._moveDir.set(0, 0, 0);
    if (input.isKeyDown('w')) this._moveDir.add(this._forward);
    if (input.isKeyDown('s')) this._moveDir.sub(this._forward);
    if (input.isKeyDown('a')) this._moveDir.sub(this._right);
    if (input.isKeyDown('d')) this._moveDir.add(this._right);

    // 归一化 (防止对角线移动更快)
    if (this._moveDir.lengthSq() > 0) {
      this._moveDir.normalize();
    }

    // 速度
    const speed = input.isKeyDown('shift') ? this.walkSpeed : this.runSpeed;

    // ── 3. 重力 ──────────────────────────────────
    this.velocity.y += this.gravity * dt;

    // ── 4. 跳跃 ──────────────────────────────────
    if (input.isKeyDown('space') && this._onGround) {
      this.velocity.y = this.jumpSpeed;
      this._onGround = false;
    }

    // ── 5. 计算提议新位置 ────────────────────────
    const hSpeed = speed * dt;
    this._proposedPos.copy(this.position);
    this._proposedPos.x += this._moveDir.x * hSpeed;
    this._proposedPos.z += this._moveDir.z * hSpeed;
    this._proposedPos.y += this.velocity.y * dt;

    // ── 6. 地面碰撞 ──────────────────────────────
    if (this._proposedPos.y < 0) {
      this._proposedPos.y = 0;
      this.velocity.y = 0;
      this._onGround = true;
    }

    // ── 7. 墙壁碰撞 ──────────────────────────────
    // 将脚底位置转换为 AABB 中心位置
    this._centerPos.set(
      this._proposedPos.x,
      this._proposedPos.y + this.size.y / 2,
      this._proposedPos.z
    );

    const result = this._physics.checkCollision(this._centerPos, this.size);
    if (result.collided) {
      // 从 AABB 中心还原为脚底位置
      this.position.x = result.position.x;
      this.position.y = result.position.y - this.size.y / 2;
      this.position.z = result.position.z;
      // 碰撞后重置水平速度
      this.velocity.x = 0;
      this.velocity.z = 0;

      // 再次检查地面
      if (this.position.y <= 0) {
        this.position.y = 0;
        this.velocity.y = 0;
        this._onGround = true;
      }
    } else {
      this.position.copy(this._proposedPos);
    }

    // ── 8. 更新相机位置 ──────────────────────────
    this._camera.position.set(
      this.position.x,
      this.position.y + this.eyeHeight,
      this.position.z
    );
  }

  /**
   * 受到伤害。
   * @param {number} amount — 伤害值
   */
  takeDamage(amount) {
    // 护甲吸收部分伤害
    if (this.armor > 0) {
      const armorAbsorb = Math.min(this.armor, amount * 0.5);
      this.armor -= armorAbsorb;
      amount -= armorAbsorb;
    }
    this.health = Math.max(0, this.health - amount);
  }

  /**
   * 获取玩家脚底位置。
   * @returns {THREE.Vector3}
   */
  getPosition() {
    return this.position.clone();
  }

  /**
   * 获取玩家面朝方向 (水平)。
   * @returns {THREE.Vector3}
   */
  getForward() {
    const dir = new THREE.Vector3();
    this._camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    return dir;
  }
}
