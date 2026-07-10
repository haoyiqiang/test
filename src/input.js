import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * InputManager — 键盘与鼠标输入管理。
 * 使用 PointerLockControls 处理视角旋转和指针锁定，
 * 同时独立累积鼠标位移供 getMouseDelta() 查询。
 */
export class InputManager {
  /**
   * @param {THREE.Camera} camera
   * @param {HTMLElement}  domElement — 用于绑定事件的 DOM 元素
   */
  constructor(camera, domElement) {
    this._camera = camera;
    this._domElement = domElement;

    // 键盘状态 Map
    this._keys = new Map();

    // 鼠标位移累积 (每帧清零)
    this._mouseDelta = { x: 0, y: 0 };

    // 鼠标按键
    this._mouseButtons = new Map();

    // PointerLockControls — 处理视角旋转 + 指针锁定
    this._controls = new PointerLockControls(camera, domElement);

    // 监听指针锁定变化
    this._controls.addEventListener('lock', () => {
      this._onLock?.();
    });
    this._controls.addEventListener('unlock', () => {
      this._onUnlock?.();
    });

    // 绑定事件
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onClick = this._onClick.bind(this);

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    domElement.addEventListener('click', this._onClick);
  }

  /** @param {() => void} cb */
  onLock(cb) { this._onLock = cb; }
  /** @param {() => void} cb */
  onUnlock(cb) { this._onUnlock = cb; }

  // ── 按键查询 ──────────────────────────────────────────

  /**
   * 检查按键是否处于按下状态。
   * 支持传入 key 标识符 (如 'KeyW', 'Space', 'ShiftLeft', 'ShiftRight')
   * 或简写 ('w', 'space', 'shift').
   * @param {string} key
   * @returns {boolean}
   */
  isKeyDown(key) {
    // 统一转小写简写映射
    const mapped = this._normalizeKey(key);
    return !!this._keys.get(mapped);
  }

  /**
   * 检查鼠标按键是否按下。
   * @param {number} button — 0=左键, 1=中键, 2=右键
   * @returns {boolean}
   */
  isMouseDown(button) {
    return !!this._mouseButtons.get(button);
  }

  // ── 鼠标位移 ──────────────────────────────────────────

  /**
   * 返回从上一帧以来的累积鼠标位移。
   * 每帧 update() 调用后清零。
   * @returns {{x: number, y: number}}
   */
  getMouseDelta() {
    return this._mouseDelta;
  }

  // ── 指针锁定 ──────────────────────────────────────────

  /** @returns {boolean} */
  isPointerLocked() {
    return this._controls.isLocked;
  }

  /** 请求锁定指针 */
  requestLock() {
    this._controls.lock();
  }

  /** 解锁指针 */
  unlock() {
    this._controls.unlock();
  }

  // ── 帧更新 ────────────────────────────────────────────

  /**
   * 每帧调用，重置鼠标位移和按键释放状态。
   * @param {number} _dt — delta time (保留供将来扩展)
   */
  update(_dt) {
    this._mouseDelta.x = 0;
    this._mouseDelta.y = 0;
  }

  // ── 销毁 ──────────────────────────────────────────────

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    this._domElement.removeEventListener('click', this._onClick);
    this._controls.disconnect();
  }

  // ── 私有方法 ──────────────────────────────────────────

  _onKeyDown(e) {
    this._keys.set(e.code, true);
    // 将左右修饰键统一到规范名称
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this._keys.set('Shift', true);
    }
  }
    this._keys.set(e.code, true);
  }

  _onKeyUp(e) {
    this._keys.set(e.code, false);
    // 只有在两个物理 Shift 键都释放后，才清除规范名称
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      if (!this._keys.get('ShiftLeft') && !this._keys.get('ShiftRight')) {
        this._keys.set('Shift', false);
      }
    }
  }
    this._keys.set(e.code, false);
  }

  _onMouseMove(e) {
    if (this._controls.isLocked) {
      this._mouseDelta.x += e.movementX;
      this._mouseDelta.y += e.movementY;
    }
  }

  _onMouseDown(e) {
    this._mouseButtons.set(e.button, true);
  }

  _onMouseUp(e) {
    this._mouseButtons.set(e.button, false);
  }

  _onClick() {
    if (!this._controls.isLocked) {
      this._controls.lock();
    }
  }

  /**
   * 将简写键名映射为 event.code 值。
   * @param {string} key
   * @returns {string}
   */
  _normalizeKey(key) {
    const lower = key.toLowerCase();
    const map = {
      'w': 'KeyW',
      'a': 'KeyA',
      's': 'KeyS',
      'd': 'KeyD',
      'r': 'KeyR',
      'space': 'Space',
      'shift': 'Shift',
      '1': 'Digit1',
      '2': 'Digit2',
      '3': 'Digit3',
      '4': 'Digit4',
      '5': 'Digit5',
    };
    return map[lower] || key;
  }
}
