/**
 * weapon-system.js — 武器系统主模块
 *
 * 管理武器库存、射击逻辑、换弹、武器切换、弹药管理和购买。
 * 需要与 Three.js 相机、物理系统和输入管理器协作。
 */

import * as THREE from 'three';
import { RecoilSystem } from 'csgo/weapon/recoil.js';
import {
  getWeaponData,
  getBodyPart,
  calculateDamage,
} from 'csgo/weapon/weapon-data.js';

/** 最大射线检测距离 */
const MAX_SHOOT_DISTANCE = 200;

/** 武器槽位数量 */
const MAX_WEAPON_SLOTS = 5;

export class WeaponSystem {
  /**
   * @param {THREE.Camera} camera   — 玩家相机
   * @param {object}       physics  — PhysicsSystem 实例
   */
  constructor(camera, physics) {
    this._camera = camera;
    this._physics = physics;

    /** 后坐力系统 */
    this._recoil = new RecoilSystem();

    /** @type {RecoilSystem} */
    this.recoil = this._recoil;

    /**
     * 武器库存 — 固定 5 个槽位。
     * null 表示空槽位。
     * @type {Array<object|null>}
     */
    this._inventory = new Array(MAX_WEAPON_SLOTS).fill(null);

    /** 当前选中的武器槽位索引 */
    this._activeIndex = 0;

    /** 武器切换中标志 */
    this._isSwitching = false;
    /** 切换开始时间 */
    this._switchStartTime = 0;
    /** 切换目标索引 */
    this._switchTargetIndex = 0;
    /** 切换动画耗时 (ms) */
    this._switchTime = 300;

    /** 玩家金钱 */
    this._money = 800;

    /** 上一帧按键状态 (用于边沿检测) */
    this._prevKeys = new Map();

    /** 上一帧鼠标按键状态 */
    this._prevMouseButtons = new Map();

    // 默认初始武器: USP-S
    this._equipInitialWeapon('usps');

    /** 上一帧射击结果 */
    this._lastShootResult = null;

    // 散布计算临时向量 (减少 GC 压力)
    this._spreadForward = new THREE.Vector3();
    this._spreadRight = new THREE.Vector3();
    this._spreadUp = new THREE.Vector3();
    this._spreadOffset = new THREE.Vector3();
  }

  // ── 公开属性 ──────────────────────────────────────────

  /** @returns {number} */
  get currentAmmo() {
    const slot = this._getActiveSlot();
    return slot ? slot.currentAmmo : 0;
  }

  /** @returns {number} */
  get maxAmmo() {
    const slot = this._getActiveSlot();
    return slot ? slot.weaponData.magSize : 0;
  }

  /** @returns {number} */
  get reserveAmmo() {
    const slot = this._getActiveSlot();
    return slot ? slot.reserveAmmo : 0;
  }

  /** @returns {object|null} */
  get currentWeapon() {
    const slot = this._getActiveSlot();
    return slot ? slot.weaponData : null;
  }

  /** @returns {number} */
  get activeIndex() {
    return this._activeIndex;
  }

  /** @returns {number} */
  get money() {
    return this._money;
  }

  /** @returns {boolean} */
  get isReloading() {
    const slot = this._getActiveSlot();
    return slot ? slot.isReloading : false;
  }

  /** @returns {boolean} */
  get isSwitching() {
    return this._isSwitching;
  }

  /** @returns {Array<object|null>} */
  get inventory() {
    return this._inventory;
  }

  // ── 帧更新 ────────────────────────────────────────────

  /**
   * 每帧调用。
   * @param {number} dt     — delta time (秒)
   * @param {object} input  — InputManager 实例
   * @param {object} player — PlayerController 实例
   */
  update(dt, input, player) {
    const now = performance.now();

    // 清除上一帧射击结果
    this._lastShootResult = null;

    // 1. 更新后坐力恢复
    this._recoil.update(dt);

    // 2. 检查换弹完成
    this._checkReloadComplete(now);

    // 3. 检查武器切换完成
    this._checkSwitchComplete(now);

    // 如果在切换武器中，不允许射击/换弹
    if (this._isSwitching) {
      this._saveKeyStates(input);
      return;
    }

    // 4. 处理武器切换 (数字键 1-5)
    this._handleWeaponSwitch(input, now);

    // 5. 处理换弹 (R 键)
    this._handleReload(input, now);

    // 6. 处理射击 (鼠标左键)
    this._handleShoot(input, now, player);

    // 保存当前帧按键状态
    this._saveKeyStates(input);
  }

  // ── 射击 ──────────────────────────────────────────────

  /**
   * 执行一次射击。
   * @param {THREE.Camera} [camera]  — 可选
   * @param {object}       [physics] — 可选
   * @returns {{hit: boolean, point: THREE.Vector3, distance: number, damage: number, bodyPart: string}|null}
   */
  shoot(camera, physics) {
    const cam = camera || this._camera;
    const phys = physics || this._physics;
    const now = performance.now();
    const slot = this._getActiveSlot();

    if (!slot) return null;

    const { weaponData } = slot;

    if (now - slot.lastShotTime < weaponData.fireRate) return null;
    if (slot.currentAmmo <= 0) return null;

    slot.lastShotTime = now;

    const direction = new THREE.Vector3();
    cam.getWorldDirection(direction);

    const spreadDir = this._applySpread(direction, weaponData);

    const origin = cam.position.clone();
    const hit = phys.raycast(origin, spreadDir, MAX_SHOOT_DISTANCE);

    this._recoil.applyRecoil(weaponData);
    slot.currentAmmo--;

    if (hit) {
      const bodyPart = this._determineBodyPart(hit);
      const damage = calculateDamage(weaponData.damage, bodyPart);
      return {
        hit: true,
        point: hit.point,
        distance: hit.distance,
        object: hit.object,
        damage,
        bodyPart,
      };
    }

    return {
      hit: false,
      point: null,
      distance: MAX_SHOOT_DISTANCE,
      object: null,
      damage: 0,
      bodyPart: null,
    };
  }

  // ── 换弹 ──────────────────────────────────────────────

  /** 开始换弹 */
  startReload() {
    const slot = this._getActiveSlot();
    if (!slot) return;
    if (slot.currentAmmo >= slot.weaponData.magSize) return;
    if (slot.reserveAmmo <= 0) return;
    if (slot.isReloading) return;

    slot.isReloading = true;
    slot.reloadStartTime = performance.now();
  }

  /** 完成换弹 */
  finishReload() {
    const slot = this._getActiveSlot();
    if (!slot || !slot.isReloading) return;

    const { weaponData } = slot;
    const needed = weaponData.magSize - slot.currentAmmo;
    const available = Math.min(needed, slot.reserveAmmo);

    slot.currentAmmo += available;
    slot.reserveAmmo -= available;
    slot.isReloading = false;
    slot.reloadStartTime = 0;
  }

  // ── 武器切换 ──────────────────────────────────────────

  /**
   * 切换到指定索引的武器。
   * @param {number} index — 槽位索引 (0-4)
   */
  switchWeapon(index) {
    if (index === this._activeIndex) return;
    if (index < 0 || index >= MAX_WEAPON_SLOTS) return;
    if (!this._inventory[index]) return;
    if (this._isSwitching) return;

    const currentSlot = this._getActiveSlot();
    if (currentSlot) {
      currentSlot.isReloading = false;
      currentSlot.reloadStartTime = 0;
    }

    this._isSwitching = true;
    this._switchStartTime = performance.now();
    this._switchTargetIndex = index;
    this._switchTime = this._inventory[index].weaponData.switchTime || 300;
    this._recoil.reset();
  }

  // ── 购买 ──────────────────────────────────────────────

  /**
   * 购买武器。
   * @param {string} weaponId
   * @returns {{success: boolean, message: string}}
   */
  buyWeapon(weaponId) {
    const weaponData = getWeaponData(weaponId);
    if (!weaponData) {
      return { success: false, message: `未知武器: ${weaponId}` };
    }

    if (this._money < weaponData.price) {
      return { success: false, message: `金钱不足！需要 $${weaponData.price}，当前 $${this._money}` };
    }

    this._money -= weaponData.price;
    this.equipWeapon(weaponData);

    return { success: true, message: `购买 ${weaponData.name} 成功` };
  }

  /**
   * 装备武器数据。
   * @param {object} weaponData
   */
  equipWeapon(weaponData) {
    const slot = this._createWeaponSlot(weaponData);

    // 1. 优先替换同类型武器
    for (let i = 0; i < MAX_WEAPON_SLOTS; i++) {
      if (this._inventory[i] && this._inventory[i].weaponData.type === weaponData.type) {
        this._inventory[i] = slot;
        if (i === this._activeIndex) this._recoil.reset();
        return;
      }
    }

    // 2. 寻找空槽位
    for (let i = 0; i < MAX_WEAPON_SLOTS; i++) {
      if (!this._inventory[i]) {
        this._inventory[i] = slot;
        return;
      }
    }

    // 3. 替换当前槽位
    this._inventory[this._activeIndex] = slot;
    this._recoil.reset();
  }

  // ── 后坐力 ────────────────────────────────────────────

  /** @returns {{x: number, y: number}} */
  getRecoilOffset() { return this._recoil.getRecoilOffset(); }
  /** @returns {{x: number, y: number}} */
  getRecoilOffsetRad() { return this._recoil.getRecoilOffsetRad(); }

  /** 添加金钱 */
  addMoney(amount) { this._money += amount; }

  /** @returns {object|null} 上一帧射击结果 */
  getLastShootResult() { return this._lastShootResult; }

  // ── 私有方法 ──────────────────────────────────────────

  /** @returns {object|null} */
  _getActiveSlot() { return this._inventory[this._activeIndex] || null; }

  /** @param {string} weaponId */
  _equipInitialWeapon(weaponId) {
    const weaponData = getWeaponData(weaponId);
    if (weaponData) {
      this._inventory[0] = this._createWeaponSlot(weaponData);
    }
  }

  /** @param {object} weaponData @returns {object} */
  _createWeaponSlot(weaponData) {
    return {
      weaponData,
      currentAmmo: weaponData.magSize,
      reserveAmmo: weaponData.reserveAmmo,
      lastShotTime: 0,
      isReloading: false,
      reloadStartTime: 0,
    };
  }

  /**
   * 在射击方向上应用散布偏移 (复用临时向量)。
   * @param {THREE.Vector3} direction
   * @param {object} weaponData
   * @returns {THREE.Vector3}
   */
  _applySpread(direction, weaponData) {
    const spread = weaponData.spread;

    if (spread <= 0) {
      return direction.clone().normalize();
    }

    const forward = this._spreadForward.copy(direction).normalize();
    const right = this._spreadRight;
    if (Math.abs(forward.y) > 0.999) {
      right.set(1, 0, 0).cross(forward).normalize();
    } else {
      right.set(0, 1, 0).cross(forward).normalize();
    }
    const up = this._spreadUp.crossVectors(right, forward).normalize();

    const angle = Math.random() * spread;
    const phi = Math.random() * Math.PI * 2;

    const offset = this._spreadOffset
      .set(0, 0, 0)
      .addScaledVector(right, Math.sin(angle) * Math.cos(phi))
      .addScaledVector(up, Math.sin(angle) * Math.sin(phi));

    return forward.add(offset).normalize();
  }

  /**
   * 根据命中信息判断命中部位。
   * @param {{point: THREE.Vector3, object: object}} hit
   * @returns {string}
   */
  _determineBodyPart(hit) {
    if (!hit || !hit.object) return 'CHEST';

    const obj = hit.object;
    const hitY = hit.point.y;
    const objBottom = obj.position.y - obj.size.y / 2;
    const localY = hitY - objBottom;

    return getBodyPart(localY, obj.size.y);
  }

  /** @param {number} now */
  _checkReloadComplete(now) {
    const slot = this._getActiveSlot();
    if (!slot || !slot.isReloading) return;

    const elapsed = now - slot.reloadStartTime;
    if (elapsed >= slot.weaponData.reloadTime) {
      this.finishReload();
    }
  }

  /** @param {number} now */
  _checkSwitchComplete(now) {
    if (!this._isSwitching) return;

    const elapsed = now - this._switchStartTime;
    if (elapsed >= this._switchTime) {
      this._activeIndex = this._switchTargetIndex;
      this._isSwitching = false;
      this._switchTargetIndex = 0;
    }
  }

  /** @param {object} input @param {number} now @param {object} player */
  _handleShoot(input, now, player) {
    const slot = this._getActiveSlot();
    if (!slot) return;
    if (slot.isReloading) return;

    const isMouseDown = input.isMouseDown(0);
    if (!isMouseDown) return;

    const result = this.shoot();
    this._lastShootResult = result;
  }

  /** @param {object} input @param {number} now */
  _handleReload(input, now) {
    const slot = this._getActiveSlot();
    if (!slot) return;
    if (slot.isReloading) return;

    const rDown = input.isKeyDown('r');
    const rWasDown = this._prevKeys.get('r') || false;

    if (rDown && !rWasDown) {
      this.startReload();
    }
  }

  /** @param {object} input @param {number} now */
  _handleWeaponSwitch(input, now) {
    const keyMap = ['1', '2', '3', '4', '5'];

    for (let i = 0; i < keyMap.length; i++) {
      const key = keyMap[i];
      const keyDown = input.isKeyDown(key);
      const wasDown = this._prevKeys.get(key) || false;

      if (keyDown && !wasDown && this._inventory[i]) {
        this.switchWeapon(i);
        break;
      }
    }
  }

  /** @param {object} input */
  _saveKeyStates(input) {
    const keys = ['r', '1', '2', '3', '4', '5'];
    for (const key of keys) {
      this._prevKeys.set(key, input.isKeyDown(key));
    }
    this._prevMouseButtons.set(0, input.isMouseDown(0));
  }

  /** @returns {Array} */
  getWeaponSlotsInfo() {
    return this._inventory.map((slot, i) => ({
      index: i,
      name: slot ? slot.weaponData.name : '',
      isActive: i === this._activeIndex,
      isEmpty: !slot,
    }));
  }

  /** @returns {object|null} */
  getCurrentWeaponState() {
    const slot = this._getActiveSlot();
    if (!slot) return null;

    return {
      name: slot.weaponData.name,
      currentAmmo: slot.currentAmmo,
      maxAmmo: slot.weaponData.magSize,
      reserveAmmo: slot.reserveAmmo,
      isReloading: slot.isReloading,
      isSwitching: this._isSwitching,
      money: this._money,
    };
  }

  /** 重置所有武器状态 */
  reset() {
    this._recoil.reset();
    for (const slot of this._inventory) {
      if (slot) {
        slot.isReloading = false;
        slot.reloadStartTime = 0;
      }
    }
    this._isSwitching = false;
  }
}
