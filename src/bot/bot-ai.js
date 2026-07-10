import * as THREE from 'three';

// ── 难度预设 ──────────────────────────────────────────────

/**
 * 难度参数预设。
 *
 * 字段说明:
 *   reactionTime  — 发现敌人后到开火的反应延迟 (秒)
 *   aimAccuracy   — 瞄准精度 (0-1), 越高越准, 影响散布乘数
 *   burstLength   — 每次 burst 射击发数
 *   maxHealth     — 最大生命值
 *   viewDistance  — 最大视野距离 (米)
 *   viewAngle     — 视野锥形角度 (度, 全角)
 *   moveSpeed     — 移动速度 (m/s)
 */
export const DIFFICULTY_PRESETS = {
  easy: {
    reactionTime: 0.8,
    aimAccuracy: 0.5,
    burstLength: 2,
    maxHealth: 75,
    viewDistance: 30,
    viewAngle: 120,
    moveSpeed: 3.0,
  },
  medium: {
    reactionTime: 0.5,
    aimAccuracy: 0.7,
    burstLength: 3,
    maxHealth: 100,
    viewDistance: 30,
    viewAngle: 120,
    moveSpeed: 3.5,
  },
  hard: {
    reactionTime: 0.2,
    aimAccuracy: 0.85,
    burstLength: 5,
    maxHealth: 100,
    viewDistance: 30,
    viewAngle: 120,
    moveSpeed: 4.0,
  },
};

// ── BotAI 类 ──────────────────────────────────────────────

/**
 * BotAI — 基于行为树的 Bot 人工智能
 *
 * 每个 Bot 持有一个 BotAI 实例。
 * 行为树每帧从根节点开始评估，按优先级选择行为。
 *
 * 行为树结构:
 *   ROOT (Selector)
 *   ├── [health <= 0] → Die
 *   ├── [enemy visible] → Combat (Sequence: Aim → Wait → Shoot)
 *   ├── [heard sound] → Investigate
 *   └── [default] → Patrol
 *
 * AI 只负责决策 (设定目标位置、射击指令)，
 * 具体的路径规划和移动由 BotNavigation 在 BotManager 中处理。
 */
export class BotAI {
  /**
   * @param {string} [difficulty='medium'] — 难度: 'easy' | 'medium' | 'hard'
   */
  constructor(difficulty = 'medium') {
    /** @type {object} 难度参数 */
    this.difficulty = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.medium;
    this._difficultyName = difficulty;

    // ── 内部状态 ──────────────────────────────────────

    /** 当前行为状态: 'patrol' | 'combat' | 'investigate' | 'die' */
    this.state = 'patrol';

    /** 反应延迟计时器 (秒) */
    this._reactionTimer = 0;

    /** 是否已进入反应阶段 */
    this._reacting = false;

    /** burst 射击计数器 */
    this._burstCount = 0;

    /** burst 射击间隔计时器 (秒) */
    this._burstTimer = 0;

    /** 巡逻等待计时器 (秒) */
    this._patrolWaitTimer = 0;

    /** 是否正在巡逻等待 */
    this._patrolWaiting = false;

    /** 上一帧是否在走路径 (用于巡逻等待触发) */
    this._wasPathing = false;

    /** 调查中是否已请求路径 (防止重复寻路) */
    this._investigatePathRequested = false;

    /** 瞄准转向角速度 (度/秒) */
    this._aimTurnSpeed = 90;

    /** 临时向量 */
    this._tmpDir = new THREE.Vector3();
    this._tmpVec3 = new THREE.Vector3();
  }

  /**
   * 每帧更新 AI 决策。
   *
   * @param {number} dt       — delta time (秒)
   * @param {object} bot      — Bot 对象
   * @param {object} player   — PlayerController 实例
   * @param {object} physics  — PhysicsSystem 实例
   * @param {object} navmesh  — NavMesh 实例 (用于获取巡逻目标)
   * @returns {object} 行为指令 { action: string, ... }
   */
  update(dt, bot, player, physics, navmesh) {
    // ── 根选择器: 按优先级评估 ──────────────────────

    // ① 死亡检查 (最高优先级)
    if (bot.health <= 0) {
      return this._die(dt, bot);
    }

    // ② 战斗检查
    const enemyVisible = this.isEnemyVisible(bot, player, physics);
    if (enemyVisible) {
      return this._combat(dt, bot, player);
    }

    // ③ 调查检查
    if (bot.heardSoundPosition) {
      return this._investigate(dt, bot);
    }

    // ④ 默认巡逻
    return this._patrol(dt, bot, navmesh);
  }

  // ── 视野检测 ──────────────────────────────────────────

  /**
   * 检测敌人是否在视野内。
   * 检查顺序: 距离 → 角度 → 射线
   *
   * @param {object} bot     — Bot 对象
   * @param {object} player  — PlayerController 实例
   * @param {object} physics — PhysicsSystem 实例
   * @returns {boolean}
   */
  isEnemyVisible(bot, player, physics) {
    if (!player || player.health <= 0) return false;

    const botEye = this._getEyePosition(bot);
    const playerPos = player.position;

    // 1. 距离检查
    const dx = playerPos.x - botEye.x;
    const dy = playerPos.y - botEye.y;
    const dz = playerPos.z - botEye.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > this.difficulty.viewDistance) return false;

    // 2. 角度检查 (锥形视野)
    const botForward = this._getForward(bot).clone();
    const dirToEnemy = this._tmpDir.set(dx, dy, dz).normalize();

    const dot = botForward.dot(dirToEnemy);
    const halfAngleRad = THREE.MathUtils.degToRad(this.difficulty.viewAngle / 2);
    const cosHalfAngle = Math.cos(halfAngleRad);

    if (dot < cosHalfAngle) return false;

    // 3. 射线检测 (是否有遮挡)
    if (!physics || typeof physics.raycast !== 'function') {
      return true;
    }

    const hit = physics.raycast(botEye, dirToEnemy, dist);

    // 无遮挡 → 可以看到
    if (!hit) return true;

    // 命中点距离 >= (玩家距离 - 玩家体积容差) → 命中的是玩家或玩家后方
    if (hit.distance >= dist - 1.5) return true;

    return false;
  }

  // ── 行为: 死亡 ──────────────────────────────────────────

  /**
   * 死亡行为 — 等待重生计时器。
   *
   * @param {number} dt
   * @param {object} bot
   * @returns {object}
   */
  _die(dt, bot) {
    this.state = 'die';

    if (!bot._deathTimerInitialized) {
      bot.deathTimer = 3 + Math.random() * 2; // 3-5 秒
      bot._deathTimerInitialized = true;
      bot.navTarget = null;
    }

    bot.deathTimer -= dt;

    if (bot.deathTimer <= 0) {
      bot.needsRespawn = true;
      bot._deathTimerInitialized = false;
    }

    return { action: 'die' };
  }

  // ── 行为: 战斗 ──────────────────────────────────────────

  /**
   * 战斗行为序列: Aim → Wait(reaction) → Shoot(burst)
   *
   * @param {number} dt
   * @param {object} bot
   * @param {object} player
   * @returns {object}
   */
  _combat(dt, bot, player) {
    this.state = 'combat';

    // 清除巡逻/调查状态
    this._patrolWaiting = false;
    this._patrolWaitTimer = 0;
    bot.navTarget = null;

    const playerPos = player.position;

    // ── Step 1: 瞄准敌人 ────────────────────────────
    this._aimAtTarget(dt, bot, playerPos);

    // ── Step 2: 反应延迟 ────────────────────────────
    if (!this._reacting) {
      this._reactionTimer += dt;
      if (this._reactionTimer < this.difficulty.reactionTime) {
        return { action: 'combat', phase: 'reacting' };
      }
      this._reacting = true;
      this._burstCount = 0;
      this._burstTimer = 0;
    }

    // ── Step 3: Burst 射击 ──────────────────────────
    if (this._burstCount < this.difficulty.burstLength) {
      this._burstTimer += dt;

      const shootInterval = 0.1 + Math.random() * 0.1; // 100-200ms

      if (this._burstTimer >= shootInterval) {
        this._burstTimer = 0;
        this._burstCount++;

        return {
          action: 'shoot',
          phase: 'shooting',
          target: playerPos.clone(),
          spreadMultiplier: 1.0 - this.difficulty.aimAccuracy,
        };
      }

      return { action: 'combat', phase: 'aiming' };
    }

    // Burst 完成 → 重置，下一帧重新进入反应延迟
    this._reacting = false;
    this._reactionTimer = 0;
    this._burstCount = 0;

    return { action: 'combat', phase: 'cooldown' };
  }

  // ── 行为: 调查 ──────────────────────────────────────────

  /**
   * 调查行为 — 走向听到的声源位置。
   * 设定 bot.navTarget，由 BotManager 中的 BotNavigation 执行寻路。
   *
   * @param {number} dt
   * @param {object} bot
   * @returns {object}
   */
  _investigate(dt, bot) {
    this.state = 'investigate';
    this._reacting = false;
    this._reactionTimer = 0;
    this._burstCount = 0;
    if (!soundPos) {
      this._investigatePathRequested = false;
      return { action: 'patrol', phase: 'idle' };
    }

    // 如果正在走路径，继续
    if (bot.currentPath && bot.currentPath.length > 0) {
      return { action: 'investigate', phase: 'moving' };
    }

    // 路径已完成 且 之前已请求过路径 → 到达
    if (this._investigatePathRequested) {
      this._investigatePathRequested = false;
      bot.heardSoundPosition = null;
      return { action: 'investigate', phase: 'arrived' };
    }

    // 请求到声源的路径
    bot.navTarget = { x: soundPos.x, y: soundPos.y, z: soundPos.z };
    this._investigatePathRequested = true;
    return { action: 'investigate', phase: 'moving' };
  }

  // ── 行为: 巡逻 ──────────────────────────────────────────

  /**
   * 巡逻行为 — 在随机路径点间移动，到达后等待。
   *
   * @param {number} dt
   * @param {object} bot
   * @param {object} navmesh
   * @returns {object}
   */
  _patrol(dt, bot, navmesh) {
    this.state = 'patrol';
    this._reacting = false;
    this._reactionTimer = 0;
    this._burstCount = 0;
    if (bot.currentPath && bot.currentPath.length > 0) {
      this._wasPathing = true;
      return { action: 'patrol', phase: 'moving' };
    }

    // 路径刚走完 — 开始等待
    if (this._wasPathing) {
      this._wasPathing = false;
      this._patrolWaiting = true;
      this._patrolWaitTimer = 1 + Math.random() * 2; // 1-3 秒
      return { action: 'patrol', phase: 'waiting' };
    }
    // 正在等待
    if (this._patrolWaiting) {
      this._patrolWaitTimer -= dt;
      if (this._patrolWaitTimer <= 0) {
        this._patrolWaiting = false;
        // 等待结束，下个循环会选择新目标
      }
      return { action: 'patrol', phase: 'waiting' };
    }
    // 选择新的巡逻目标
    const currentWp = navmesh.getNearestWaypoint(bot.position);
    let target;
      let attempts = 0;
    do {
      target = navmesh.getRandomWaypoint();
      attempts++;
      } while (target && currentWp && target.id === currentWp.id && attempts < 10);
      bot.navTarget = {
        x: target.position.x,
        y: target.position.y,
        z: target.position.z,
      };
    }

    return { action: 'patrol', phase: 'moving' };
  }

  // ── 辅助方法 ──────────────────────────────────────────

  /**
   * 逐渐将 Bot 转向目标。
   * @param {number} dt
   * @param {object} bot
   * @param {THREE.Vector3} targetPos
   */
  _aimAtTarget(dt, bot, targetPos) {
    const dx = targetPos.x - bot.position.x;
    const dz = targetPos.z - bot.position.z;
    const targetYaw = Math.atan2(dx, dz);

    let angleDiff = targetYaw - bot.yaw;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const maxTurn = THREE.MathUtils.degToRad(this._aimTurnSpeed) * dt;

    if (Math.abs(angleDiff) <= maxTurn) {
      bot.yaw = targetYaw;
    } else {
      bot.yaw += Math.sign(angleDiff) * maxTurn;
    }
  }

  /**
   * 获取 Bot 眼睛位置。
   * @param {object} bot
   * @returns {THREE.Vector3}
   */
  _getEyePosition(bot) {
    const size = bot.size || { y: 1.8 };
    const eyeHeight = size.y * 0.85;
    return this._tmpVec3.set(
      bot.position.x,
      bot.position.y + eyeHeight,
      bot.position.z
    );
  }

  /**
   * 获取 Bot 面朝方向 (水平)。
   * @param {object} bot
   * @returns {THREE.Vector3}
   */
  _getForward(bot) {
    return this._tmpDir.set(
      Math.sin(bot.yaw),
      0,
      Math.cos(bot.yaw)
    ).normalize();
  }

  /**
   * 重置 AI 内部状态 (重生时调用)。
   */
  reset() {
    this.state = 'patrol';
    this._reactionTimer = 0;
    this._reacting = false;
    this._burstCount = 0;
    this._burstTimer = 0;
    this._patrolWaitTimer = 0;
    this._patrolWaiting = false;
    this._wasPathing = false;
    this._investigatePathRequested = false;
  }

  /**
   * 获取难度名称。
   * @returns {string}
   */
  getDifficultyName() {
    return this._difficultyName;
  }
}
