/**
 * recoil.js — 后坐力系统
 *
 * 模拟武器射击时的后坐力：每次射击累加 punchAngle，
 * 随时间逐渐恢复到零。用于驱动准星偏移和相机抖动。
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export class RecoilSystem {
  constructor() {
    /**
     * 当前后坐力偏移角度 (度)。
     * x: 水平偏移 (正值=右偏)
     * y: 垂直偏移 (正值=上偏)
     */
    this.punchAngle = { x: 0, y: 0 };

    /** 后坐力恢复速度 (度/秒) */
    this.recoverySpeed = 20;

    /** 最大后坐力累积上限 (度) */
    this.maxPunchY = 25;
    this.maxPunchX = 10;
  }

  /**
   * 应用后坐力：根据武器数据累加 punchAngle。
   *
   * 垂直方向向上跳动 (正值表示枪口上抬)，
   * 水平方向随机左右偏移。
   *
   * @param {object} weaponData — 武器数据 (包含 recoilVertical, recoilHorizontal)
   */
  applyRecoil(weaponData) {
    const vert = weaponData.recoilVertical || 0;
    const horiz = weaponData.recoilHorizontal || 0;

    // 垂直上跳
    this.punchAngle.y += vert;

    // 水平随机偏移 (-horiz ~ +horiz)
    this.punchAngle.x += (Math.random() * 2 - 1) * horiz;

    // 限制最大后坐力
    this.punchAngle.y = Math.min(this.punchAngle.y, this.maxPunchY);
    this.punchAngle.x = Math.max(-this.maxPunchX, Math.min(this.maxPunchX, this.punchAngle.x));
  }

  /**
   * 每帧更新：后坐力恢复 (逐渐归零)。
   *
   * @param {number} dt — delta time (秒)
   */
  update(dt) {
    const recovery = this.recoverySpeed * dt;

    // 垂直恢复
    if (this.punchAngle.y > 0) {
      this.punchAngle.y = Math.max(0, this.punchAngle.y - recovery);
    } else if (this.punchAngle.y < 0) {
      this.punchAngle.y = Math.min(0, this.punchAngle.y + recovery);
    }

    // 水平恢复
    if (this.punchAngle.x > 0) {
      this.punchAngle.x = Math.max(0, this.punchAngle.x - recovery);
    } else if (this.punchAngle.x < 0) {
      this.punchAngle.x = Math.min(0, this.punchAngle.x + recovery);
    }
  }

  /**
   * 返回当前后坐力偏移角度 (度)。
   * @returns {{x: number, y: number}}
   */
  getRecoilOffset() {
    return { x: this.punchAngle.x, y: this.punchAngle.y };
  }

  /**
   * 返回当前后坐力偏移角度 (弧度) — 用于直接叠加到 camera.rotation。
   * @returns {{x: number, y: number}}
   */
  getRecoilOffsetRad() {
    return {
      x: this.punchAngle.x * DEG2RAD,
      y: this.punchAngle.y * DEG2RAD,
    };
  }

  /** 重置后坐力为零 */
  reset() {
    this.punchAngle.x = 0;
    this.punchAngle.y = 0;
  }
}
