import * as THREE from 'three';

/**
 * MapLoader — 地图加载器
 *
 * 负责将地图数据 (walls, floors, props) 构建为 Three.js 几何体，
 * 并注册碰撞体到物理系统。
 *
 * 用法:
 *   const loader = new MapLoader();
 *   loader.loadMap(DUST2_MAP, scene, physics);
 *   const ctSpawns = loader.getSpawnPoints('ct');
 */
export class MapLoader {
  constructor() {
    /**
     * 地图元数据 (从 loadMap 填充)
     * @type {object|null}
     */
    this._mapData = null;

    /**
     * 世界对象列表: 用于射线检测的碰撞体引用
     * @type {Array<{position: THREE.Vector3, size: THREE.Vector3, mesh: THREE.Mesh}>}
     */
    this._worldObjects = [];

    /**
     * 创建的 Three.js Mesh 列表 (用于管理/销毁)
     * @type {THREE.Mesh[]}
     */
    this._meshes = [];

    /**
     * 地板 Mesh 引用
     * @type {THREE.Mesh|null}
     */
    this._ground = null;
  }

  /**
   * 加载地图到场景。
   * 会先清理之前的地图数据。
   *
   * @param {object} mapData — DUST2_MAP 地图数据对象
   * @param {THREE.Scene} scene — Three.js 场景
   * @param {object} physics — PhysicsSystem 实例 (须有 addCollider/removeCollider 方法)
   */
  loadMap(mapData, scene, physics) {
    this._clear(scene, physics);
    this._mapData = mapData;

    // ── 1. 创建地板 ──────────────────────────────────────
    this._createFloors(mapData.floors, scene);

    // ── 2. 创建墙壁 ──────────────────────────────────────
    this._createWalls(mapData.walls, scene, physics);

    // ── 3. 创建道具 ──────────────────────────────────────
    this._createProps(mapData.props, scene, physics);
  }

  /**
   * 创建地板平面。
   * @param {Array} floors
   * @param {THREE.Scene} scene
   */
  _createFloors(floors, scene) {
    for (const fl of floors) {
      const geo = new THREE.PlaneGeometry(fl.w, fl.d);
      const mat = new THREE.MeshStandardMaterial({
        color: fl.color,
        roughness: 0.85,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2; // 平放在 XZ 平面
      mesh.position.set(fl.x, 0.005, fl.z); // 略高于 y=0 避免 z-fighting
      mesh.receiveShadow = true;
      scene.add(mesh);
      this._meshes.push(mesh);
    }
  }

  /**
   * 创建墙壁 BoxGeometry 并注册碰撞体。
   * @param {Array} walls
   * @param {THREE.Scene} scene
   * @param {object} physics
   */
  _createWalls(walls, scene, physics) {
    for (const w of walls) {
      const geo = new THREE.BoxGeometry(w.w, 3, w.d); // 高度固定 3m
      const mat = new THREE.MeshStandardMaterial({
        color: w.color,
        roughness: 0.7,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(w.x, 1.5, w.z); // y=1.5 是墙壁中心高度
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      this._meshes.push(mesh);

      // 注册碰撞体
      const collider = {
        position: new THREE.Vector3(w.x, 1.5, w.z),
        size: new THREE.Vector3(w.w, 3, w.d),
      };
      physics.addCollider(collider);
      this._worldObjects.push({ ...collider, mesh });
    }
  }

  /**
   * 创建道具/装饰物。
   * @param {Array} props
   * @param {THREE.Scene} scene
   * @param {object} physics
   */
  _createProps(props, scene, physics) {
    for (const p of props) {
      const geo = new THREE.BoxGeometry(p.w, p.h, p.d);
      const mat = new THREE.MeshStandardMaterial({
        color: p.color,
        roughness: 0.8,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.x, p.h / 2, p.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      this._meshes.push(mesh);

      // 道具也有碰撞
      const collider = {
        position: new THREE.Vector3(p.x, p.h / 2, p.z),
        size: new THREE.Vector3(p.w, p.h, p.d),
      };
      physics.addCollider(collider);
      this._worldObjects.push({ ...collider, mesh });
    }
  }

  /**
   * 获取指定阵营的出生点列表。
   * @param {'ct'|'t'} team
   * @returns {Array<{x: number, y: number, z: number, rot: number}>}
   */
  getSpawnPoints(team) {
    if (!this._mapData) return [];
    const pts = this._mapData.spawnPoints?.[team];
    return pts ? [...pts] : [];
  }

  /**
   * 获取全部出生点 (不分阵营)。
   * @returns {{ct: Array, t: Array}}
   */
  getAllSpawnPoints() {
    if (!this._mapData) return { ct: [], t: [] };
    return {
      ct: [...(this._mapData.spawnPoints?.ct || [])],
      t: [...(this._mapData.spawnPoints?.t || [])],
    };
  }

  /**
   * 获取炸弹点位置。
   * @returns {{a: {x: number, z: number, radius: number}, b: {x: number, z: number, radius: number}}|null}
   */
  getBombSites() {
    if (!this._mapData) return null;
    const sites = this._mapData.bombSites;
    return {
      a: { ...sites.a },
      b: { ...sites.b },
    };
  }

  /**
   * 获取全部世界碰撞体对象 (供射线检测等使用)。
   * @returns {Array<{position: THREE.Vector3, size: THREE.Vector3, mesh: THREE.Mesh}>}
   */
  getWorldObjects() {
    return this._worldObjects;
  }

  /**
   * 添加地图专属光照。
   * 在 loadMap 之后调用，为不同区域添加氛围光。
   *
   * @param {THREE.Scene} scene
   */
  addLighting(scene) {
    // A 包点区域 — 蓝白色点光源
    const aLight = new THREE.PointLight(0x4466aa, 0.4, 20);
    aLight.position.set(0, 2.5, -30);
    scene.add(aLight);

    // B 包点区域 — 蓝白色点光源
    const bLight = new THREE.PointLight(0x4466aa, 0.4, 20);
    bLight.position.set(25, 2.5, -30);
    scene.add(bLight);

    // T Spawn 区域 — 暖色点光源
    const tLight = new THREE.PointLight(0xaa6644, 0.35, 25);
    tLight.position.set(0, 2.5, 28);
    scene.add(tLight);

    // Mid 区域 — 中性点光源
    const midLight = new THREE.PointLight(0x888888, 0.3, 15);
    midLight.position.set(0, 2.5, 8);
    scene.add(midLight);

    // 微弱填充光 (减少暗部过黑)
    const fillLight = new THREE.AmbientLight(0x303040, 0.3);
    scene.add(fillLight);
  }

  /**
   * 清除已加载的地图数据 (从场景和物理系统中移除)。
   * @param {THREE.Scene} scene
   * @param {object} physics
   */
  _clear(scene, physics) {
    // 移除所有 Mesh
    for (const mesh of this._meshes) {
      scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    }
    this._meshes = [];

    // 移除所有碰撞体
    for (const obj of this._worldObjects) {
      if (physics.removeCollider) {
        physics.removeCollider(obj);
      }
    }
    this._worldObjects = [];

    this._mapData = null;
  }

  /**
   * 获取地图元数据。
   * @returns {object|null}
   */
  getMapData() {
    return this._mapData;
  }
}
