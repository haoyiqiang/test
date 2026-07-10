import * as THREE from 'three';
import { GameLoop } from 'csgo/game-loop.js';
import { InputManager } from 'csgo/input.js';
import { PlayerController } from 'csgo/player.js';
import { PhysicsSystem } from 'csgo/physics.js';

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
scene.fog = new THREE.Fog(0x87ceeb, 50, 200);

// ── 光照 ──────────────────────────────────────────────

// 环境光 — 基础照明
const ambient = new THREE.AmbientLight(0x404060, 0.5);
scene.add(ambient);

// 方向光 — 主光源 (带阴影)
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(30, 40, 20);
sun.castShadow = true;
sun.shadow.mapSize.width = 1024;
sun.shadow.mapSize.height = 1024;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 100;
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
scene.add(sun);

// ── 地面 ──────────────────────────────────────────────

const groundGeo = new THREE.PlaneGeometry(100, 100);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a6b3a, roughness: 0.9 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2; // 平放
ground.position.y = 0;
ground.receiveShadow = true;
scene.add(ground);

// ── 测试墙壁 ──────────────────────────────────────────

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });

/** @type {Array<{mesh: THREE.Mesh, collider: {position: THREE.Vector3, size: THREE.Vector3}}>} */
const walls = [];

/**
 * 创建一个墙壁立方体并注册到 worldObjects。
 */
function createWall(x, y, z, w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, wallMaterial);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const collider = {
    position: mesh.position.clone(),
    size: new THREE.Vector3(w, h, d),
  };
  walls.push({ mesh, collider });
  return collider;
}

// 四周墙壁
createWall(0, 1.5, -10, 10, 3, 1);    // 北墙
createWall(0, 1.5, 10, 10, 3, 1);     // 南墙
createWall(-10, 1.5, 0, 1, 3, 20);    // 西墙
createWall(10, 1.5, 0, 1, 3, 20);     // 东墙

// 内部障碍物
createWall(3, 1.5, -5, 2, 3, 2);      // 柱子1
createWall(-4, 1.5, 3, 2, 3, 2);      // 柱子2
createWall(6, 1.5, 6, 4, 3, 1);       // 隔断1
createWall(-6, 1.5, -6, 1, 3, 4);     // 隔断2

// ── 物理系统 ──────────────────────────────────────────

const physics = new PhysicsSystem();
for (const w of walls) {
  physics.addCollider(w.collider);
}

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

// ── 窗口大小响应 ──────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── 启动游戏循环 ──────────────────────────────────────

const loop = GameLoop.instance;
loop.start({ renderer, scene, camera, input, player, physics });

// FPS 显示更新
const fpsDisplay = document.getElementById('fps-display');
setInterval(() => {
  const currentFps = loop.fps;
  console.log(`FPS: ${currentFps}`);
  if (fpsDisplay) fpsDisplay.textContent = `FPS: ${currentFps}`;
}, 2000);
