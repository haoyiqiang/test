/**
 * DUST2_MAP — 简化版 Dust II 地图数据
 *
 * 坐标系: Y 轴向上, 地面 y=0, 地图 80x80 单位, 墙壁高度 3m。
 * 颜色方案: CT 区蓝色调, T 区红色调, 中路灰色。
 *
 * 布局 (俯视图, Z 轴向下):
 *
 *        -40               0               +40
 *   -40 ┌─────────────────────────────────────────┐
 *       │              │              │            │
 *       │   CT SPAWN   │   A SITE     │  B SITE    │
 *       │   (Blue)     │  (Lt Blue)   │ (Lt Blue)  │
 *   -15 ├──────┬───────┼──────┬───────┼──────┬─────┤
 *       │      │ A Door│      │       │B Door│     │
 *       │ Long │       │ SHORT│  CAT  │      │  B  │
 *       │  A   │       │      │       │      │TUNN. │
 *   0   │      │       ├──────┴───────┤      │     │
 *       │      │       │              │      │     │
 *   15  ├──────┴───────┤     MID      ├──────┴─────┤
 *       │              │              │            │
 *       │              ├──────┬───────┤            │
 *       │              │ Mid  │       │            │
 *       │              │ Door │       │            │
 *       │     T SPAWN (Red)   │       │            │
 *   40  └─────────────────────┴───────┴────────────┘
 *
 * 出入口:
 *   CT Spawn → A Site (x=-10, z≈[-22,-18] 缺口)
 *   CT Spawn → CT Mid  (z=-15, x≈[-22,-18] 缺口)
 *   A Site ↔ Short/Cat (z=-15, x≈[-3,3] A Ramp)
 *   Short/Cat ↔ Mid    (z=0,   x≈[-3,3] CT Mid)
 *   Long A ↔ A Site    (x=-10, z≈[-12,-6] A Doors)
 *   Mid ↔ T Spawn      (z=15,  x≈[-3,3] Mid Doors)
 *   T Spawn → Long A   (z=15,  x≈[-22,-18] 入口)
 *   T Spawn → B Tunnels(z=15,  x≈[18,26] 入口)
 *   B Tunnels ↔ B Site (z=-15, x≈[16,24] B Doors)
 */

// ── 颜色常量 ────────────────────────────────────────────────

/** CT 区域墙壁颜色 (深蓝灰) */
const CT_WALL = 0x4a6b8a;
/** A/B 包点区域墙壁颜色 (浅蓝灰) */
const SITE_WALL = 0x5a7b9a;
/** T 区域墙壁颜色 (暗红褐) */
const T_WALL = 0x8a4a3a;
/** 中路/走廊墙壁颜色 (灰色) */
const MID_WALL = 0x7a7a7a;
/** 外边界墙壁颜色 */
const BOUNDARY_WALL = 0x666666;

/** CT 出生点地板颜色 */
const CT_FLOOR = 0x4a5a6a;
/** A 包点地板颜色 */
const A_FLOOR = 0x5a6a7a;
/** B 包点地板颜色 */
const B_FLOOR = 0x6a7a8a;
/** T 出生点地板颜色 */
const T_FLOOR = 0x8a6a5a;
/** 长 A 走廊地板颜色 */
const LONG_A_FLOOR = 0x6a6a6a;
/** 中路地板颜色 */
const MID_FLOOR = 0x7a7a7a;
/** B 洞地板颜色 */
const B_TUNNEL_FLOOR = 0x656565;
/** 短廊/猫道地板颜色 */
const SHORT_FLOOR = 0x707070;

// ── 道具颜色 ────────────────────────────────────────────────

const CRATE_COLOR = 0x8b7355;
const BARREL_COLOR = 0x5a5a4a;

// ── 墙壁数据 ────────────────────────────────────────────────
//
// 每面墙: { x, z, w, d, color }
//   x, z — BoxGeometry 中心坐标 (XZ平面)
//   w    — X方向宽度
//   d    — Z方向深度 (厚度)
//   color— 材质颜色
// 所有墙壁 y=1.5, 高度=3 (默认)

/** @type {Array<{x: number, z: number, w: number, d: number, color: number}>} */
const WALLS = [
  // ═══════ 外边界墙壁 ═══════
  { x: 0,   z: -40, w: 80, d: 1, color: BOUNDARY_WALL },  // 北墙
  { x: 0,   z: 40,  w: 80, d: 1, color: BOUNDARY_WALL },  // 南墙
  { x: -40, z: 0,   w: 1,  d: 80, color: BOUNDARY_WALL },  // 西墙
  { x: 40,  z: 0,   w: 1,  d: 80, color: BOUNDARY_WALL },  // 东墙

  // ═══════ 水平分隔墙 (z=-15) ═══════
  // CT Spawn 南墙: 左半段 (x∈[-40,-22]) + 右半段 (x∈[-18,-10]), 中间缺口 CT→Mid
  { x: -31, z: -15, w: 18, d: 0.5, color: CT_WALL },
  { x: -14, z: -15, w: 8,  d: 0.5, color: CT_WALL },
  // A Site 南墙: 左半段 (x∈[-10,-3]) + 右半段 (x∈[3,10]), 中间缺口 A Ramp
  { x: -6.5, z: -15, w: 7,  d: 0.5, color: SITE_WALL },
  { x: 6.5,  z: -15, w: 7,  d: 0.5, color: SITE_WALL },
  // B Site 南墙: 左半段 (x∈[10,16]) + 右半段 (x∈[24,40]), 中间缺口 B Doors
  { x: 13,   z: -15, w: 6,  d: 0.5, color: SITE_WALL },
  { x: 32,   z: -15, w: 16, d: 0.5, color: SITE_WALL },

  // ═══════ 水平分隔墙 (z=0): Short/Cat ↔ Mid ═══════
  { x: -6,   z: 0,   w: 8,  d: 0.5, color: MID_WALL },
  { x: 6,    z: 0,   w: 8,  d: 0.5, color: MID_WALL },

  // ═══════ 水平分隔墙 (z=15): 中路/长廊 ↔ T Spawn ═══════
  // Long A 南墙: 左半段 (x∈[-40,-22]) + 右半段 (x∈[-18,-10]), 缺口 T→Long A
  { x: -31,  z: 15,  w: 18, d: 0.5, color: MID_WALL },
  { x: -14,  z: 15,  w: 8,  d: 0.5, color: MID_WALL },
  // Mid 南墙: 左半段 (x∈[-10,-3]) + 右半段 (x∈[3,10]), 缺口 Mid Doors
  { x: -6.5, z: 15,  w: 7,  d: 0.5, color: MID_WALL },
  { x: 6.5,  z: 15,  w: 7,  d: 0.5, color: MID_WALL },
  // B Tunnels 南墙: 左半段 (x∈[10,18]) + 右半段 (x∈[26,40]), 缺口 T→B
  { x: 14,   z: 15,  w: 8,  d: 0.5, color: MID_WALL },
  { x: 33,   z: 15,  w: 14, d: 0.5, color: MID_WALL },

  // ═══════ 垂直分隔墙 (x=-10): 左路 ↔ 中路 ═══════
  // CT Spawn 东墙: 上段 (z∈[-40,-22]) + 下段 (z∈[-18,-15]), 缺口 CT→A Site
  { x: -10,  z: -31,  w: 0.5, d: 18,  color: CT_WALL },
  { x: -10,  z: -16.5, w: 0.5, d: 3,   color: CT_WALL },
  // Long A 东墙: z∈[-15,15] 但有 A Doors 缺口 (z∈[-12,-6])
  { x: -10,  z: -13.5, w: 0.5, d: 3,   color: MID_WALL },
  { x: -10,  z: 4.5,   w: 0.5, d: 21,  color: MID_WALL },

  // ═══════ 垂直分隔墙 (x=10): 中路 ↔ 右路 ═══════
  // A Site ↔ B Site 分隔 (z∈[-40,-15])
  { x: 10,   z: -27.5, w: 0.5, d: 25,  color: SITE_WALL },
  // B Tunnels 西墙: z∈[-15,0]
  { x: 10,   z: -7.5,  w: 0.5, d: 15,  color: MID_WALL },
  // B Tunnels 西墙: z∈[0,15]
  { x: 10,   z: 7.5,   w: 0.5, d: 15,  color: MID_WALL },

  // ═══════ 内部掩体 ═══════
  // CT Spawn
  { x: -30, z: -30, w: 4, d: 4, color: CT_WALL },
  { x: -15, z: -30, w: 3, d: 3, color: CT_WALL },
  // T Spawn
  { x: -20, z: 28, w: 4, d: 4, color: T_WALL },
  { x: 0,   z: 28, w: 3, d: 3, color: T_WALL },
  { x: 20,  z: 28, w: 4, d: 4, color: T_WALL },
  // Mid
  { x: -5,  z: 8,  w: 2, d: 2, color: MID_WALL },
  { x: 5,   z: 8,  w: 2, d: 2, color: MID_WALL },
];

// ── 地板数据 ────────────────────────────────────────────────

/** @type {Array<{x: number, z: number, w: number, d: number, color: number}>} */
const FLOORS = [
  { x: -25, z: -27.5, w: 30, d: 25,  color: CT_FLOOR },       // CT Spawn
  { x: 0,   z: -27.5, w: 20, d: 25,  color: A_FLOOR },        // A 包点
  { x: 25,  z: -27.5, w: 30, d: 25,  color: B_FLOOR },        // B 包点
  { x: -25, z: 2.5,   w: 30, d: 25,  color: LONG_A_FLOOR },   // Long A
  { x: 0,   z: -7.5,  w: 20, d: 15,  color: SHORT_FLOOR },    // Short/Cat
  { x: 0,   z: 7.5,   w: 20, d: 15,  color: MID_FLOOR },      // Mid
  { x: 25,  z: 2.5,   w: 30, d: 25,  color: B_TUNNEL_FLOOR }, // B Tunnels
  { x: 0,   z: 27.5,  w: 80, d: 25,  color: T_FLOOR },        // T Spawn
];

// ── 出生点 ──────────────────────────────────────────────────

/** @type {{ct: Array<{x: number, y: number, z: number, rot: number}>, t: Array<{x: number, y: number, z: number, rot: number}>}} */
const SPAWN_POINTS = {
  ct: [
    { x: -32, y: 0, z: -35, rot: 0 },
    { x: -20, y: 0, z: -35, rot: 0 },
    { x: -32, y: 0, z: -25, rot: Math.PI / 4 },
    { x: -20, y: 0, z: -25, rot: Math.PI / 4 },
    { x: -32, y: 0, z: -20, rot: Math.PI / 2 },
  ],
  t: [
    { x: -28, y: 0, z: 32, rot: Math.PI },
    { x: -10, y: 0, z: 32, rot: Math.PI },
    { x: 10,  y: 0, z: 32, rot: Math.PI },
    { x: 28,  y: 0, z: 32, rot: Math.PI },
    { x: 0,   y: 0, z: 32, rot: Math.PI },
  ],
};

// ── 炸弹点 ──────────────────────────────────────────────────

/** @type {{a: {x: number, z: number, radius: number}, b: {x: number, z: number, radius: number}}} */
const BOMB_SITES = {
  a: { x: 0,  z: -30, radius: 8 },
  b: { x: 25, z: -30, radius: 8 },
};

// ── 道具/装饰物 ─────────────────────────────────────────────

/** @type {Array<{type: string, x: number, z: number, w: number, d: number, h: number, color: number}>} */
const PROPS = [
  // A 包点箱子
  { type: 'box', x: -4, z: -30, w: 2, d: 2, h: 1.5, color: CRATE_COLOR },
  { type: 'box', x: 4,  z: -30, w: 2, d: 2, h: 1,   color: CRATE_COLOR },
  { type: 'box', x: 0,  z: -34, w: 3, d: 1, h: 1.2, color: BARREL_COLOR },
  // B 包点箱子
  { type: 'box', x: 21, z: -30, w: 2, d: 2, h: 1.5, color: CRATE_COLOR },
  { type: 'box', x: 29, z: -30, w: 2, d: 2, h: 1,   color: CRATE_COLOR },
  { type: 'box', x: 25, z: -34, w: 3, d: 1, h: 1.2, color: BARREL_COLOR },
  // CT Spawn 装饰
  { type: 'box', x: -35, z: -22, w: 1, d: 1, h: 1, color: CRATE_COLOR },
  { type: 'box', x: -25, z: -22, w: 1, d: 1, h: 1, color: BARREL_COLOR },
  // T Spawn 装饰
  { type: 'box', x: -35, z: 22, w: 1, d: 1, h: 1, color: CRATE_COLOR },
  { type: 'box', x: -15, z: 22, w: 2, d: 1, h: 1, color: BARREL_COLOR },
  { type: 'box', x: 15,  z: 22, w: 1, d: 1, h: 1, color: CRATE_COLOR },
  { type: 'box', x: 35,  z: 22, w: 2, d: 1, h: 1, color: BARREL_COLOR },
  // Mid 装饰
  { type: 'box', x: -8, z: 10, w: 1, d: 1, h: 0.8, color: CRATE_COLOR },
  { type: 'box', x: 8,  z: 10, w: 1, d: 1, h: 0.8, color: BARREL_COLOR },
  // Long A 装饰
  { type: 'box', x: -35, z: 5, w: 2, d: 1, h: 1, color: CRATE_COLOR },
  // B Tunnels 装饰
  { type: 'box', x: 35, z: 5, w: 2, d: 1, h: 1, color: BARREL_COLOR },
];

// ── 导出 ────────────────────────────────────────────────────

export const DUST2_MAP = {
  name: 'Dust II (Simplified)',
  size: { width: 80, depth: 80, height: 3 },
  walls: WALLS,
  floors: FLOORS,
  spawnPoints: SPAWN_POINTS,
  bombSites: BOMB_SITES,
  props: PROPS,
};
