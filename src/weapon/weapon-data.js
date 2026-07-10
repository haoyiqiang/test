/**
 * weapon-data.js — 武器数据表
 *
 * 定义所有可用武器的属性和伤害部位倍率。
 */

// ── 伤害部位倍率 ──────────────────────────────────────────

/** @type {{HEAD: number, CHEST: number, STOMACH: number, LEG: number}} */
export const DAMAGE_MULTIPLIERS = {
  HEAD: 4.0,
  CHEST: 1.0,
  STOMACH: 1.25,
  LEG: 0.75,
};

// ── 武器数据表 ──────────────────────────────────────────

/**
 * 武器定义。
 *
 * 字段说明:
 *   id            — 唯一标识符
 *   name          — 显示名称
 *   type          — 武器类型: 'pistol' | 'rifle' | 'sniper'
 *   damage        — 基础伤害
 *   fireRate      — 射速间隔 (ms)，即两次射击之间的冷却时间
 *   magSize       — 弹匣容量
 *   reserveAmmo   — 默认备弹量
 *   price         — 购买价格 ($)
 *   spread        — 散布角 (弧度)，子弹随机偏移的最大角度
 *   reloadTime    — 换弹时间 (ms)
 *   recoilVertical   — 每次射击垂直后坐力增量 (度)
 *   recoilHorizontal — 每次射击水平后坐力随机偏移范围 (度)
 *   switchTime    — 切换到该武器的动画时间 (ms)
 *   scopedSpread  — 开镜散布角 (仅狙击枪), null 表示不支持开镜
 */
export const WEAPONS = {
  /** USP-S — 消音手枪 */
  'usps': {
    id: 'usps',
    name: 'USP-S',
    type: 'pistol',
    damage: 35,
    fireRate: 600,
    magSize: 12,
    reserveAmmo: 24,
    price: 200,
    spread: 0.02,
    reloadTime: 2200,
    recoilVertical: 1.2,
    recoilHorizontal: 0.4,
    switchTime: 300,
    scopedSpread: null,
  },

  /** Glock-18 — 格洛克手枪 */
  'glock18': {
    id: 'glock18',
    name: 'Glock-18',
    type: 'pistol',
    damage: 30,
    fireRate: 400,
    magSize: 20,
    reserveAmmo: 40,
    price: 200,
    spread: 0.04,
    reloadTime: 2200,
    recoilVertical: 0.9,
    recoilHorizontal: 0.5,
    switchTime: 300,
    scopedSpread: null,
  },

  /** Desert Eagle — 沙漠之鹰 */
  'deagle': {
    id: 'deagle',
    name: 'Desert Eagle',
    type: 'pistol',
    damage: 70,
    fireRate: 1200,
    magSize: 7,
    reserveAmmo: 14,
    price: 700,
    spread: 0.08,
    reloadTime: 2200,
    recoilVertical: 3.0,
    recoilHorizontal: 1.0,
    switchTime: 300,
    scopedSpread: null,
  },

  /** AK-47 — 突击步枪 */
  'ak47': {
    id: 'ak47',
    name: 'AK-47',
    type: 'rifle',
    damage: 36,
    fireRate: 100,
    magSize: 30,
    reserveAmmo: 90,
    price: 2700,
    spread: 0.03,
    reloadTime: 2500,
    recoilVertical: 1.8,
    recoilHorizontal: 0.8,
    switchTime: 300,
    scopedSpread: null,
  },

  /** M4A4 — 突击步枪 */
  'm4a4': {
    id: 'm4a4',
    name: 'M4A4',
    type: 'rifle',
    damage: 33,
    fireRate: 90,
    magSize: 30,
    reserveAmmo: 90,
    price: 3100,
    spread: 0.025,
    reloadTime: 2500,
    recoilVertical: 1.5,
    recoilHorizontal: 0.6,
    switchTime: 300,
    scopedSpread: null,
  },

  /** AWP — 狙击步枪 */
  'awp': {
    id: 'awp',
    name: 'AWP',
    type: 'sniper',
    damage: 115,
    fireRate: 1500,
    magSize: 10,
    reserveAmmo: 20,
    price: 4750,
    spread: 0,           // 开镜时 0 散布
    reloadTime: 3700,
    recoilVertical: 6.0,
    recoilHorizontal: 1.5,
    switchTime: 300,
    scopedSpread: 0,     // 开镜散布
  },
};

// ── 工具函数 ────────────────────────────────────────────

/**
 * 根据 ID 获取武器数据。
 * @param {string} id — 武器标识符 (如 'ak47')
 * @returns {object|null} 武器数据对象，未找到则返回 null
 */
export function getWeaponData(id) {
  return WEAPONS[id] || null;
}

/**
 * 获取武器价格。
 * @param {string} id — 武器标识符
 * @returns {number} 价格，未找到返回 Infinity
 */
export function getWeaponPrice(id) {
  const data = getWeaponData(id);
  return data ? data.price : Infinity;
}

/**
 * 获取所有武器 ID 列表。
 * @returns {string[]}
 */
export function getAllWeaponIds() {
  return Object.keys(WEAPONS);
}

/**
 * 根据命中点 Y 坐标和目标高度判断命中部位。
 *
 * 假设目标高度为 1.8m (标准玩家高度)。
 * 从脚底 (y=0) 到头顶 (y=1.8):
 *   LEG:    0.0 – 0.6  (下三分之一)
 *   STOMACH: 0.6 – 1.0  (中段)
 *   CHEST:   1.0 – 1.45 (上三分之一的下一半)
 *   HEAD:    1.45 – 1.8 (顶部 ~19%)
 *
 * @param {number} localY — 命中点相对于目标脚底的高度
 * @param {number} targetHeight — 目标总高度 (默认 1.8)
 * @returns {'HEAD'|'CHEST'|'STOMACH'|'LEG'}
 */
export function getBodyPart(localY, targetHeight = 1.8) {
  const ratio = localY / targetHeight;
  if (ratio >= 0.8) return 'HEAD';
  if (ratio >= 0.55) return 'CHEST';
  if (ratio >= 0.33) return 'STOMACH';
  return 'LEG';
}

/**
 * 计算实际伤害 = 基础伤害 × 部位倍率。
 * @param {number} baseDamage   — 武器基础伤害
 * @param {string} bodyPart     — 部位标识 ('HEAD' | 'CHEST' | 'STOMACH' | 'LEG')
 * @returns {number}
 */
export function calculateDamage(baseDamage, bodyPart) {
  const multiplier = DAMAGE_MULTIPLIERS[bodyPart] || 1.0;
  return Math.round(baseDamage * multiplier);
}
