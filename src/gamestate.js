import { getWeaponData, getWeaponPrice } from 'csgo/weapon/weapon-data.js';

// ── 常量 ──────────────────────────────────────────────────

/** 回合阶段 */
export const PHASE = {
  WARMUP: 'warmup',
  BUY_PHASE: 'buy_phase',
  PLAYING: 'playing',
  ROUND_END: 'round_end',
};

/** 默认死亡竞赛回合时间 (秒) */
const DEFAULT_ROUND_TIME = 300;

/** 购买阶段时长 (秒) */
const BUY_PHASE_DURATION = 15;

/** 回合结束展示时长 (秒) */
const ROUND_END_DURATION = 5;

/** 起始金钱 */
const STARTING_MONEY = 800;

/** 击杀奖励 */
const KILL_REWARD = 300;

/** 助攻奖励 */
const ASSIST_REWARD = 150;

/** 每轮保底金钱 */
const ROUND_MINIMUM_REWARD = 1400;

/** 金钱上限 */
const MAX_MONEY = 16000;

/** 击杀提示最大保留条数 */
const MAX_KILLFEED_SIZE = 10;

// ── GameState 类 ─────────────────────────────────────────

/**
 * GameState — 游戏状态管理
 *
 * 管理回合阶段、分数、经济和击杀记录。
 *
 * 用法:
 *   const gs = new GameState({
 *     mode: 'deathmatch',
 *     weaponSystem: weaponSystem,
 *     spawnPoints: mapLoader.getAllSpawnPoints(),
 *   });
 *   // 在游戏循环中:
 *   gs.update(dt);
 */
export class GameState {
  /**
   * @param {object} options
   * @param {string} [options.mode='deathmatch']    — 游戏模式
   * @param {number} [options.roundTime=300]        — 回合时间 (秒)
   * @param {object} options.weaponSystem           — WeaponSystem 实例 (用于购买)
   * @param {Array<{x:number, y:number, z:number, rot:number}>} [options.spawnPoints=[]] — 重生点列表
   */
  constructor({
    mode = 'deathmatch',
    roundTime = DEFAULT_ROUND_TIME,
    weaponSystem,
    spawnPoints = [],
  } = {}) {
    // ── 模式 ────────────────────────────────────────
    /** @type {string} */
    this.mode = mode;

    // ── 回合 ────────────────────────────────────────
    /** @type {string} 当前阶段 */
    this.phase = PHASE.WARMUP;

    /** 阶段内已过时间 (秒) */
    this.phaseTimer = 0;

    /** 回合总时间 (秒) */
    this.roundTime = roundTime;

    /** 回合剩余时间 (秒) */
    this.roundTimeLeft = roundTime;

    /** 当前回合数 */
    this.roundNumber = 1;

    // ── 分数 ────────────────────────────────────────
    /** 玩家击杀数 */
    this.playerScore = 0;

    /** 玩家死亡数 */
    this.playerDeaths = 0;

    /**
     * Bot 分数表: botId → { index, name, score, deaths }
     * @type {Map<string, object>}
     */
    this.botScores = new Map();

    /**
     * Bot 引用 → botId 映射 (WeakMap)
     * @type {WeakMap<object, string>}
     */
    this._botIdMap = new WeakMap();

    /** Bot ID 自增计数器 */
    this._botIdCounter = 0;

    // ── 经济 ────────────────────────────────────────
    /** 玩家金钱 (唯一权威来源) */
    this.money = STARTING_MONEY;

    // ── 击杀提示 ────────────────────────────────────
    /**
     * 击杀记录: Array<{killer, victim, weapon, timestamp}>
     * @type {Array<object>}
     */
    this.killfeed = [];

    // ── 重生点 ──────────────────────────────────────
    /**
     * 可用重生点列表
     * @type {Array<{x:number, y:number, z:number, rot:number}>}
     */
    this.spawnPoints = spawnPoints;

    // ── 武器系统引用 ────────────────────────────────
    /** @type {object|null} */
    this._weaponSystem = weaponSystem || null;

    // ── 回调 ────────────────────────────────────────
    /** @type {Array<function>} 阶段变更回调 */
    this._phaseCallbacks = [];
  }

  // ── 帧更新 ────────────────────────────────────────────

  /**
   * 每帧调用，更新阶段计时器和回合倒计时。
   * @param {number} dt — delta time (秒)
   */
  update(dt) {
    this.phaseTimer += dt;

    switch (this.phase) {
      case PHASE.WARMUP:
        // warmup 无限等待，通过外部调用 startMatch() 结束
        break;

      case PHASE.BUY_PHASE:
        if (this.phaseTimer >= BUY_PHASE_DURATION) {
          this._transitionTo(PHASE.PLAYING);
        }
        break;

      case PHASE.PLAYING:
        this.roundTimeLeft -= dt;
        if (this.roundTimeLeft <= 0) {
          this.roundTimeLeft = 0;
          this._transitionTo(PHASE.ROUND_END);
        }
        break;

      case PHASE.ROUND_END:
        if (this.phaseTimer >= ROUND_END_DURATION) {
          this._startNextRound();
        }
        break;
    }
  }

  // ── 回合控制 ──────────────────────────────────────────

  /** 开始比赛 (从 warmup 过渡)。 */
  startMatch() {
    if (this.phase !== PHASE.WARMUP) return;
    this._transitionTo(PHASE.BUY_PHASE);
  }

  /**
   * 强制结束当前回合。
   * 可用于时间未到但达成胜利条件时。
   */
  endRound() {
    if (this.phase !== PHASE.PLAYING) return;
    this._transitionTo(PHASE.ROUND_END);
  }

  /**
   * 检查回合是否进行中。
   * @returns {boolean}
   */
  isRoundActive() {
    return this.phase === PHASE.PLAYING;
  }

  /**
   * 检查是否处于购买阶段。
   * @returns {boolean}
   */
  isBuyPhase() {
    return this.phase === PHASE.BUY_PHASE;
  }

  /**
   * 获取回合剩余时间 (秒)。
   * @returns {number} 剩余时间；非 playing 阶段返回 0
   */
  getRoundTimeLeft() {
    if (this.phase !== PHASE.PLAYING) return 0;
    return Math.max(0, this.roundTimeLeft);
  }

  /**
   * 获取购买阶段剩余时间 (秒)。
   * @returns {number}
   */
  getBuyTimeLeft() {
    if (this.phase !== PHASE.BUY_PHASE) return 0;
    return Math.max(0, BUY_PHASE_DURATION - this.phaseTimer);
  }

  // ── 分数与击杀 ────────────────────────────────────────

  /**
   * 记录一次击杀。
   *
   * @param {string} killerId      — 击杀者标识: 'player' 或 botId
   * @param {string} victimId      — 被击杀者标识: 'player' 或 botId
   * @param {string} weaponName    — 武器名称
   * @param {boolean} [isHeadshot=false] — 是否爆头
   */
  addKill(killerId, victimId, weaponName, isHeadshot = false) {
    // 更新击杀者分数
    if (killerId === 'player') {
      this.playerScore++;
      this.addMoney(KILL_REWARD);
    } else {
      const botEntry = this.botScores.get(killerId);
      if (botEntry) {
        botEntry.score++;
      }
    }

    // 更新被击杀者死亡数
    if (victimId === 'player') {
      this.playerDeaths++;
    } else {
      const botEntry = this.botScores.get(victimId);
      if (botEntry) {
        botEntry.deaths = (botEntry.deaths || 0) + 1;
      }
    }

    // 记录击杀提示
    const entry = {
      killer: killerId === 'player' ? '你' : (this.botScores.get(killerId)?.name || 'Bot'),
      victim: victimId === 'player' ? '你' : (this.botScores.get(victimId)?.name || 'Bot'),
      weapon: weaponName,
      isHeadshot,
      timestamp: performance.now(),
    };

    this.killfeed.unshift(entry);
    // 限制大小
    if (this.killfeed.length > MAX_KILLFEED_SIZE) {
      this.killfeed.length = MAX_KILLFEED_SIZE;
    }
  }

  /**
   * 记录助攻 (仅玩家)。
   */
  addAssist() {
    this.addMoney(ASSIST_REWARD);
  }

  // ── 经济 ──────────────────────────────────────────────

  /**
   * 增加金钱 (受上限限制)。
   * @param {number} amount
   */
  addMoney(amount) {
    this.money = Math.min(this.money + amount, MAX_MONEY);
  }

  /**
   * 检查是否可以购买指定武器。
   * @param {string} weaponId — 武器 ID (如 'ak47')
   * @returns {boolean}
   */
  canBuy(weaponId) {
    const price = getWeaponPrice(weaponId);
    return this.money >= price;
  }

  /**
   * 购买武器。
   * 从玩家金钱中扣除价格，并装备到武器系统。
   *
   * @param {string} weaponId — 武器 ID
   * @returns {{success: boolean, message: string}}
   */
  buyWeapon(weaponId) {
    const weaponData = getWeaponData(weaponId);
    if (!weaponData) {
      return { success: false, message: `未知武器: ${weaponId}` };
    }

    if (this.money < weaponData.price) {
      return { success: false, message: `金钱不足！需要 $${weaponData.price}，当前 $${this.money}` };
    }

    // 购买阶段或 warmup 才允许购买
    if (this.phase !== PHASE.BUY_PHASE && this.phase !== PHASE.WARMUP) {
      return { success: false, message: '只能在购买阶段购买武器' };
    }

    this.money -= weaponData.price;

    if (this._weaponSystem) {
      this._weaponSystem.equipWeapon(weaponData);
    }

    return { success: true, message: `购买 ${weaponData.name} 成功` };
  }

  // ── Bot 分数管理 ───────────────────────────────────────

  /**
   * 为 Bot 注册分数条目。
   * 使用 WeakMap 将 bot 对象引用映射到稳定 ID。
   *
   * @param {object} bot      — Bot 对象引用
   * @param {string} name     — Bot 显示名称
   * @returns {string} botId
   */
  registerBot(bot, name) {
    // 检查是否已注册
    let botId = this._botIdMap.get(bot);
    if (botId) return botId;

    // 分配新 ID
    this._botIdCounter++;
    botId = `bot_${this._botIdCounter}`;

    this._botIdMap.set(bot, botId);
    this.botScores.set(botId, {
      index: this._botIdCounter - 1,
      name: name || `Bot ${this._botIdCounter}`,
      score: 0,
      deaths: 0,
    });

    return botId;
  }

  /**
   * 通过 bot 对象引用获取其 botId。
   * @param {object} bot
   * @returns {string|null}
   */
  getBotId(bot) {
    return this._botIdMap.get(bot) || null;
  }

  /**
   * 更新 Bot 显示名称。
   * @param {string} botId
   * @param {string} name
   */
  setBotName(botId, name) {
    const entry = this.botScores.get(botId);
    if (entry) {
      entry.name = name;
    }
  }

  // ── 重生点 ────────────────────────────────────────────

  /**
   * 随机获取一个玩家重生点。
   * @returns {{x:number, y:number, z:number, rot:number}|null}
   */
  getPlayerRespawnPoint() {
    if (this.spawnPoints.length === 0) {
      return { x: 0, y: 0, z: 0, rot: 0 };
    }
    return this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
  }

  /**
   * 随机获取一个 CT 方重生点 (用于玩家)。
   * @param {Array<{x:number, y:number, z:number, rot:number}>} [ctSpawns] — CT 重生点
   * @returns {{x:number, y:number, z:number, rot:number}}
   */
  getRandomCTSpawn(ctSpawns) {
    const points = ctSpawns || this.spawnPoints;
    if (points.length === 0) return { x: 0, y: 0, z: 0, rot: 0 };
    return points[Math.floor(Math.random() * points.length)];
  }

  /**
   * 随机获取一个 T 方重生点 (用于 Bot)。
   * @param {Array<{x:number, y:number, z:number, rot:number}>} [tSpawns] — T 重生点
   * @returns {{x:number, y:number, z:number, rot:number}}
   */
  getRandomTSpawn(tSpawns) {
    const points = tSpawns || this.spawnPoints;
    if (points.length === 0) return { x: 0, y: 0, z: 0, rot: 0 };
    return points[Math.floor(Math.random() * points.length)];
  }

  // ── 排行 ──────────────────────────────────────────────

  /**
   * 获取击杀排行 (降序)。
   * 返回格式: [{ name, score, type: 'player'|'bot' }]
   *
   * @param {number} [limit=5] — 最大返回数量
   * @returns {Array<object>}
   */
  getTopPlayers(limit = 5) {
    const entries = [];

    // 玩家
    entries.push({
      name: '你',
      score: this.playerScore,
      deaths: this.playerDeaths,
      type: 'player',
    });

    // Bot
    for (const [, botEntry] of this.botScores) {
      entries.push({
        name: botEntry.name,
        score: botEntry.score,
        deaths: botEntry.deaths || 0,
        type: 'bot',
      });
    }

    // 按击杀降序排列
    entries.sort((a, b) => b.score - a.score);
    return entries.slice(0, limit);
  }

  /**
   * 获取玩家 K/D 比率。
   * @returns {string} 如 "1.50"
   */
  getPlayerKD() {
    if (this.playerDeaths === 0) return this.playerScore.toFixed(2);
    return (this.playerScore / this.playerDeaths).toFixed(2);
  }

  // ── 阶段回调 ──────────────────────────────────────────

  /**
   * 注册阶段变更回调。
   * @param {function(string, string): void} callback — (newPhase, oldPhase)
   */
  onPhaseChange(callback) {
    this._phaseCallbacks.push(callback);
  }

  // ── 公共 getter ────────────────────────────────────────

  /**
   * 获取阶段名称。
   * @returns {string}
   */
  getPhase() {
    return this.phase;
  }

  /**
   * 获取当前金钱。
   * @returns {number}
   */
  getMoney() {
    return this.money;
  }

  /**
   * 设置武器系统引用。
   * @param {object} ws — WeaponSystem 实例
   */
  setWeaponSystem(ws) {
    this._weaponSystem = ws;
  }

  /**
   * 重置游戏状态 (新比赛)。
   */
  reset() {
    this.phase = PHASE.WARMUP;
    this.phaseTimer = 0;
    this.roundTimeLeft = this.roundTime;
    this.roundNumber = 1;
    this.playerScore = 0;
    this.playerDeaths = 0;
    this.money = STARTING_MONEY;
    this.killfeed = [];
    this.botScores.clear();
    this._botIdMap = new WeakMap();
    this._botIdCounter = 0;
  }

  // ── 私有方法 ──────────────────────────────────────────

  /**
   * 阶段过渡。
   * @param {string} newPhase
   */
  _transitionTo(newPhase) {
    const oldPhase = this.phase;
    this.phase = newPhase;
    this.phaseTimer = 0;

    // 触发回调
    for (const cb of this._phaseCallbacks) {
      try { cb(newPhase, oldPhase); } catch (e) { /* ignore */ }
    }
  }

  /**
   * 开始下一回合。
   */
  _startNextRound() {
    this.roundNumber++;

    // 发放保底金钱
    this.addMoney(ROUND_MINIMUM_REWARD);

    // 重置回合计时器
    this.roundTimeLeft = this.roundTime;

    // 进入购买阶段
    this._transitionTo(PHASE.BUY_PHASE);
  }
}
