import * as THREE from 'three';
import { GameLoop } from 'csgo/game-loop.js';
import { InputManager } from 'csgo/input.js';
import { PlayerController } from 'csgo/player.js';
import { PhysicsSystem } from 'csgo/physics.js';
import { MapLoader } from 'csgo/map/map-loader.js';
import { DUST2_MAP } from 'csgo/map/dust2.js';
import { NavMesh } from 'csgo/map/navmesh.js';
import { WeaponSystem } from 'csgo/weapon/weapon-system.js';
import { AudioManager } from 'csgo/audio.js';
import { GameState } from 'csgo/gamestate.js';
import { BotManager } from 'csgo/bot/bot-manager.js';
import { HUD } from 'csgo/hud.js';

// ── 加载进度 ──────────────────────────────────────────

function setLoadingProgress(percent, text) {
  const bar = document.getElementById('loading-bar-inner');
  const label = document.getElementById('loading-text');
  if (bar) bar.style.width = `${Math.min(100, percent)}%`;
  if (label && text) label.textContent = text;
}

function hideLoadingScreen() {
  const screen = document.getElementById('loading-screen');
  if (screen) screen.classList.add('loaded');
  setTimeout(() => { if (screen) screen.style.display = 'none'; }, 600);
}

setLoadingProgress(5, '正在初始化渲染器...');

// ── 场景/渲染器/相机 ──────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('container').appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 60, 250);

setLoadingProgress(10, '正在设置光照...');

scene.add(new THREE.AmbientLight(0x404060, 0.4));
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
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

// ── 子系统初始化 ──────────────────────────────────────

setLoadingProgress(15, '正在加载地图...');

const physics = new PhysicsSystem();
const navmesh = new NavMesh();
const mapLoader = new MapLoader();
mapLoader.loadMap(DUST2_MAP, scene, physics);
mapLoader.addLighting(scene);

const allSpawns = mapLoader.getAllSpawnPoints();
const ctSpawns = allSpawns.ct;
const tSpawns = allSpawns.t;

setLoadingProgress(30, '正在初始化输入系统...');

const input = new InputManager(camera, renderer.domElement);
const lockHint = document.getElementById('lock-hint');
let _lockFailedShown = false;

input.onLock(() => {
  if (lockHint) lockHint.style.display = 'none';
  document.body.classList.add('locked');
});
input.onUnlock(() => {
  if (lockHint) lockHint.style.display = 'block';
  document.body.classList.remove('locked');
});

function requestPointerLock() {
  try {
    renderer.domElement.requestPointerLock();
  } catch (e) {
    if (!_lockFailedShown) {
      _lockFailedShown = true;
      console.warn('指针锁定不可用，请使用最新版 Chrome/Firefox/Edge');
      if (lockHint) lockHint.textContent = '你的浏览器不支持指针锁定，请使用最新版 Chrome/Firefox/Edge';
    }
  }
}

renderer.domElement.addEventListener('click', () => {
  requestPointerLock();
  if (audio && !audio._ctx) {
    try { audio.init(); } catch (e) { console.warn('Web Audio API 初始化失败:', e.message); }
  }
});

setLoadingProgress(40, '正在初始化武器系统...');
const weaponSystem = new WeaponSystem(camera, physics);

setLoadingProgress(50, '正在初始化音频...');
let audio;
try { audio = new AudioManager(); } catch (e) {
  console.warn('AudioManager 创建失败:', e.message);
  audio = null;
}

setLoadingProgress(60, '正在初始化游戏状态...');
const gameState = new GameState({
  mode: 'deathmatch',
  roundTime: 300,
  weaponSystem,
  spawnPoints: ctSpawns,
});
gameState.setWeaponSystem(weaponSystem);

gameState.onPhaseChange((newPhase) => {
  if (!audio) return;
  if (newPhase === 'playing') audio.playRoundStart();
  else if (newPhase === 'round_end') audio.playRoundEnd();
});

setLoadingProgress(70, '正在初始化玩家...');
const player = new PlayerController(camera, physics);
if (ctSpawns.length > 0) {
  const sp = ctSpawns[Math.floor(Math.random() * ctSpawns.length)];
  player.position.set(sp.x, sp.y, sp.z);
}

setLoadingProgress(80, '正在创建 Bot...');
const botMgr = new BotManager(scene);
const tSpawnList = tSpawns.length > 0 ? tSpawns : ctSpawns;
botMgr.spawnBots(8, 'medium', tSpawnList);
for (let i = 0; i < botMgr.bots.length; i++) {
  gameState.registerBot(botMgr.bots[i], `Bot ${i + 1}`);
}

setLoadingProgress(90, '正在初始化 HUD...');
const hud = new HUD();
hud.onBuyWeapon((weaponId) => {
  const result = gameState.buyWeapon(weaponId);
  if (result.success && audio) audio.playBuySound();
});
hud.onBuyMenuClose(() => {
  if (!document.pointerLockElement) requestPointerLock();
});

// ── 帮助函数 ──────────────────────────────────────────

/** 检测点是否在 Bot AABB 内 */
function isPointInBot(point, bot) {
  const half = bot.size.clone().multiplyScalar(0.5);
  const center = bot.position.clone();
  center.y += bot.size.y / 2;
  return Math.abs(point.x - center.x) <= half.x + 0.1 &&
         Math.abs(point.y - center.y) <= half.y + 0.1 &&
         Math.abs(point.z - center.z) <= half.z + 0.1;
}

/** 重生玩家 */
function respawnPlayer() {
  const sp = ctSpawns[Math.floor(Math.random() * ctSpawns.length)];
  player.position.set(sp.x, sp.y, sp.z);
  player.health = 100;
  player.armor = 0;
  weaponSystem.reset();
}

/** 重生 Bot */
function respawnBotDelayed(bot) {
  bot.needsRespawn = true;
  setTimeout(() => {
    if (bot.needsRespawn) {
      const sp = tSpawnList[Math.floor(Math.random() * tSpawnList.length)];
      botMgr.respawnBot(bot, sp);
    }
  }, 3000);
}

// ── 游戏循环回调注册 ─────────────────────────────────

const loop = GameLoop.instance;

// 1. 玩家移动
loop.onUpdate((dt) => { player.update(dt, input); });

// 2. 武器系统 (含射击)
loop.onUpdate((dt) => { weaponSystem.update(dt, input, player); });

// 3. 玩家射击结果处理 (Bot 命中检测)
loop.onUpdate((dt) => {
  const result = weaponSystem.getLastShootResult();
  if (!result || !result.hit) return;

  const weaponData = weaponSystem.currentWeapon;
  if (!weaponData) return;

  // 播放枪声
  if (audio) audio.playGunFire(weaponData.id, camera.position);

  // 检测是否命中 Bot
  for (const bot of botMgr.bots) {
    if (bot.health <= 0 || !bot.mesh.visible) continue;
    if (!isPointInBot(result.point, bot)) continue;

    // Bot 被命中
    bot.health = Math.max(0, bot.health - result.damage);
    if (audio) audio.playHitMarker();

    if (bot.health <= 0) {
      // 击杀
      const botId = gameState.getBotId(bot);
      gameState.addKill('player', botId || 'bot', weaponData.name, result.bodyPart === 'HEAD');
      weaponSystem.addMoney(300);
      if (audio) audio.playKillSound();

      const botEntry = gameState.botScores.get(botId);
      hud.showKillMessage('你', botEntry?.name || 'Bot', weaponData.name, result.bodyPart === 'HEAD');
      respawnBotDelayed(bot);
    }
    break;
  }
});

// 4. Bot AI + 移动 + 射击
loop.onUpdate((dt) => { botMgr.update(dt, player, physics, navmesh); });

// 5. 游戏状态
loop.onUpdate((dt) => { gameState.update(dt); });

// 6. HUD
loop.onUpdate((dt) => {
  const botPositions = [];
  for (const bot of botMgr.bots) {
    if (bot.health > 0 && bot.mesh.visible) {
      botPositions.push({
        x: bot.position.x,
        z: bot.position.z,
        color: bot.difficulty === 'easy' ? '#44aa44' :
               bot.difficulty === 'hard' ? '#cc3333' : '#ddaa00',
      });
    }
  }
  hud.setBotPositions(botPositions);
  hud.update(player, weaponSystem, gameState);
});

// 7. 玩家死亡检测 + 重生
let _playerDead = false;
loop.onUpdate((dt) => {
  if (player.health <= 0 && !_playerDead) {
    _playerDead = true;
    gameState.playerDeaths++;
    if (audio) audio.playRoundEnd();
    setTimeout(() => {
      respawnPlayer();
      _playerDead = false;
    }, 2000);
  }
});

// 8. FPS 计数器
const fpsDisplay = document.getElementById('fps-display');
let _fpsAcc = 0;
loop.onUpdate((dt) => {
  _fpsAcc += dt;
  if (_fpsAcc >= 1.0 && fpsDisplay) {
    _fpsAcc = 0;
    fpsDisplay.textContent = `FPS: ${loop.fps}`;
  }
});

// ── 窗口响应 ──────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── 启动 ──────────────────────────────────────────────

setLoadingProgress(95, '正在启动...');
loop.start({ renderer, scene, camera, input, player, physics });

setTimeout(() => { gameState.startMatch(); }, 1000);

setLoadingProgress(100, '加载完成！点击画面开始');
hideLoadingScreen();

console.log('CS:GO Web FPS 初始化完成');
console.log(`  地图: Dust II | Bot: ${botMgr.bots.length} 个 | 音频: ${audio ? 'Web Audio API' : '不可用'}`);
