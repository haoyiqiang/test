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
   * @param {object}              opts.input    — InputManager
   * @param {object}              opts.player   — PlayerController
   * @param {object}              opts.physics  — PhysicsSystem
   */
  start({ renderer, scene, camera, input, player, physics }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.input = input;
    this.player = player;
    this.physics = physics;

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
    // 1. 输入更新 (重置鼠标 delta)
    this.input.update(dt);

    // 2. 玩家更新 (移动、跳跃、重力、碰撞)
    this.player.update(dt, this.input);

    // 3. 物理更新 (预留)
    this._physicsUpdate(dt);

    // 4. 渲染
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 物理系统帧更新 (预留扩展点)。
   * @param {number} dt
   */
  _physicsUpdate(dt) {
    // 当前物理系统为纯查询式 (无每帧状态)，保留此方法供后续扩展。
    void dt;
  }
}
