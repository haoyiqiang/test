/**
 * NavMesh — Bot 导航网格
 *
 * 基于预定义路径点的图搜索，覆盖 Dust II 简化地图的所有可达区域。
 * 使用 A* 算法进行最短路径寻路。
 *
 * 路径点覆盖:
 *   - CT 出生点 (内部 + 出口)
 *   - A 包点 / A 平台
 *   - B 包点 / B 平台
 *   - Long A 走廊 (上/中/下)
 *   - Short / Cat 短廊
 *   - Mid 中路
 *   - B Tunnels (上/中/下)
 *   - T 出生点 (左/中/右)
 *   - 所有关键门口 (A Doors, Mid Doors, B Doors)
 */

// ── 路径点数据 ──────────────────────────────────────────────
//
// 每个路径点:
//   id        — 唯一标识
//   position  — 世界坐标 { x, y, z }
//   neighbors — 相邻路径点 id 列表

/** @type {Array<{id: number, position: {x: number, y: number, z: number}, neighbors: number[]}>} */
const WAYPOINTS = [
  // ═══════ CT Spawn (x∈[-40,-10], z∈[-40,-15]) ═══════
  { id: 0,  position: { x: -32, y: 0, z: -35 }, neighbors: [1] },
  { id: 1,  position: { x: -20, y: 0, z: -22 }, neighbors: [0, 2, 3] },
  // CT → A Site 连接点 (x=-10 墙壁缺口, z∈[-22,-18])
  { id: 2,  position: { x: -10, y: 0, z: -20 }, neighbors: [1, 4] },
  // CT → Long A 出口 (z=-15 墙壁缺口, x∈[-22,-18])
  { id: 3,  position: { x: -20, y: 0, z: -15 }, neighbors: [1, 8] },

  // ═══════ A Site (x∈[-10,10], z∈[-40,-15]) ═══════
  { id: 4,  position: { x: 0,   y: 0, z: -30 }, neighbors: [2, 5, 6] },
  { id: 5,  position: { x: 0,   y: 0, z: -38 }, neighbors: [4] },
  // A Ramp — A Site 与 Short/Cat 之间的缺口 (z=-15, x∈[-3,3])
  { id: 6,  position: { x: 0,   y: 0, z: -15 }, neighbors: [4, 11] },

  // ═══════ A Doors 缺口 (x=-10, z∈[-12,-6]) ═══════
  // 连接 Long A 走廊与 A Site/Short 区域
  { id: 7,  position: { x: -10, y: 0, z: -9  }, neighbors: [8, 11] },

  // ═══════ Long A 走廊 (x∈[-40,-10], z∈[-15,15]) ═══════
  { id: 8,  position: { x: -25, y: 0, z: -9  }, neighbors: [3, 7, 9] },
  { id: 9,  position: { x: -25, y: 0, z: 3   }, neighbors: [8, 10] },
  { id: 10, position: { x: -20, y: 0, z: 13  }, neighbors: [9, 19] },

  // ═══════ Short / Cat 短廊 (x∈[-10,10], z∈[-15,0]) ═══════
  { id: 11, position: { x: 0,   y: 0, z: -9  }, neighbors: [6, 7, 12] },
  { id: 12, position: { x: 0,   y: 0, z: -2  }, neighbors: [11, 13] },

  // ═══════ CT Mid / Mid 中路 (x∈[-10,10], z∈[0,15]) ═══════
  { id: 13, position: { x: 0,   y: 0, z: 3   }, neighbors: [12, 14] },
  { id: 14, position: { x: 0,   y: 0, z: 9   }, neighbors: [13, 15] },
  // Mid Doors — Mid 与 T Spawn 之间的缺口 (z=15, x∈[-3,3])
  { id: 15, position: { x: 0,   y: 0, z: 15  }, neighbors: [14, 16] },

  // ═══════ T Spawn (x∈[-40,40], z∈[15,40]) ═══════
  { id: 16, position: { x: 0,   y: 0, z: 28  }, neighbors: [15, 17, 18] },
  { id: 17, position: { x: -28, y: 0, z: 28  }, neighbors: [16, 19] },
  { id: 18, position: { x: 28,  y: 0, z: 28  }, neighbors: [16, 24] },

  // ═══════ T Spawn 出口 ═══════
  // T → Long A 入口 (z=15 缺口, x∈[-22,-18])
  { id: 19, position: { x: -20, y: 0, z: 15  }, neighbors: [10, 17] },
  // T → B Tunnels 入口 (z=15 缺口, x∈[18,26])
  { id: 24, position: { x: 22,  y: 0, z: 15  }, neighbors: [18, 23] },

  // ═══════ B Doors 缺口 (z=-15, x∈[16,24]) ═══════
  // 连接 B Tunnels 与 B Site
  { id: 20, position: { x: 20,  y: 0, z: -15 }, neighbors: [21, 25] },

  // ═══════ B Tunnels (x∈[10,40], z∈[-15,15]) ═══════
  { id: 21, position: { x: 25,  y: 0, z: -10 }, neighbors: [20, 22] },
  { id: 22, position: { x: 25,  y: 0, z: 3   }, neighbors: [21, 23] },
  { id: 23, position: { x: 25,  y: 0, z: 13  }, neighbors: [22, 24] },

  // ═══════ B Site (x∈[10,40], z∈[-40,-15]) ═══════
  { id: 25, position: { x: 25,  y: 0, z: -30 }, neighbors: [20, 26] },
  { id: 26, position: { x: 25,  y: 0, z: -38 }, neighbors: [25] },
];

// ── NavMesh 类 ──────────────────────────────────────────────

export class NavMesh {
  constructor() {
    /** @type {Map<number, {id: number, position: {x: number, y: number, z: number}, neighbors: number[]}>} */
    this._waypoints = new Map();

    // 索引路径点
    for (const wp of WAYPOINTS) {
      this._waypoints.set(wp.id, wp);
    }
  }

  /**
   * A* 寻路算法 — 在路径点图中寻找最短路径。
   *
   * @param {number} startId — 起始路径点 ID
   * @param {number} endId   — 目标路径点 ID
   * @returns {Array<{id: number, position: {x: number, y: number, z: number}}>|null}
   *          路径点数组 (含起点和终点), 不可达时返回 null
   */
  findPath(startId, endId) {
    const start = this._waypoints.get(startId);
    const end = this._waypoints.get(endId);
    if (!start || !end) return null;
    if (startId === endId) return [start];

    // A* 数据结构
    /** @type {Map<number, number>} gScore: 从起点到该点的实际代价 */
    const gScore = new Map();
    /** @type {Map<number, number>} fScore: gScore + 启发式估计 */
    const fScore = new Map();
    /** @type {Map<number, number>} cameFrom: 回溯路径 */
    const cameFrom = new Map();

    // 优先队列 (简单数组实现, 对于 ~30 个节点足够)
    /** @type {number[]} */
    const openSet = [startId];
    gScore.set(startId, 0);
    fScore.set(startId, this._heuristic(start.position, end.position));

    while (openSet.length > 0) {
      // 取出 fScore 最小的节点
      let currentIdx = 0;
      let currentId = openSet[0];
      let currentF = fScore.get(currentId) ?? Infinity;

      for (let i = 1; i < openSet.length; i++) {
        const id = openSet[i];
        const f = fScore.get(id) ?? Infinity;
        if (f < currentF) {
          currentF = f;
          currentId = id;
          currentIdx = i;
        }
      }

      // 到达目标 — 重建路径
      if (currentId === endId) {
        return this._reconstructPath(cameFrom, currentId);
      }

      // 从 openSet 移除当前节点
      openSet.splice(currentIdx, 1);

      const current = this._waypoints.get(currentId);
      if (!current) continue;

      // 遍历邻居
      for (const neighborId of current.neighbors) {
        const neighbor = this._waypoints.get(neighborId);
        if (!neighbor) continue;

        // 从当前点到邻居的代价 (欧几里得距离)
        const dist = this._distance(current.position, neighbor.position);
        const tentativeG = (gScore.get(currentId) ?? Infinity) + dist;

        if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
          // 找到更优路径
          cameFrom.set(neighborId, currentId);
          gScore.set(neighborId, tentativeG);
          fScore.set(neighborId, tentativeG + this._heuristic(neighbor.position, end.position));

          if (!openSet.includes(neighborId)) {
            openSet.push(neighborId);
          }
        }
      }
    }

    // 不可达
    return null;
  }

  /**
   * 根据世界坐标查找最近的路径点。
   *
   * @param {{x: number, y: number, z: number}} position — 世界坐标
   * @returns {{id: number, position: {x: number, y: number, z: number}, neighbors: number[]}|null}
   */
  getNearestWaypoint(position) {
    let nearest = null;
    let nearestDist = Infinity;

    for (const wp of this._waypoints.values()) {
      const dist = this._distance(position, wp.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = wp;
      }
    }

    return nearest;
  }

  /**
   * 获取随机路径点 (供 Bot 随机巡逻)。
   *
   * @returns {{id: number, position: {x: number, y: number, z: number}, neighbors: number[]}}
   */
  getRandomWaypoint() {
    const ids = Array.from(this._waypoints.keys());
    const randomId = ids[Math.floor(Math.random() * ids.length)];
    return this._waypoints.get(randomId);
  }

  /**
   * 获取指定路径点的邻居列表。
   *
   * @param {number} id — 路径点 ID
   * @returns {Array<{id: number, position: {x: number, y: number, z: number}, neighbors: number[]}>}
   */
  getNeighbors(id) {
    const wp = this._waypoints.get(id);
    if (!wp) return [];

    return wp.neighbors
      .map((nid) => this._waypoints.get(nid))
      .filter(Boolean);
  }

  /**
   * 获取所有路径点。
   * @returns {Array<{id: number, position: {x: number, y: number, z: number}, neighbors: number[]}>}
   */
  getAllWaypoints() {
    return Array.from(this._waypoints.values());
  }

  /**
   * 获取路径点总数。
   * @returns {number}
   */
  getWaypointCount() {
    return this._waypoints.size;
  }

  // ── 内部方法 ────────────────────────────────────────────

  /**
   * 启发式函数 — 欧几里得距离。
   * @param {{x: number, y: number, z: number}} a
   * @param {{x: number, y: number, z: number}} b
   * @returns {number}
   */
  _heuristic(a, b) {
    return this._distance(a, b);
  }

  /**
   * 计算两点之间的欧几里得距离。
   * @param {{x: number, y: number, z: number}} a
   * @param {{x: number, y: number, z: number}} b
   * @returns {number}
   */
  _distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * 从 cameFrom 映射重建路径。
   * @param {Map<number, number>} cameFrom
   * @param {number} currentId
   * @returns {Array<{id: number, position: {x: number, y: number, z: number}}>}
   */
  _reconstructPath(cameFrom, currentId) {
    const path = [];
    let id = currentId;
    const visited = new Set();

    while (id !== undefined && !visited.has(id)) {
      visited.add(id);
      const wp = this._waypoints.get(id);
      if (wp) {
        path.unshift({ id: wp.id, position: { ...wp.position } });
      }
      id = cameFrom.get(id);
    }

    return path;
  }
}
