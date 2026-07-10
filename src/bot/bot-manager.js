import * as THREE from 'three';
import { BotAI } from 'csgo/bot/bot-ai.js';
import { BotNavigation } from 'csgo/bot/bot-navigation.js';

// ── 常量 ──────────────────────────────────────────────────

/** Bot 碰撞体尺寸 (与玩家相同) */
const BOT_SIZE = new THREE.Vector3(0.6, 1.8, 0.6);

/** 最大射击距离 */
const MAX_SHOOT_DISTANCE = 200;

/** Bot 武器基础伤害 (AK-47 级别) */
const BOT_WEAPON_DAMAGE = 36;

/** Bot 武器基础散布 (弧度) */
const BOT_WEAPON_SPREAD = 0.03;

/** Bot 武器射击间隔 (秒) */
const BOT_WEAPON_FIRE_RATE = 0.1;

// ── 材质缓存 ──────────────────────────────────────────────

/** @type {Map<string, THREE.MeshStandardMaterial>} */
const _materialCache = new Map();

function _getMaterial(color) {
  if (!_materialCache.has(color)) {
    _materialCache.set(color, new THREE.MeshStandardMaterial({
      color: parseInt(color, 16),
      roughness: 0.7,
      metalness: 0.1,
    }));
  }
  return _materialCache.get(color);
}

// ── BotManager 类 ────────────────────────────────────────

/**
 * BotManager — Bot 生命周期管理器
 *
 * 负责创建、更新、重生所有 Bot 实例。
 * 内部持有共享的 BotNavigation 实例。
 *
 * 用法:
 *   const botMgr = new BotManager(scene);
 *   botMgr.spawnBots(5, 'medium', ctSpawns);
 *   // 在游戏循环中:
 *   botMgr.update(dt, player, physics, navmesh);
 */
export class BotManager {
  /**
   * @param {THREE.Scene} scene — Three.js 场景
   */
  constructor(scene) {
    /** @type {THREE.Scene} */
    this._scene = scene;

    /** @type {Array<object>} Bot 实例数组 */
    this.bots = [];

    /**
     * 共享的导航实例。
     * navmesh 在首次 update 时注入。
     * @type {BotNavigation}
     */
    this._navigation = new BotNavigation(null);

    /** 上次注入的 navmesh 引用 (用于检测变更) */
    this._lastNavmesh = null;

    // ── 临时向量 ────────────────────────────────────
    this._tmpVec3 = new THREE.Vector3();
    this._tmpDir = new THREE.Vector3();
    this._tmpRight = new THREE.Vector3();
    this._tmpUp = new THREE.Vector3();
    this._tmpSpreadDir = new THREE.Vector3();
  }

  /**
   * 批量创建 Bot。
   *
   * @param {number} count      — 数量
   * @param {string} difficulty — 难度: 'easy' | 'medium' | 'hard'
   * @param {Array<{x:number, y:number, z:number}>} spawnPoints — 出生点列表
   */
  spawnBots(count, difficulty = 'medium', spawnPoints = []) {
    for (let i = 0; i < count; i++) {
      const spawnPoint = spawnPoints.length > 0
        ? spawnPoints[i % spawnPoints.length]
        : { x: (Math.random() - 0.5) * 20, y: 0, z: (Math.random() - 0.5) * 20 };

      this._createBot(difficulty, spawnPoint);
    }
  }

  /**
   * 每帧更新所有 Bot。
   *
   * @param {number} dt      — delta time (秒)
   * @param {object} player  — PlayerController 实例
   * @param {object} physics — PhysicsSystem 实例
   * @param {object} navmesh — NavMesh 实例
   */
  update(dt, player, physics, navmesh) {
    // 注入 navmesh (首次或变更时)
    if (navmesh && navmesh !== this._lastNavmesh) {
      this._navigation.setNavmesh(navmesh);
      this._lastNavmesh = navmesh;
    }

    for (const bot of this.bots) {
      if (bot.needsRespawn) continue;

      // ── 1. AI 决策 ─────────────────────────────
      const action = bot.ai.update(dt, bot, player, physics, navmesh);

      // ── 2. 路径规划 ────────────────────────────
      // 如果 AI 设定了导航目标，进行寻路
      if (bot.navTarget) {
        this._navigation.moveTo(bot, bot.navTarget);
        bot.navTarget = null;
      }

      // ── 3. 路径跟随 ────────────────────────────
      this._navigation.followPath(bot, dt);

      // ── 4. 执行射击 ────────────────────────────
      if (action.action === 'shoot') {
        this._botShoot(bot, action, player, physics);
      }

      // ── 5. 死亡视觉效果 ────────────────────────
      if (action.action === 'die' && bot.mesh.visible) {
        bot.mesh.visible = false;
      }

      // ── 6. 更新 mesh 变换 ──────────────────────
      this._updateMeshTransform(bot);
    }
  }

  /**
   * 获取存活的 Bot 列表。
   * @returns {Array<object>}
   */
  getAliveBots() {
    return this.bots.filter(b => b.health > 0);
  }

  /**
   * 重生指定 Bot。
   *
   * @param {object} bot  — Bot 对象
   * @param {{x:number, y:number, z:number}} [spawnPoint] — 重生点
   */
  respawnBot(bot, spawnPoint) {
    const spawn = spawnPoint || { x: 0, y: 0, z: 0 };

    bot.position.set(spawn.x, spawn.y, spawn.z);
    bot.health = bot.maxHealth;
    bot.state = 'patrol';
    bot.yaw = Math.random() * Math.PI * 2;
    bot.needsRespawn = false;
    bot._deathTimerInitialized = false;
    bot.deathTimer = 0;
    bot.currentPath = [];
    bot.currentWaypointIdx = 0;
    bot.heardSoundPosition = null;
    bot.navTarget = null;

    bot.ai.reset();

    bot.mesh.visible = true;
    bot.mesh.position.set(
      spawn.x,
      spawn.y + BOT_SIZE.y / 2,
      spawn.z
    );
    bot.mesh.rotation.set(0, bot.yaw, 0);
  }

  /**
   * 清理所有 Bot。
   */
  dispose() {
    for (const bot of this.bots) {
      if (bot.mesh) {
        this._scene.remove(bot.mesh);
        if (bot.mesh.geometry) bot.mesh.geometry.dispose();
      }
    }
    this.bots = [];
  }

  // ── 私有方法 ──────────────────────────────────────────

  /**
   * 创建单个 Bot。
   * @param {string} difficulty
   * @param {{x:number, y:number, z:number}} spawnPoint
   */
  _createBot(difficulty, spawnPoint) {
    const ai = new BotAI(difficulty);

    // 视觉: 胶囊体
    const geometry = new THREE.CapsuleGeometry(0.3, 1.2, 4, 8);

    const colorMap = {
      easy: '44aa44',
      medium: 'ddaa00',
      hard: 'cc3333',
    };
    const color = colorMap[difficulty] || 'ddaa00';
    const material = _getMaterial(color);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(
      spawnPoint.x,
      spawnPoint.y + BOT_SIZE.y / 2,
      spawnPoint.z
    );

    this._scene.add(mesh);

    /** @type {object} */
    const bot = {
      // 视觉
      mesh,
      /** 脚底位置 */
      position: new THREE.Vector3(spawnPoint.x, spawnPoint.y, spawnPoint.z),
      /** 碰撞体尺寸 */
      size: BOT_SIZE.clone(),

      // 属性
      health: ai.difficulty.maxHealth,
      maxHealth: ai.difficulty.maxHealth,
      state: 'patrol',
      yaw: Math.random() * Math.PI * 2,
      speed: ai.difficulty.moveSpeed,

      // AI
      ai,

      // 导航目标 (AI 设定，Manager 消费后清除)
      /** @type {{x:number, y:number, z:number}|null} */
      navTarget: null,

      // 路径 (由 BotNavigation 管理)
      currentPath: [],
      currentWaypointIdx: 0,

      // 死亡
      deathTimer: 0,
      _deathTimerInitialized: false,
      needsRespawn: false,

      // 听觉
      /** @type {{x:number, y:number, z:number}|null} */
      heardSoundPosition: null,

      // 射击
      _lastShotTime: 0,

      // 难度
      difficulty: ai.getDifficultyName(),
    };

    this.bots.push(bot);
  }

  /**
   * Bot 射击逻辑。
   * @param {object} bot
   * @param {object} action
   * @param {object} player
   * @param {object} physics
   */
  _botShoot(bot, action, player, physics) {
    const now = performance.now() / 1000;
    if (now - bot._lastShotTime < BOT_WEAPON_FIRE_RATE) return;
    bot._lastShotTime = now;

    if (!player || player.health <= 0) return;
    const eyePos = this._getBotEyePosition(bot);
    const forward = this._getBotForward(bot);
    const spreadMultiplier = action.spreadMultiplier || 0.3;
    const spreadDir = this._applySpread(forward, spreadMultiplier);
    // 玩家胸部中心
    const playerCenter = new THREE.Vector3(
      player.position.x,
      player.position.y + 0.9,
      player.position.z
    );

    // Bot 到玩家的向量
    const toPlayer = new THREE.Vector3().subVectors(playerCenter, eyePos);
    const playerDist = toPlayer.length();

    if (playerDist > MAX_SHOOT_DISTANCE || playerDist < 0.1) return;

    // 射线方向与玩家方向的点积 (玩家是否在射线前方)
    const projection = spreadDir.dot(toPlayer);
    if (projection <= 0) return;

    // 玩家到射线的垂直距离
    const closestPoint = eyePos.clone().addScaledVector(spreadDir, projection);
    const perpDist = closestPoint.distanceTo(playerCenter);

    // 命中判定: 玩家身体半径 (~0.5m) + 容差
    if (perpDist > 1.0) return;

    // 视线遮挡检测
    const losDir = toPlayer.clone().normalize();
    const losHit = physics.raycast(eyePos, losDir, playerDist);
    if (losHit && losHit.distance < playerDist - 0.5) return;

    // 命中! 根据准度计算伤害
    const accuracyFactor = 1.0 - spreadMultiplier * 0.5;
    const damage = Math.round(BOT_WEAPON_DAMAGE * accuracyFactor);
    player.takeDamage(damage);
  }

  /**
   * 更新 Bot mesh 变换。
   * @param {object} bot
   */
  _updateMeshTransform(bot) {
    if (!bot.mesh.visible) return;

    bot.mesh.position.set(
      bot.position.x,
      bot.position.y + BOT_SIZE.y / 2,
      bot.position.z
    );
    bot.mesh.rotation.set(0, bot.yaw, 0);
  }

  /**
   * 获取 Bot 眼睛位置。
   * @param {object} bot
   * @returns {THREE.Vector3}
   */
  _getBotEyePosition(bot) {
    return this._tmpVec3.set(
      bot.position.x,
      bot.position.y + BOT_SIZE.y * 0.85,
      bot.position.z
    );
  }

  /**
   * 获取 Bot 面朝方向。
   * @param {object} bot
   * @returns {THREE.Vector3}
   */
  _getBotForward(bot) {
    return this._tmpDir.set(
      Math.sin(bot.yaw),
      0,
      Math.cos(bot.yaw)
    ).normalize();
  }

  /**
   * 应用射击散布。
   * @param {THREE.Vector3} direction
   * @param {number} spreadMultiplier
   * @returns {THREE.Vector3}
   */
  _applySpread(direction, spreadMultiplier) {
    const spread = BOT_WEAPON_SPREAD * (1 + spreadMultiplier * 5);
    if (spread <= 0) return direction.clone();

    const forward = direction.clone().normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);

    const right = this._tmpRight;
    if (Math.abs(forward.dot(worldUp)) > 0.999) {
      right.crossVectors(forward, new THREE.Vector3(1, 0, 0)).normalize();
    } else {
      right.crossVectors(forward, worldUp).normalize();
    }
    const up = this._tmpUp.crossVectors(right, forward).normalize();

    const angle = Math.random() * spread;
    const phi = Math.random() * Math.PI * 2;

    return this._tmpSpreadDir
      .copy(forward)
      .addScaledVector(right, Math.sin(angle) * Math.cos(phi))
      .addScaledVector(up, Math.sin(angle) * Math.sin(phi))
      .normalize();
  }
}
