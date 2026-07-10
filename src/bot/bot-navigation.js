import * as THREE from 'three';
import { NavMesh } from 'csgo/map/navmesh.js';

/**
 * BotNavigation — Bot 导航系统
 *
 * 基于 NavMesh 路径点图的寻路与路径跟随。
 * 每个 Bot 实例共享同一个 NavMesh 引用。
 */
export class BotNavigation {
  /**
   * @param {NavMesh} navmesh — NavMesh 实例
   */
  constructor(navmesh) {
    /** @type {NavMesh} */
    this._navmesh = navmesh;
  }

  /**
   * 设置或更新 NavMesh 引用。
   * 供 BotManager 在获取到 NavMesh 实例后注入。
   * @param {NavMesh} navmesh
   */
  setNavmesh(navmesh) {
    this._navmesh = navmesh;
  }

  /**
   * 导航到目标位置。
   * 先查找最近路径点，再用 A* 寻路，将路径写入 bot.currentPath。
   *
   * @param {object} bot            — Bot 对象 (需有 position 属性)
   * @param {THREE.Vector3|{x:number, y:number, z:number}} targetPosition — 目标世界坐标
   * @returns {boolean} 是否成功找到路径
   */
  moveTo(bot, targetPosition) {
    // 查找最近的起点和终点路径点
    const startWp = this._navmesh.getNearestWaypoint(bot.position);
    const endWp = this._navmesh.getNearestWaypoint(targetPosition);

    if (!startWp || !endWp) {
      bot.currentPath = [];
      bot.currentWaypointIdx = 0;
      return false;
    }

    // A* 寻路
    const path = this._navmesh.findPath(startWp.id, endWp.id);

    if (!path || path.length === 0) {
      bot.currentPath = [];
      bot.currentWaypointIdx = 0;
      return false;
    }

    bot.currentPath = path;
    bot.currentWaypointIdx = 0;
    return true;
  }

  /**
   * 沿路径移动 Bot。
   * 到达当前路径点后自动切换到下一个。
   * 所有路径点走完后返回 true。
   *
   * @param {object} bot  — Bot 对象
   * @param {number} dt   — delta time (秒)
   * @returns {boolean} 是否已走完整个路径
   */
  followPath(bot, dt) {
    const path = bot.currentPath;
    if (!path || path.length === 0) return true;

    // 已走完所有路径点
    if (bot.currentWaypointIdx >= path.length) {
      bot.currentPath = [];
      bot.currentWaypointIdx = 0;
      return true;
    }

    const targetWp = path[bot.currentWaypointIdx];
    const targetPos = new THREE.Vector3(targetWp.position.x, targetWp.position.y, targetWp.position.z);

    // 判断是否到达当前路径点
    if (this.isAtWaypoint(bot, targetPos, 1.0)) {
      bot.currentWaypointIdx++;

      // 到达最后一个路径点
      if (bot.currentWaypointIdx >= path.length) {
        bot.currentPath = [];
        bot.currentWaypointIdx = 0;
        return true;
      }

      // 递归处理下一个路径点 (同一帧内可能已很近)
      return this.followPath(bot, dt);
    }

    // 朝目标移动
    this._moveToward(bot, targetPos, dt);
    return false;
  }

  /**
   * 判断 Bot 是否已到达指定路径点。
   *
   * @param {object} bot                        — Bot 对象
   * @param {THREE.Vector3|{x:number, y:number, z:number}} waypoint — 路径点位置
   * @param {number} [threshold=1.0]            — 到达阈值 (米)
   * @returns {boolean}
   */
  isAtWaypoint(bot, waypoint, threshold = 1.0) {
    const wx = waypoint.x;
    const wy = waypoint.y;
    const wz = waypoint.z;

    const dx = bot.position.x - wx;
    const dy = bot.position.y - wy;
    const dz = bot.position.z - wz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    return dist <= threshold;
  }

  /**
   * 获取指定位置的最近路径点。
   * @param {THREE.Vector3|{x:number, y:number, z:number}} position
   * @returns {object|null}
   */
  getNearestWaypoint(position) {
    return this._navmesh.getNearestWaypoint(position);
  }

  /**
   * 获取随机路径点 (用于巡逻)。
   * @returns {object|null}
   */
  getRandomWaypoint() {
    return this._navmesh.getRandomWaypoint();
  }

  // ── 私有方法 ──────────────────────────────────────────

  /**
   * 将 Bot 朝目标位置移动。
   * 同时更新 bot.yaw 朝向。
   *
   * @param {object} bot                        — Bot 对象
   * @param {THREE.Vector3} targetPos           — 目标位置
   * @param {number} dt                         — delta time (秒)
   */
  _moveToward(bot, targetPos, dt) {
    const dx = targetPos.x - bot.position.x;
    const dz = targetPos.z - bot.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.01) return;

    // 更新朝向
    bot.yaw = Math.atan2(dx, dz);

    // 移动
    const moveDistance = Math.min(bot.speed * dt, dist);
    bot.position.x += (dx / dist) * moveDistance;
    bot.position.z += (dz / dist) * moveDistance;
  }
}
