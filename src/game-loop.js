import * as THREE from 'three';

/**
 * GameLoop — 游戏主循环 (单例模式)。
 * 基于 requestAnimationFrame，维护 delta time 和 FPS 计数器。
 */
export class GameLoop {
  /** @returns {GameLoop} */
  static get instance() {
    if (!GameLoop._instance) {
      GameLoop._instance = new GameLoop();
    }
    return GameLoop._instance;
  }

  constructor() {
    if (GameLoop._instance) {
      throw new Error('GameLoop is a singleton — use GameLoop.instance');
    }
    GameLoop._instance = this;

    /** @type {THREE.WebGLRenderer|null} */
    this.renderer = null;
    /** @type {THREE.Scene|null} */
    this.scene = null;
    /** @type {THREE.Camera|null} */
    this.camera = null;

    /** @type {object|null} */
    this.input = null;
    /** @type {object|null} */
    this.player = null;
    /** @type {object|null} */
    this.physics = null;
    /** @type {object|null} */
    this.weaponSystem = null;

    this._running = false;
    this._rafId = null;
    this._lastTime = 0;
    this._maxDelta = 0.05; // 最大步长 cap (防止掉帧时物理爆走)

    // FPS 计数
    this.fps = 0;
    this._frameCount = 0;
    this._fpsTime = 0;
  }

  /**
   * 启动游戏循环。
   * @param {object} opts
   * @param {THREE.WebGLRenderer} opts.renderer
   * @param {THREE.Scene}         opts.scene
   * @param {THREE.Camera}        opts.camera
   * @param {object}              opts.input       — InputManager
   * @param {object}              opts.player      — PlayerController
   * @param {object}              opts.physics     — PhysicsSystem
   * @param {object}              [opts.weaponSystem] — WeaponSystem (武器系统)
   */
  start({ renderer, scene, camera, input, player, physics, weaponSystem }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.input = input;
    this.player = player;
    this.physics = physics;
    this.weaponSystem = weaponSystem || null;

    this._running = true;
    this._lastTime = performance.now();
    this._fpsTime = this._lastTime;
    this._frameCount = 0;

    this._tick = this._tick.bind(this);
    this._rafId = requestAnimationFrame(this._tick);
  }

  /** 停止游戏循环 */
  stop() {
    this._running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  // ── 内部实现 ──────────────────────────────────────────

  _tick(now) {
    if (!this._running) return;

    this._rafId = requestAnimationFrame(this._tick);

    // 计算 delta time (秒)
    let dt = (now - this._lastTime) / 1000;
    this._lastTime = now;

    // Cap delta 防止掉帧导致物理爆走
    if (dt > this._maxDelta) dt = this._maxDelta;
    if (dt <= 0) dt = 0.001; // 避免除以零

    // ── FPS ──────────────────────────────────────────
    this._frameCount++;
    if (now - this._fpsTime >= 1000) {
      this.fps = this._frameCount;
      this._frameCount = 0;
      this._fpsTime = now;
    }

    // ── 帧逻辑 ──────────────────────────────────────
    // 相机此时处于"真实"瞄准位置 (上一帧结束时已移除后坐力偏移)
    // 前后帧之间的鼠标事件已直接累积到 camera.rotation

    // 1. 输入更新 (重置鼠标 delta 累积)
    this.input.update(dt);

    // 2. 玩家更新 (移动、跳跃、重力、碰撞) — 先更新位置
    this.player.update(dt, this.input);
    // 3. 武器系统更新 (射击、换弹、切换、后坐力恢复)
    if (this.weaponSystem) {
      this.weaponSystem.update(dt, this.input, this.player);
    }

    // 4. 物理更新 (预留)
    this._physicsUpdate(dt);

    // 5. 应用后坐力偏移到相机 (用于渲染)
    if (this.weaponSystem) {
      const recoil = this.weaponSystem.getRecoilOffsetRad();
      // punchAngle.y (垂直上跳) → camera.rotation.x 减小 (相机上仰)
      // punchAngle.x (水平) → camera.rotation.y 增减
      this.camera.rotation.x -= recoil.y;
      this.camera.rotation.y += recoil.x;
    }

    // 6. 渲染
    this.renderer.render(this.scene, this.camera);

    // 7. 移除后坐力偏移 (恢复真实瞄准位置，供帧间鼠标事件使用)
    if (this.weaponSystem) {
      const recoil = this.weaponSystem.getRecoilOffsetRad();
      this.camera.rotation.x += recoil.y;
      this.camera.rotation.y -= recoil.x;
    }

    // 8. 更新 HUD
    this._updateHUD();
  }

  /**
   * 物理系统帧更新 (预留扩展点)。
   * @param {number} dt
   */
  _physicsUpdate(dt) {
    void dt;
  }

  /**
   * 更新 HUD 显示 (弹药、武器、金钱等)。
   */
  _updateHUD() {
    if (!this.weaponSystem) return;

    const state = this.weaponSystem.getCurrentWeaponState();
    if (!state) return;

    // 弹药显示
    const ammoDisplay = document.getElementById('ammo-display');
    if (ammoDisplay) {
      ammoDisplay.textContent = `${state.currentAmmo} / ${state.reserveAmmo}`;
    }

    // 武器名称显示
    const weaponName = document.getElementById('weapon-name');
    if (weaponName) {
      weaponName.textContent = state.name;
    }

    // 金钱显示
    const moneyDisplay = document.getElementById('money-display');
    if (moneyDisplay) {
      moneyDisplay.textContent = `$${state.money}`;
    }

    // 换弹进度条
    const reloadBar = document.getElementById('reload-bar');
    if (reloadBar) {
      if (state.isReloading) {
        reloadBar.style.display = 'block';
        // 根据当前武器换弹时间动态设置动画时长
        const weapon = this.weaponSystem.currentWeapon;
        if (weapon) {
          reloadBar.style.animationDuration = `${weapon.reloadTime}ms`;
        }
      } else {
        reloadBar.style.display = 'none';
      }
    }

    // 武器槽位显示
    const slots = this.weaponSystem.getWeaponSlotsInfo();
    for (let i = 0; i < slots.length; i++) {
      const slotEl = document.getElementById(`weapon-slot-${i + 1}`);
      if (slotEl) {
        if (slots[i].isEmpty) {
          slotEl.textContent = '';
          slotEl.classList.remove('active', 'filled');
        } else {
          slotEl.textContent = slots[i].name;
          slotEl.classList.add('filled');
          if (slots[i].isActive) {
            slotEl.classList.add('active');
          } else {
            slotEl.classList.remove('active');
          }
        }
      }
    }
  }
}
