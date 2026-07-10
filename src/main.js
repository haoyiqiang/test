import * as THREE from 'three';
import { GameLoop } from 'csgo/game-loop.js';
import { InputManager } from 'csgo/input.js';
import { PlayerController } from 'csgo/player.js';
import { PhysicsSystem } from 'csgo/physics.js';
import { WeaponSystem } from 'csgo/weapon/weapon-system.js';
import { WEAPONS } from 'csgo/weapon/weapon-data.js';
import { MapLoader } from 'csgo/map/map-loader.js';
import { DUST2_MAP } from 'csgo/map/dust2.js';

// ── 初始化场景 ──────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

document.getElementById('container').appendChild(renderer.domElement);

// 相机: 70° FOV
const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // 天蓝色背景
scene.fog = new THREE.Fog(0x87ceeb, 60, 250);

// ── 光照 ──────────────────────────────────────────────

// 环境光 — 基础照明
const ambient = new THREE.AmbientLight(0x404060, 0.5);
scene.add(ambient);

// 方向光 — 主光源 (带阴影)
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 150;
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
scene.add(sun);

// ── 物理系统 ──────────────────────────────────────────

const physics = new PhysicsSystem();

// ── 加载地图 ──────────────────────────────────────────

const mapLoader = new MapLoader();
mapLoader.loadMap(DUST2_MAP, scene, physics);
mapLoader.addLighting(scene);

// ── 输入管理 ──────────────────────────────────────────

const input = new InputManager(camera, renderer.domElement);

// 锁定状态 UI 提示 & 光标切换
const lockHint = document.getElementById('lock-hint');
input.onLock(() => {
  if (lockHint) lockHint.style.display = 'none';
  document.body.classList.add('locked');
});
input.onUnlock(() => {
  if (lockHint) lockHint.style.display = 'block';
  document.body.classList.remove('locked');
});

// ── 玩家控制器 ────────────────────────────────────────

const player = new PlayerController(camera, physics);

// 将玩家出生点设置在 CT Spawn 区域
const ctSpawns = mapLoader.getSpawnPoints('ct');
if (ctSpawns.length > 0) {
  const spawn = ctSpawns[0];
  player.position.set(spawn.x, spawn.y, spawn.z);
}

// ── 窗口大小响应 ──────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── 武器系统 ──────────────────────────────────────────

const weaponSystem = new WeaponSystem(camera, physics);

// 控制台测试命令
window.__weaponSystem = weaponSystem;
window.__buyWeapon = (id) => {
  const result = weaponSystem.buyWeapon(id);
  console.log(result.message);
};
window.__listWeapons = () => {
  console.table(
    Object.entries(WEAPONS).map(([id, w]) => ({
      id, name: w.name, type: w.type, damage: w.damage,
      price: '$' + w.price, fireRate: w.fireRate + 'ms'
    }))
  );
};

// ── 启动游戏循环 ──────────────────────────────────────

const loop = GameLoop.instance;
loop.start({ renderer, scene, camera, input, player, physics, weaponSystem, mapLoader });

// FPS 显示更新
const fpsDisplay = document.getElementById('fps-display');
setInterval(() => {
  const currentFps = loop.fps;
  console.log(`FPS: ${currentFps}`);
  if (fpsDisplay) fpsDisplay.textContent = `FPS: ${currentFps}`;
}, 2000);
