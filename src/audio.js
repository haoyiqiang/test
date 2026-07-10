/**
 * audio.js — 音频管理器
 *
 * 基于 Web Audio API 的程序化音效系统。
 * 所有音效通过白噪声 + 滤波合成，无需外部音频文件。
 * 使用 PannerNode 实现 3D 空间化，支持距离衰减和方向感知。
 *
 * 使用方式:
 *   const audio = new AudioManager();
 *   audio.init();                          // 需在用户交互后调用
 *   audio.playGunFire('ak47', position);   // 播放 3D 枪声
 *   audio.playFootstep(position);          // 播放 3D 脚步
 *   audio.playHitMarker();                 // 播放 UI 音效
 */

// ── 武器类型 → 音效参数映射 ──────────────────────────────

/**
 * 根据武器 ID 获取武器类型，用于选择对应的音效参数。
 * 与 weapon-data.js 中的类型定义保持一致。
 */
const WEAPON_TYPE_MAP = {
  'usps':    'pistol',
  'glock18': 'pistol',
  'deagle':  'pistol',
  'ak47':    'rifle',
  'm4a4':    'rifle',
  'awp':     'sniper',
};

/** 消音武器列表 (播放降低音量/低频的枪声) */
const SILENCED_WEAPONS = new Set(['usps']);

// ── 音效参数 ────────────────────────────────────────────

/** 各武器类型枪声音效参数 */
const GUN_SOUND_CONFIG = {
  pistol: {
    duration: 0.2,
    filterType: 'lowpass',
    filterFreq: 2000,
    filterQ: 1,
    gain: 0.6,
  },
  silenced: {
    duration: 0.2,
    filterType: 'lowpass',
    filterFreq: 800,
    filterQ: 1,
    gain: 0.3,
  },
  rifle: {
    duration: 0.3,
    filterType: 'bandpass',
    filterFreq: 1500,
    filterQ: 2,
    gain: 0.7,
  },
  sniper: {
    duration: 0.5,
    filterType: 'lowpass',
    filterFreq: 500,
    filterQ: 1,
    gain: 0.8,
  },
};

// ── AudioManager ─────────────────────────────────────────

export class AudioManager {
  constructor() {
    /** @type {AudioContext|null} */
    this._ctx = null;

    /** @type {GainNode|null} 主音量节点 */
    this._masterGain = null;

    /** @type {number} 主音量 (0-1) */
    this._volume = 1;

    /** @type {boolean} 是否静音 */
    this._muted = false;

    /** @type {AudioBuffer|null} 缓存的噪声缓冲 (2秒白噪声) */
    this._noiseBuffer = null;
  }

  // ── 初始化 ────────────────────────────────────────────

  /**
   * 初始化 AudioContext。
   * 必须在用户交互 (点击/按键) 后调用，否则浏览器会阻止音频播放。
   */
  init() {
    if (this._ctx) return; // 已初始化

    this._ctx = new AudioContext();

    // 创建主音量控制节点
    this._masterGain = this._ctx.createGain();
    this._masterGain.gain.value = this._volume;
    this._masterGain.connect(this._ctx.destination);

    // 预生成白噪声缓冲 (2 秒), 所有枪声从此复用
    this._noiseBuffer = this._createNoiseBuffer(2);
  }

  // ── 音量控制 ──────────────────────────────────────────

  /**
   * 设置主音量。
   * @param {number} vol — 音量值 (0 ~ 1)
   */
  setMasterVolume(vol) {
    this._volume = Math.max(0, Math.min(1, vol));
    if (this._masterGain) {
      this._masterGain.gain.value = this._muted ? 0 : this._volume;
    }
  }

  /** 静音 */
  mute() {
    this._muted = true;
    if (this._masterGain) {
      this._masterGain.gain.value = 0;
    }
  }

  /** 取消静音 */
  unmute() {
    this._muted = false;
    if (this._masterGain) {
      this._masterGain.gain.value = this._volume;
    }
  }

  // ── 枪声 ──────────────────────────────────────────────

  /**
   * 播放 3D 空间化枪声。
   *
   * @param {string}        weaponId — 武器标识符 (如 'ak47', 'awp')
   * @param {THREE.Vector3} position — 声源在世界空间中的位置
   */
  playGunFire(weaponId, position) {
    if (!this._ctx) return;

    const weaponType = WEAPON_TYPE_MAP[weaponId] || 'pistol';
    const isSilenced = SILENCED_WEAPONS.has(weaponId);

    // 创建空间化链路
    const panner = this._createSpatialChain(position);

    if (weaponType === 'sniper') {
      // AWP: 低频正弦波 + 噪声混合
      this._playSniperSound(panner, GUN_SOUND_CONFIG.sniper);
    } else {
      // 普通枪声: 白噪声 + 滤波
      const config = (isSilenced)
        ? GUN_SOUND_CONFIG.silenced
        : GUN_SOUND_CONFIG[weaponType];

      this._createNoiseBurst(config, panner);
    }
  }

  // ── 脚步 ──────────────────────────────────────────────

  /**
   * 播放 3D 空间化脚步声。
   *
   * @param {THREE.Vector3} position — 声源位置
   * @param {string}        [surface='default'] — 表面类型 (预留)
   */
  playFootstep(position, surface = 'default') {
    if (!this._ctx) return;
    void surface; // 预留扩展

    const panner = this._createSpatialChain(position);

    // 短促低频脉冲, 带随机音高变化增添自然感
    const freq = 200 + Math.random() * 80; // 200-280Hz 之间随机变化
    this._createNoiseBurst({
      duration: 0.05,
      filterType: 'lowpass',
      filterFreq: freq,
      filterQ: 1,
      gain: 0.15,
    }, panner);
  }

  // ── UI 音效 (非空间化) ────────────────────────────────

  /**
   * 播放击中标记音效 — 短促高音 "嘀"。
   */
  playHitMarker() {
    if (!this._ctx) return;

    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 1000;

    gain.gain.setValueAtTime(0.3, this._ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(this._masterGain);

    osc.start(this._ctx.currentTime);
    osc.stop(this._ctx.currentTime + 0.05);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /**
   * 播放击杀音效 — 双音上升确认音。
   * 800Hz → 1200Hz 快速扫频, 200ms。
   */
  playKillSound() {
    if (!this._ctx) return;

    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this._ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this._ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.4, this._ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(this._masterGain);

    osc.start(this._ctx.currentTime);
    osc.stop(this._ctx.currentTime + 0.2);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /**
   * 播放换弹音效 — 机械点击序列。
   * 两段短促噪声脉冲, 间隔 200ms。
   *
   * @param {string} [weaponId] — 武器标识符 (预留, 可根据武器调整时间)
   */
  playReloadSound(weaponId) {
    if (!this._ctx) return;
    void weaponId; // 预留

    const now = this._ctx.currentTime;

    // 第一声点击
    this._playReloadClick(now);

    // 第二声点击 (200ms 后)
    this._playReloadClick(now + 0.2);
  }

  /**
   * 播放回合开始音效 — 上升音调。
   * 400Hz → 600Hz, 500ms。
   */
  playRoundStart() {
    if (!this._ctx) return;

    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, this._ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, this._ctx.currentTime + 0.5);

    gain.gain.setValueAtTime(0.3, this._ctx.currentTime);
    gain.gain.setValueAtTime(0.3, this._ctx.currentTime + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(this._masterGain);

    osc.start(this._ctx.currentTime);
    osc.stop(this._ctx.currentTime + 0.5);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /**
   * 播放回合结束音效 — 下降音调。
   * 600Hz → 300Hz, 500ms。
   */
  playRoundEnd() {
    if (!this._ctx) return;

    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, this._ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, this._ctx.currentTime + 0.5);

    gain.gain.setValueAtTime(0.3, this._ctx.currentTime);
    gain.gain.setValueAtTime(0.3, this._ctx.currentTime + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(this._masterGain);

    osc.start(this._ctx.currentTime);
    osc.stop(this._ctx.currentTime + 0.5);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  // ── 购买音效 ──────────────────────────────────────────

  /**
   * 播放购买音效 — 短促确认音。
   */
  playBuySound() {
    if (!this._ctx) return;

    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, this._ctx.currentTime);
    osc.frequency.setValueAtTime(800, this._ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.25, this._ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(this._masterGain);

    osc.start(this._ctx.currentTime);
    osc.stop(this._ctx.currentTime + 0.12);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  // ── 销毁 ──────────────────────────────────────────────

  /** 释放 AudioContext 资源 */
  dispose() {
    if (this._ctx) {
      this._ctx.close();
      this._ctx = null;
      this._masterGain = null;
      this._noiseBuffer = null;
    }
  }

  // ═══════════════════════════════════════════════════════
  // 私有方法
  // ═══════════════════════════════════════════════════════

  /**
   * 生成指定时长的白噪声 AudioBuffer。
   *
   * @param {number} duration — 时长 (秒)
   * @returns {AudioBuffer}
   */
  _createNoiseBuffer(duration) {
    const sampleRate = this._ctx.sampleRate;
    const length = Math.ceil(sampleRate * duration);
    const buffer = this._ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    return buffer;
  }

  /**
   * 创建空间化链路 (PannerNode → MasterGain → Destination)。
   *
   * 坐标系: Three.js 右手坐标系 (Y-up)。
   * 距离衰减: 每 1 单位衰减 2dB (rolloffFactor=2, distanceModel='linear')。
   *
   * @param {THREE.Vector3|null} position — 声源位置 (null 时默认为原点)
   * @returns {PannerNode}
   */
  _createSpatialChain(position) {
    const panner = this._ctx.createPanner();

    // HRTF 实现方向感和距离感
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.refDistance = 1;
    panner.maxDistance = 200;
    panner.rolloffFactor = 2; // 每单位距离衰减 2dB

    // 设置位置 (Three.js 坐标系)
    if (position) {
      panner.positionX.value = position.x || 0;
      panner.positionY.value = position.y || 0;
      panner.positionZ.value = position.z || 0;
    }

    // 连接到主音量
    panner.connect(this._masterGain);

    return panner;
  }

  /**
   * 核心音效合成方法 — 从缓存的噪声缓冲创建带滤波和衰减包络的音频源。
   *
   * @param {object}      config          — 音效参数
   * @param {number}      config.duration   — 持续时间 (秒)
   * @param {BiquadFilterType} config.filterType — 滤波类型
   * @param {number}      config.filterFreq  — 滤波频率 (Hz)
   * @param {number}      config.filterQ     — 滤波 Q 值
   * @param {number}      config.gain        — 初始增益 (0-1)
   * @param {AudioNode}   destination       — 输出目标节点
   */
  _createNoiseBurst(config, destination) {
    const ctx = this._ctx;
    const { duration, filterType, filterFreq, filterQ, gain } = config;

    // 创建噪声源 (从缓存缓冲中读取)
    const source = ctx.createBufferSource();
    source.buffer = this._noiseBuffer;

    // 滤波
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = filterQ;

    // 增益包络 — 指数衰减
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    // 连接链路: source → filter → gain → destination
    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(destination);

    // 播放
    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + duration);

    // 自动清理
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gainNode.disconnect();
    };
  }

  /**
   * 播放 AWP 狙击枪音效 — 低频正弦波 + 噪声混合, 更长更强的衰减。
   *
   * @param {AudioNode} destination — 输出目标节点
   * @param {object}    config      — 狙击枪音效参数
   */
  _playSniperSound(destination, config) {
    const ctx = this._ctx;
    const now = ctx.currentTime;

    // 1. 低频正弦波 (120Hz) — 深沉的低音炮感
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 120;

    oscGain.gain.setValueAtTime(0.7, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(oscGain);
    oscGain.connect(destination);

    osc.start(now);
    osc.stop(now + 0.5);

    osc.onended = () => {
      osc.disconnect();
      oscGain.disconnect();
    };

    // 2. 噪声层 — 增加枪声质感
    this._createNoiseBurst({
      duration: config.duration,
      filterType: config.filterType,
      filterFreq: config.filterFreq,
      filterQ: config.filterQ,
      gain: 0.4,
    }, destination);
  }

  /**
   * 播放单次换弹点击音。
   *
   * @param {number} startTime — 开始时间 (AudioContext.currentTime 基准)
   */
  _playReloadClick(startTime) {
    const ctx = this._ctx;

    const source = ctx.createBufferSource();
    source.buffer = this._noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 3;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this._masterGain);

    source.start(startTime);
    source.stop(startTime + 0.05);

    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
}
