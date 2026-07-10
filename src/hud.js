import { getAllWeaponIds, getWeaponData, getWeaponPrice } from 'csgo/weapon/weapon-data.js';

// ── 常量 ──────────────────────────────────────────────────

/** 小地图尺寸 (px) */
const MINIMAP_SIZE = 160;

/** 小地图世界坐标范围 */
const MINIMAP_WORLD_SIZE = 80;

/** 击杀提示保留时间 (ms) */
const KILLFEED_LIFETIME = 8000;

/** 击杀提示最大数量 */
const KILLFEED_MAX = 5;

/** 伤害指示器持续时间 (ms) */
const DAMAGE_INDICATOR_DURATION = 400;

/** 武器按类别分组配置 */
const WEAPON_CATEGORIES = [
  { key: 'pistol',  label: '手枪' },
  { key: 'rifle',   label: '步枪' },
  { key: 'sniper',  label: '狙击' },
];

// ── HUD 类 ─────────────────────────────────────────────

/**
 * HUD — 游戏抬头显示界面
 *
 * 使用 HTML/CSS 叠加在 Canvas 上，显示所有游戏信息。
 *
 * 用法:
 *   const hud = new HUD();
 *   // 在游戏循环中:
 *   hud.update(player, weaponSystem, gameState);
 *   // 击杀提示:
 *   hud.showKillMessage('你', 'Bot 1', 'AK-47');
 *   // 伤害指示:
 *   hud.showDamageIndicator(Math.PI / 2); // 来自右侧
 */
export class HUD {
  constructor() {
    /** 购买菜单是否打开 */
    this._buyMenuOpen = false;

    /** 指针锁定恢复回调 */
    this._onBuyMenuClose = null;

    // ── 创建所有 DOM 元素 ──────────────────────────
    this._createRoot();
    this._createMinimap();
    this._createCrosshair();
    this._createBottomLeft();
    this._createBottomRight();
    this._createTopRight();
    this._createTimer();
    this._createDamageIndicator();
    this._createBuyMenu();

    // ── 绑定 B 键 ──────────────────────────────────
    this._onKeyDown = this._onKeyDown.bind(this);
    document.addEventListener('keydown', this._onKeyDown);

    // ── 购买菜单点击处理 ───────────────────────────
    this._buyMenuEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-weapon-id]');
      if (btn) {
        const weaponId = btn.dataset.weaponId;
        if (this._onBuyWeapon) {
          this._onBuyWeapon(weaponId);
        }
      }
    });

    // ── 回调引用 ───────────────────────────────────
    /** @type {function(string): void|null} 武器购买回调 */
    this._onBuyWeapon = null;
  }

  // ── 公共方法 ──────────────────────────────────────────

  /**
   * 每帧更新所有 HUD 元素。
   *
   * @param {object} player       — PlayerController 实例
   * @param {object} weaponSystem — WeaponSystem 实例
   * @param {object} gameState    — GameState 实例
   */
  update(player, weaponSystem, gameState) {
    if (!player || !weaponSystem || !gameState) return;

    // 准星 — 根据后坐力扩散
    if (weaponSystem.recoil) {
      this._updateCrosshair(weaponSystem.recoil);
    }

    // 血量 / 护甲
    this._updateHealthArmor(player.health || 0, player.armor || 0);

    // 弹药
    const currentAmmo = weaponSystem.currentAmmo ?? 0;
    const maxAmmo = weaponSystem.maxAmmo ?? 1;
    const reserveAmmo = weaponSystem.reserveAmmo ?? 0;
    this._updateAmmo(currentAmmo, maxAmmo, reserveAmmo);

    // 武器名
    const wp = weaponSystem.currentWeapon;
    this._updateWeaponName(wp ? wp.name : '—');

    // 金钱
    this._updateMoney(gameState.money ?? 0);

    // 小地图
    if (gameState.phase && gameState.phase !== 'warmup') {
      const botPositions = this._extractBotPositions(gameState);
      const playerForward = player.getForward ? player.getForward() : null;
      this._updateMinimap(player.position, playerForward, botPositions);
    }

    // 击杀提示
    this._updateKillfeed(gameState.killfeed || []);

    // 比分
    this._updateScore(gameState);

    // 倒计时
    this._updateTimer(gameState);

    // 清理过期击杀提示

    // 购买菜单刷新 (仅在打开时)
    if (this._buyMenuOpen) {
      const currentType = weaponSystem.currentWeapon?.type || null;
      this.refreshBuyMenu(gameState.money ?? 0, currentType);
    }
    this._pruneKillfeedDOM();
  }

  /**
   * 显示击杀消息。
   * @param {string} killer — 击杀者名称
   * @param {string} victim — 被击杀者名称
   * @param {string} weapon — 武器名称
   * @param {boolean} [isHeadshot=false] — 是否爆头
   */
  showKillMessage(killer, victim, weapon, isHeadshot = false) {
    this._addKillfeedEntry(killer, victim, weapon, isHeadshot);
  }

  /**
   * 显示伤害方向指示器。
   * @param {number} angle — 伤害来源方向 (弧度，0 = 前方)
   */
  showDamageIndicator(angle) {
    this._showDamageFlash(angle);
  }

  /**
   * 切换购买菜单。
   */
  toggleBuyMenu() {
    if (this._buyMenuOpen) {
      this._closeBuyMenu();
    } else {
      this._openBuyMenu();
    }
  }

  /**
   * 购买菜单是否打开。
   * @returns {boolean}
   */
  isBuyMenuOpen() {
    return this._buyMenuOpen;
  }

  /**
   * 注册购买武器回调。
   * @param {function(string): void} callback — 接收 weaponId
   */
  onBuyWeapon(callback) {
    this._onBuyWeapon = callback;
  }

  /**
   * 注册购买菜单关闭回调 (用于恢复指针锁定)。
   * @param {function(): void} callback
   */
  onBuyMenuClose(callback) {
    this._onBuyMenuClose = callback;
  }

  /**
   * 更新购买菜单中的武器状态 (价格、是否可购买、当前金钱)。
   * @param {number} money   — 当前金钱
   * @param {string} currentWeaponType — 当前装备武器类型
   */
  refreshBuyMenu(money, currentWeaponType) {
    this._updateBuyMenuItems(money, currentWeaponType);
  }

  /**
   * 销毁 HUD，移除所有 DOM 元素和事件监听。
   */
  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    clearTimeout(this._damageTimer);
    if (this._root) {
      this._root.remove();
      this._root = null;
    }
  }

  // ── 私有: 创建 DOM 结构 ───────────────────────────────

  /** 创建根容器 */
  _createRoot() {
    this._root = document.createElement('div');
    this._root.id = 'hud-root';
    Object.assign(this._root.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      pointerEvents: 'none',
      zIndex: '100',
      fontFamily: "'Segoe UI', Arial, sans-serif",
      color: '#fff',
      userSelect: 'none',
    });
    document.body.appendChild(this._root);
  }

  /** 创建小地图 canvas */
  _createMinimap() {
    const wrapper = document.createElement('div');
    wrapper.id = 'hud-minimap';
    Object.assign(wrapper.style, {
      position: 'absolute',
      bottom: '24px',
      left: '24px',
      width: `${MINIMAP_SIZE}px`,
      height: `${MINIMAP_SIZE}px`,
      borderRadius: '8px',
      overflow: 'hidden',
      border: '2px solid rgba(255,255,255,0.3)',
      backgroundColor: 'rgba(0,0,0,0.6)',
    });

    this._minimapCanvas = document.createElement('canvas');
    this._minimapCanvas.width = MINIMAP_SIZE;
    this._minimapCanvas.height = MINIMAP_SIZE;
    this._minimapCanvas.style.width = '100%';
    this._minimapCanvas.style.height = '100%';

    this._minimapCtx = this._minimapCanvas.getContext('2d');

    wrapper.appendChild(this._minimapCanvas);
    this._root.appendChild(wrapper);
  }

  /** 创建准星 */
  _createCrosshair() {
    const container = document.createElement('div');
    container.id = 'hud-crosshair';
    Object.assign(container.style, {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '40px',
      height: '40px',
    });

    // 4 条准星线
    const directions = [
      { id: 'ch-top',    top: '0',    left: '50%', width: '2px', height: '10px', x: '-1px', y: '0' },
      { id: 'ch-bottom', bottom: '0', left: '50%', width: '2px', height: '10px', x: '-1px', y: '0' },
      { id: 'ch-left',   left: '0',   top: '50%',  width: '10px', height: '2px', x: '0', y: '-1px' },
      { id: 'ch-right',  right: '0',  top: '50%',  width: '10px', height: '2px', x: '0', y: '-1px' },
    ];

    this._crosshairLines = {};

    for (const d of directions) {
      const line = document.createElement('div');
      line.id = d.id;
      Object.assign(line.style, {
        position: 'absolute',
        top: d.top,
        left: d.left,
        bottom: d.bottom || 'auto',
        right: d.right || 'auto',
        width: d.width,
        height: d.height,
        backgroundColor: 'rgba(0,255,0,0.85)',
        transform: `translate(${d.x}, ${d.y})`,
        transition: 'none',
      });
      container.appendChild(line);
      this._crosshairLines[d.id] = line;
    }

    // 中心点
    const dot = document.createElement('div');
    dot.id = 'ch-center';
    Object.assign(dot.style, {
      position: 'absolute',
      top: '50%',
      left: '50%',
      width: '3px',
      height: '3px',
      backgroundColor: 'rgba(0,255,0,0.9)',
      borderRadius: '50%',
      transform: 'translate(-50%, -50%)',
    });
    container.appendChild(dot);

    this._root.appendChild(container);
  }

  /** 创建左下区域 (血量、护甲) */
  _createBottomLeft() {
    const wrapper = document.createElement('div');
    wrapper.id = 'hud-bottom-left';
    Object.assign(wrapper.style, {
      position: 'absolute',
      bottom: '24px',
      left: `${MINIMAP_SIZE + 40}px`,
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      minWidth: '200px',
    });

    // 血量
    const healthRow = document.createElement('div');
    healthRow.style.display = 'flex';
    healthRow.style.alignItems = 'center';
    healthRow.style.gap = '8px';

    this._healthIcon = document.createElement('span');
    this._healthIcon.textContent = '❤';
    this._healthIcon.style.fontSize = '20px';
    this._healthIcon.style.filter = 'drop-shadow(0 0 4px rgba(255,0,0,0.6))';

    this._healthValue = document.createElement('span');
    this._healthValue.style.fontSize = '16px';
    this._healthValue.style.fontWeight = 'bold';
    this._healthValue.style.minWidth = '36px';

    this._healthBar = document.createElement('div');
    Object.assign(this._healthBar.style, {
      width: '160px',
      height: '10px',
      backgroundColor: 'rgba(0,0,0,0.5)',
      borderRadius: '3px',
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.2)',
    });
    this._healthBarFill = document.createElement('div');
    Object.assign(this._healthBarFill.style, {
      width: '100%',
      height: '100%',
      backgroundColor: '#e74c3c',
      borderRadius: '2px',
      transition: 'width 0.15s ease',
    });
    this._healthBar.appendChild(this._healthBarFill);

    healthRow.appendChild(this._healthIcon);
    healthRow.appendChild(this._healthValue);
    healthRow.appendChild(this._healthBar);

    // 护甲
    const armorRow = document.createElement('div');
    armorRow.style.display = 'flex';
    armorRow.style.alignItems = 'center';
    armorRow.style.gap = '8px';

    this._armorIcon = document.createElement('span');
    this._armorIcon.textContent = '🛡';
    this._armorIcon.style.fontSize = '20px';
    this._armorIcon.style.filter = 'drop-shadow(0 0 4px rgba(0,100,255,0.6))';

    this._armorValue = document.createElement('span');
    this._armorValue.style.fontSize = '16px';
    this._armorValue.style.fontWeight = 'bold';
    this._armorValue.style.minWidth = '36px';

    this._armorBar = document.createElement('div');
    Object.assign(this._armorBar.style, {
      width: '160px',
      height: '10px',
      backgroundColor: 'rgba(0,0,0,0.5)',
      borderRadius: '3px',
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.2)',
    });
    this._armorBarFill = document.createElement('div');
    Object.assign(this._armorBarFill.style, {
      width: '100%',
      height: '100%',
      backgroundColor: '#3498db',
      borderRadius: '2px',
      transition: 'width 0.15s ease',
    });
    this._armorBar.appendChild(this._armorBarFill);

    armorRow.appendChild(this._armorIcon);
    armorRow.appendChild(this._armorValue);
    armorRow.appendChild(this._armorBar);

    wrapper.appendChild(healthRow);
    wrapper.appendChild(armorRow);
    this._root.appendChild(wrapper);
  }

  /** 创建右下区域 (弹药、武器名、金钱) */
  _createBottomRight() {
    const wrapper = document.createElement('div');
    wrapper.id = 'hud-bottom-right';
    Object.assign(wrapper.style, {
      position: 'absolute',
      bottom: '24px',
      right: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      alignItems: 'flex-end',
      minWidth: '180px',
      textShadow: '0 1px 4px rgba(0,0,0,0.8)',
    });

    // 弹药
    this._ammoEl = document.createElement('div');
    this._ammoEl.style.fontSize = '32px';
    this._ammoEl.style.fontWeight = 'bold';
    this._ammoEl.style.fontFamily = 'monospace';
    this._ammoEl.style.letterSpacing = '2px';

    // 武器名
    this._weaponNameEl = document.createElement('div');
    this._weaponNameEl.style.fontSize = '16px';
    this._weaponNameEl.style.opacity = '0.8';
    this._weaponNameEl.style.textTransform = 'uppercase';

    // 弹药进度条
    this._ammoBar = document.createElement('div');
    Object.assign(this._ammoBar.style, {
      width: '140px',
      height: '4px',
      backgroundColor: 'rgba(0,0,0,0.5)',
      borderRadius: '2px',
      overflow: 'hidden',
      marginTop: '2px',
    });
    this._ammoBarFill = document.createElement('div');
    Object.assign(this._ammoBarFill.style, {
      width: '100%',
      height: '100%',
      backgroundColor: '#f39c12',
      borderRadius: '2px',
      transition: 'width 0.1s ease',
    });
    this._ammoBar.appendChild(this._ammoBarFill);

    // 金钱
    this._moneyEl = document.createElement('div');
    this._moneyEl.style.fontSize = '20px';
    this._moneyEl.style.fontWeight = 'bold';
    this._moneyEl.style.color = '#2ecc71';
    this._moneyEl.style.marginTop = '8px';

    wrapper.appendChild(this._ammoEl);
    wrapper.appendChild(this._weaponNameEl);
    wrapper.appendChild(this._ammoBar);
    wrapper.appendChild(this._moneyEl);
    this._root.appendChild(wrapper);
  }

  /** 创建右上区域 (比分、击杀提示) */
  _createTopRight() {
    const wrapper = document.createElement('div');
    wrapper.id = 'hud-top-right';
    Object.assign(wrapper.style, {
      position: 'absolute',
      top: '16px',
      right: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      alignItems: 'flex-end',
    });

    // 比分
    this._scoreEl = document.createElement('div');
    this._scoreEl.style.fontSize = '18px';
    this._scoreEl.style.fontWeight = 'bold';
    this._scoreEl.style.textShadow = '0 1px 4px rgba(0,0,0,0.8)';
    this._scoreEl.style.display = 'flex';
    this._scoreEl.style.gap = '8px';
    this._scoreEl.style.alignItems = 'center';

    wrapper.appendChild(this._scoreEl);

    // 击杀提示容器
    this._killfeedContainer = document.createElement('div');
    Object.assign(this._killfeedContainer.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      maxWidth: '300px',
    });
    wrapper.appendChild(this._killfeedContainer);

    this._root.appendChild(wrapper);
  }

  /** 创建倒计时 */
  _createTimer() {
    this._timerEl = document.createElement('div');
    this._timerEl.id = 'hud-timer';
    Object.assign(this._timerEl.style, {
      position: 'absolute',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      fontSize: '22px',
      fontWeight: 'bold',
      fontFamily: 'monospace',
      textShadow: '0 1px 6px rgba(0,0,0,0.9)',
      letterSpacing: '2px',
      transition: 'color 0.3s ease',
    });
    this._root.appendChild(this._timerEl);
  }

  /** 创建伤害指示器 */
  _createDamageIndicator() {
    this._damageEl = document.createElement('div');
    this._damageEl.id = 'hud-damage-indicator';
    Object.assign(this._damageEl.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.1s ease',
    });
    this._root.appendChild(this._damageEl);
  }

  /** 创建购买菜单 */
  _createBuyMenu() {
    this._buyMenuEl = document.createElement('div');
    this._buyMenuEl.id = 'hud-buy-menu';
    Object.assign(this._buyMenuEl.style, {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      display: 'none',
      flexDirection: 'column',
      gap: '16px',
      padding: '24px',
      backgroundColor: 'rgba(20, 20, 30, 0.95)',
      borderRadius: '12px',
      border: '2px solid rgba(255,255,255,0.2)',
      minWidth: '480px',
      maxHeight: '70vh',
      overflowY: 'auto',
      pointerEvents: 'auto',
      zIndex: '200',
    });

    // 标题
    const title = document.createElement('div');
    title.textContent = '购买菜单 [B 关闭]';
    title.style.fontSize = '20px';
    title.style.fontWeight = 'bold';
    title.style.textAlign = 'center';
    title.style.marginBottom = '8px';
    title.style.color = '#f1c40f';
    this._buyMenuEl.appendChild(title);

    // 金钱显示
    this._buyMenuMoney = document.createElement('div');
    this._buyMenuMoney.style.fontSize = '16px';
    this._buyMenuMoney.style.textAlign = 'center';
    this._buyMenuMoney.style.color = '#2ecc71';
    this._buyMenuEl.appendChild(this._buyMenuMoney);

    // 武器分类内容
    this._buyMenuContent = document.createElement('div');
    this._buyMenuContent.style.display = 'flex';
    this._buyMenuContent.style.flexDirection = 'column';
    this._buyMenuContent.style.gap = '12px';
    this._buyMenuEl.appendChild(this._buyMenuContent);

    // 构建武器列表
    this._buildWeaponList();

    this._root.appendChild(this._buyMenuEl);
  }

  /** 构建武器列表 DOM */
  _buildWeaponList() {
    this._buyMenuContent.innerHTML = '';
    const allIds = getAllWeaponIds();

    for (const cat of WEAPON_CATEGORIES) {
      const catWrapper = document.createElement('div');

      // 类别标题
      const catTitle = document.createElement('div');
      catTitle.textContent = cat.label;
      catTitle.style.fontSize = '14px';
      catTitle.style.fontWeight = 'bold';
      catTitle.style.color = '#aaa';
      catTitle.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
      catTitle.style.paddingBottom = '4px';
      catTitle.style.marginBottom = '4px';
      catWrapper.appendChild(catTitle);

      // 武器行
      const weaponsInCat = allIds.filter(id => {
        const data = getWeaponData(id);
        return data && data.type === cat.key;
      });

      for (const weaponId of weaponsInCat) {
        const data = getWeaponData(weaponId);
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.padding = '6px 8px';
        row.style.borderRadius = '4px';
        row.style.backgroundColor = 'rgba(255,255,255,0.03)';

        // 武器名
        const nameSpan = document.createElement('span');
        nameSpan.textContent = data.name;
        nameSpan.style.fontWeight = 'bold';
        nameSpan.style.minWidth = '120px';

        // 价格
        const priceSpan = document.createElement('span');
        priceSpan.textContent = `$${data.price}`;
        priceSpan.style.color = '#2ecc71';
        priceSpan.style.minWidth = '60px';
        priceSpan.style.textAlign = 'right';

        // 购买按钮
        const buyBtn = document.createElement('button');
        buyBtn.textContent = '购买';
        buyBtn.dataset.weaponId = weaponId;
        Object.assign(buyBtn.style, {
          padding: '4px 12px',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: '4px',
          backgroundColor: 'rgba(46, 204, 113, 0.2)',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '13px',
          transition: 'background-color 0.15s',
        });
        buyBtn.addEventListener('mouseenter', () => {
          buyBtn.style.backgroundColor = 'rgba(46, 204, 113, 0.5)';
        });
        buyBtn.addEventListener('mouseleave', () => {
          buyBtn.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
        });

        row.appendChild(nameSpan);
        row.appendChild(priceSpan);
        row.appendChild(buyBtn);
        catWrapper.appendChild(row);
      }

      this._buyMenuContent.appendChild(catWrapper);
    }
  }

  // ── 私有: 更新方法 ────────────────────────────────────

  /**
   * 更新准星 — 根据后坐力调整准星线位置。
   * @param {object} recoil — RecoilSystem 实例
   */
  _updateCrosshair(recoil) {
    const offset = recoil.getRecoilOffset ? recoil.getRecoilOffset() : { x: 0, y: 0 };
    // offset.y 是垂直后坐力 (正值 = 上跳), offset.x 是水平偏移
    // 映射到准星扩散: 后坐力越大, gap 越大
    const gap = 2 + Math.max(Math.abs(offset.x), Math.abs(offset.y)) * 0.8;

    const ch = this._crosshairLines;
    if (ch['ch-top']) {
      ch['ch-top'].style.bottom = 'auto';
      ch['ch-top'].style.top = `${gap}px`;
      ch['ch-top'].style.transform = 'translate(-1px, 0)';
    }
    if (ch['ch-bottom']) {
      ch['ch-bottom'].style.top = 'auto';
      ch['ch-bottom'].style.bottom = `${gap}px`;
      ch['ch-bottom'].style.transform = 'translate(-1px, 0)';
    }
    if (ch['ch-left']) {
      ch['ch-left'].style.right = 'auto';
      ch['ch-left'].style.left = `${gap}px`;
      ch['ch-left'].style.transform = 'translate(0, -1px)';
    }
    if (ch['ch-right']) {
      ch['ch-right'].style.left = 'auto';
      ch['ch-right'].style.right = `${gap}px`;
      ch['ch-right'].style.transform = 'translate(0, -1px)';
    }
  }

  /**
   * 更新血量和护甲显示。
   * @param {number} health
   * @param {number} armor
   */
  _updateHealthArmor(health, armor) {
    const hp = Math.max(0, Math.round(health));
    const ap = Math.max(0, Math.round(armor));

    this._healthValue.textContent = hp;
    this._healthBarFill.style.width = `${Math.min(100, hp)}%`;

    // 低血量警告色
    if (hp <= 25) {
      this._healthValue.style.color = '#e74c3c';
      this._healthBarFill.style.backgroundColor = '#c0392b';
    } else {
      this._healthValue.style.color = '#fff';
      this._healthBarFill.style.backgroundColor = '#e74c3c';
    }

    this._armorValue.textContent = ap;
    this._armorBarFill.style.width = `${Math.min(100, ap)}%`;
  }

  /**
   * 更新弹药显示。
   * @param {number} currentAmmo
   * @param {number} maxAmmo
   * @param {number} reserveAmmo
   */
  _updateAmmo(currentAmmo, maxAmmo, reserveAmmo) {
    const ca = Math.max(0, Math.round(currentAmmo));
    const ma = Math.max(1, Math.round(maxAmmo));

    this._ammoEl.textContent = `${ca} / ${reserveAmmo}`;
    this._ammoBarFill.style.width = `${(ca / ma) * 100}%`;

    // 低弹药警告
    const ratio = ca / ma;
    if (ratio <= 0.25) {
      this._ammoEl.style.color = '#e74c3c';
      this._ammoBarFill.style.backgroundColor = '#e74c3c';
    } else {
      this._ammoEl.style.color = '#fff';
      this._ammoBarFill.style.backgroundColor = '#f39c12';
    }
  }

  /**
   * 更新武器名。
   * @param {string} name
   */
  _updateWeaponName(name) {
    this._weaponNameEl.textContent = name;
  }

  /**
   * 更新金钱显示。
   * @param {number} money
   */
  _updateMoney(money) {
    this._moneyEl.textContent = `$${money}`;
    if (money < 500) {
      this._moneyEl.style.color = '#e74c3c';
    } else {
      this._moneyEl.style.color = '#2ecc71';
    }
  }

  /**
   * 更新小地图。
   * @param {THREE.Vector3|null} playerPos
   * @param {THREE.Vector3|null} playerForward
   * @param {Array<{x:number, z:number, color:string}>} botPositions
   */
  _updateMinimap(playerPos, playerForward, botPositions) {
    const ctx = this._minimapCtx;
    const w = MINIMAP_SIZE;
    const h = MINIMAP_SIZE;

    ctx.clearRect(0, 0, w, h);

    // 背景
    ctx.fillStyle = 'rgba(20, 20, 30, 0.9)';
    ctx.fillRect(0, 0, w, h);

    // 坐标映射: 世界 (x,z) 范围 [-40,40] → canvas (0,w)
    const scale = w / MINIMAP_WORLD_SIZE;
    const offsetX = w / 2;
    const offsetY = h / 2;

    function worldToCanvas(wx, wz) {
      return {
        cx: offsetX + wx * scale,
        cy: offsetY - wz * scale, // Z 轴反转
      };
    }

    // 画网格线
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = -40; i <= 40; i += 10) {
      const p1 = worldToCanvas(i, -40);
      const p2 = worldToCanvas(i, 40);
      ctx.beginPath();
      ctx.moveTo(p1.cx, p1.cy);
      ctx.lineTo(p2.cx, p2.cy);
      ctx.stroke();

      const p3 = worldToCanvas(-40, i);
      const p4 = worldToCanvas(40, i);
      ctx.beginPath();
      ctx.moveTo(p3.cx, p3.cy);
      ctx.lineTo(p4.cx, p4.cy);
      ctx.stroke();
    }

    // 画 Bot 位置
    for (const bot of botPositions) {
      const { cx, cy } = worldToCanvas(bot.x, bot.z);
      ctx.fillStyle = bot.color || '#ddaa00';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 画玩家位置
    if (playerPos) {
      const { cx, cy } = worldToCanvas(playerPos.x, playerPos.z);

      // 方向箭头
      if (playerForward) {
        ctx.save();
        ctx.translate(cx, cy);
        // 计算方向角
        const angle = Math.atan2(playerForward.x, -playerForward.z);
        ctx.rotate(angle);

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.lineTo(-4, -3);
        ctx.lineTo(-4, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        // 圆形
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * 从 gameState 提取 bot 位置。
   * gameState 没有直接存储 bot 位置，这由外部集成时通过 setBotPositions 传入。
   * 这里使用内部缓存。
   */
  _extractBotPositions(gameState) {
    // bot 位置由外部通过 _botPositions 设置
    return this._botPositions || [];
  }

  /**
   * 设置 Bot 位置 (供外部调用)。
   * @param {Array<{x:number, z:number, color:string}>} positions
   */
  setBotPositions(positions) {
    this._botPositions = positions || [];
  }

  /**
   * 更新击杀提示 DOM。
   * @param {Array<object>} killfeed
   */
  _updateKillfeed(killfeed) {
    // 检查是否需要添加新条目
    const currentIds = new Set();
    this._killfeedContainer.querySelectorAll('.killfeed-entry').forEach(el => {
      currentIds.add(el.dataset.killId);
    });

    for (let i = 0; i < Math.min(killfeed.length, KILLFEED_MAX); i++) {
      const entry = killfeed[i];
      const id = `kf_${entry.timestamp}_${i}`;

      if (!currentIds.has(id)) {
        this._addKillfeedDOM(entry, id);
      }
    }
  }

  /**
   * 添加一条击杀提示到 DOM。
   * @param {object} entry
   * @param {string} id
   */
  _addKillfeedDOM(entry, id) {
    const el = document.createElement('div');
    el.className = 'killfeed-entry';
    el.dataset.killId = id;
    el.dataset.createdAt = entry.timestamp;

    const icon = entry.isHeadshot ? '💀' : '🗡';
    el.textContent = `${icon} ${entry.killer}  ${entry.weapon}  ${entry.victim}`;

    Object.assign(el.style, {
      fontSize: '13px',
      padding: '4px 8px',
      backgroundColor: 'rgba(0,0,0,0.7)',
      borderRadius: '4px',
      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
      whiteSpace: 'nowrap',
      animation: 'killfeed-slide-in 0.3s ease-out',
      opacity: '1',
      transition: 'opacity 0.5s ease',
    });

    // 根据不同角色着色
    if (entry.killer === '你') {
      el.style.borderLeft = '3px solid #2ecc71';
    } else if (entry.victim === '你') {
      el.style.borderLeft = '3px solid #e74c3c';
    } else {
      el.style.borderLeft = '3px solid rgba(255,255,255,0.3)';
    }

    // 插入到最前面 (最新)
    this._killfeedContainer.insertBefore(el, this._killfeedContainer.firstChild);

    // 限制数量
    const entries = this._killfeedContainer.querySelectorAll('.killfeed-entry');
    if (entries.length > KILLFEED_MAX) {
      entries[entries.length - 1].remove();
    }
  }

  /**
   * 通过 showKillMessage 向 DOM 添加击杀条目。
   */
  _addKillfeedEntry(killer, victim, weapon, isHeadshot) {
    const entry = {
      killer,
      victim,
      weapon,
      isHeadshot,
      timestamp: performance.now(),
    };
    const id = `kf_msg_${entry.timestamp}`;
    this._addKillfeedDOM(entry, id);
  }

  /**
   * 清理过期的击杀提示 DOM。
   */
  _pruneKillfeedDOM() {
    const now = performance.now();
    const entries = this._killfeedContainer.querySelectorAll('.killfeed-entry');
    for (const el of entries) {
      const createdAt = parseFloat(el.dataset.createdAt);
      if (isNaN(createdAt)) continue;

      const age = now - createdAt;
      if (age > KILLFEED_LIFETIME * 0.7) {
        el.style.opacity = '0.3';
      }
      if (age > KILLFEED_LIFETIME) {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.5s ease';
        // 在 transition 完成后移除
        setTimeout(() => {
          if (el.parentNode) el.remove();
        }, 600);
      }
    }
  }

  /**
   * 更新比分显示。
   * @param {object} gameState
   */
  _updateScore(gameState) {
    const ps = gameState.playerScore ?? 0;

    // 计算 bot 总击杀
    let botTotal = 0;
    if (gameState.botScores) {
      for (const [, entry] of gameState.botScores) {
        botTotal += entry.score || 0;
      }
    }

    this._scoreEl.innerHTML = `
      <span style="color:#2ecc71">你: ${ps}</span>
      <span style="color:#aaa">vs</span>
      <span style="color:#e74c3c">Bot: ${botTotal}</span>
    `;
  }

  /**
   * 更新倒计时。
   * @param {object} gameState
   */
  _updateTimer(gameState) {
    const phase = gameState.getPhase ? gameState.getPhase() : 'warmup';

    switch (phase) {
      case 'warmup':
        this._timerEl.textContent = '热身中...';
        this._timerEl.style.color = '#f1c40f';
        break;

      case 'buy_phase': {
        const left = gameState.getBuyTimeLeft ? gameState.getBuyTimeLeft() : 0;
        this._timerEl.textContent = `购买阶段 ${left.toFixed(0)}s`;
        this._timerEl.style.color = '#f1c40f';
        break;
      }

      case 'playing': {
        const left = gameState.getRoundTimeLeft ? gameState.getRoundTimeLeft() : 0;
        const mins = Math.floor(left / 60);
        const secs = Math.floor(left % 60);
        this._timerEl.textContent = `⏱ ${mins}:${String(secs).padStart(2, '0')}`;

        if (left <= 30) {
          this._timerEl.style.color = '#e74c3c';
          // 闪烁效果
          if (Math.floor(left * 2) % 2 === 0) {
            this._timerEl.style.opacity = '1';
          } else {
            this._timerEl.style.opacity = '0.5';
          }
        } else {
          this._timerEl.style.color = '#fff';
          this._timerEl.style.opacity = '1';
        }
        break;
      }

      case 'round_end': {
        this._timerEl.textContent = `回合结束 — 第 ${gameState.roundNumber || 1} 回合`;
        this._timerEl.style.color = '#f1c40f';
        this._timerEl.style.opacity = '1';

        // 显示 K/D
        const kd = gameState.getPlayerKD ? gameState.getPlayerKD() : '—';
        this._timerEl.textContent += ` | K/D: ${kd}`;
        break;
      }

      default:
        this._timerEl.textContent = '';
        break;
    }
  }

  /**
   * 显示伤害方向闪烁。
   * @param {number} angle — 伤害来源方向 (弧度，0 = 前方)
   */
  _showDamageFlash(angle) {
    // 计算屏幕边缘位置
    // angle: 0 = 正前方 (相机 forward), PI/2 = 右侧, PI = 后方, -PI/2 = 左侧
    const normalizedAngle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    // 确定方向: 使用 CSS 渐变在对应边缘显示红色
    let gradient = '';

    // 将角度映射到 4 个象限
    if (normalizedAngle < Math.PI / 4 || normalizedAngle > Math.PI * 7 / 4) {
      // 前方 → 顶部
      gradient = 'linear-gradient(to bottom, rgba(255,0,0,0.6) 0%, transparent 20%)';
    } else if (normalizedAngle < Math.PI * 3 / 4) {
      // 右侧 → 右边
      gradient = 'linear-gradient(to left, rgba(255,0,0,0.6) 0%, transparent 20%)';
    } else if (normalizedAngle < Math.PI * 5 / 4) {
      // 后方 → 底部
      gradient = 'linear-gradient(to top, rgba(255,0,0,0.6) 0%, transparent 20%)';
    } else {
      // 左侧 → 左边
      gradient = 'linear-gradient(to right, rgba(255,0,0,0.6) 0%, transparent 20%)';
    }

    this._damageEl.style.background = gradient;
    this._damageEl.style.opacity = '1';

    // 定时淡出
    clearTimeout(this._damageTimer);
    this._damageTimer = setTimeout(() => {
      this._damageEl.style.opacity = '0';
      this._damageEl.style.background = 'none';
    }, DAMAGE_INDICATOR_DURATION);
  }

  // ── 私有: 购买菜单 ────────────────────────────────────

  /** 打开购买菜单 */
  _openBuyMenu() {
    this._buyMenuOpen = true;
    this._buyMenuEl.style.display = 'flex';

    // 解除指针锁定
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  /** 关闭购买菜单 */
  _closeBuyMenu() {
    this._buyMenuOpen = false;
    this._buyMenuEl.style.display = 'none';

    // 通知外部恢复指针锁定
    if (this._onBuyMenuClose) {
      this._onBuyMenuClose();
    }
  }

  /**
   * 更新购买菜单中的物品状态。
   * @param {number} money
   * @param {string} currentWeaponType
   */
  _updateBuyMenuItems(money, currentWeaponType) {
    this._buyMenuMoney.textContent = `当前金钱: $${money}`;

    const buttons = this._buyMenuContent.querySelectorAll('[data-weapon-id]');
    for (const btn of buttons) {
      const weaponId = btn.dataset.weaponId;
      const data = getWeaponData(weaponId);
      if (!data) continue;

      const canAfford = money >= data.price;
      const isCurrentType = data.type === currentWeaponType;

      // 按钮样式更新
      if (isCurrentType) {
        btn.textContent = '已装备';
        btn.style.backgroundColor = 'rgba(100,100,100,0.3)';
        btn.style.color = '#888';
        btn.style.cursor = 'default';
        btn.disabled = true;
      } else if (!canAfford) {
        btn.textContent = `$${data.price}`;
        btn.style.backgroundColor = 'rgba(100,100,100,0.2)';
        btn.style.color = '#888';
        btn.style.cursor = 'not-allowed';
        btn.disabled = true;
      } else {
        btn.textContent = '购买';
        btn.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
        btn.style.color = '#fff';
        btn.style.cursor = 'pointer';
        btn.disabled = false;
      }
    }
  }

  // ── 私有: B 键处理 ────────────────────────────────────

  /**
   * 键盘事件处理。
   * @param {KeyboardEvent} e
   */
  _onKeyDown(e) {
    // B 键切换购买菜单
    if (e.code === 'KeyB' && !e.repeat) {
      // 不拦截事件，只 toggle
      this.toggleBuyMenu();
    }
  }
}

// ── 注入 CSS 动画 ─────────────────────────────────────

const style = document.createElement('style');
style.textContent = `
  @keyframes killfeed-slide-in {
    from {
      transform: translateX(30px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;
document.head.appendChild(style);
