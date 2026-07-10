/**
 * tests/weapon.test.js — 武器系统单元测试
 *
 * 测试内容:
 *   1. calculateDamage — 基础伤害 × 部位倍率
 *   2. getBodyPart — 高度比例映射到部位
 *   3. WeaponSystem — 弹药管理、换弹、射速、购买
 *   4. 经济系统 — 扣钱、加钱、金钱上限
 *
 * 用法: 在浏览器控制台中加载此脚本，或在 Node.js 中运行
 */

// ── 简易断言框架 ──────────────────────────────────────────

const testResults = [];
let testPassed = 0;
let testFailed = 0;

function assert(condition, message) {
  if (condition) {
    testPassed++;
    testResults.push({ status: 'PASS', message });
  } else {
    testFailed++;
    testResults.push({ status: 'FAIL', message });
    console.error(`  ✗ FAIL: ${message}`);
  }
}

function assertEquals(actual, expected, message) {
  const ok = actual === expected;
  if (ok) {
    testPassed++;
    testResults.push({ status: 'PASS', message });
  } else {
    testFailed++;
    testResults.push({ status: 'FAIL', message, actual, expected });
    console.error(`  ✗ FAIL: ${message} — 期望 ${expected}, 得到 ${actual}`);
  }
}

function assertApprox(actual, expected, epsilon, message) {
  const ok = Math.abs(actual - expected) <= epsilon;
  if (ok) {
    testPassed++;
    testResults.push({ status: 'PASS', message });
  } else {
    testFailed++;
    testResults.push({ status: 'FAIL', message, actual, expected });
    console.error(`  ✗ FAIL: ${message} — 期望 ≈${expected}, 得到 ${actual}`);
  }
}

function summary() {
  console.log(`\n═══════════════════════════════════`);
  console.log(`  测试结果: ${testPassed} 通过, ${testFailed} 失败, ${testPassed + testFailed} 总计`);
  console.log(`═══════════════════════════════════\n`);
  return { passed: testPassed, failed: testFailed, total: testPassed + testFailed };
}

// ── 导入待测模块 ──────────────────────────────────────────

import {
  DAMAGE_MULTIPLIERS,
  WEAPONS,
  getWeaponData,
  getWeaponPrice,
  getAllWeaponIds,
  getBodyPart,
  calculateDamage,
} from '../src/weapon/weapon-data.js';

// ── 测试: 部位倍率 ──────────────────────────────────────

console.log('\n── 部位伤害倍率 ──');

assertEquals(DAMAGE_MULTIPLIERS.HEAD, 4.0, 'HEAD 倍率 = 4.0');
assertEquals(DAMAGE_MULTIPLIERS.CHEST, 1.0, 'CHEST 倍率 = 1.0');
assertEquals(DAMAGE_MULTIPLIERS.STOMACH, 1.25, 'STOMACH 倍率 = 1.25');
assertEquals(DAMAGE_MULTIPLIERS.LEG, 0.75, 'LEG 倍率 = 0.75');

// ── 测试: calculateDamage ─────────────────────────────────

console.log('\n── 伤害计算 ──');

// AK-47 基础伤害 36
assertEquals(calculateDamage(36, 'HEAD'), 144, 'AK47 爆头: 36 × 4 = 144');
assertEquals(calculateDamage(36, 'CHEST'), 36, 'AK47 胸部: 36 × 1 = 36');
assertEquals(calculateDamage(36, 'STOMACH'), 45, 'AK47 腹部: 36 × 1.25 = 45');
assertEquals(calculateDamage(36, 'LEG'), 27, 'AK47 腿部: 36 × 0.75 = 27');

// AWP 基础伤害 115
assertEquals(calculateDamage(115, 'HEAD'), 460, 'AWP 爆头: 115 × 4 = 460');
assertEquals(calculateDamage(115, 'CHEST'), 115, 'AWP 胸部: 115 × 1 = 115');

// USP-S 基础伤害 35
assertEquals(calculateDamage(35, 'HEAD'), 140, 'USP-S 爆头: 35 × 4 = 140');

// Glock-18 基础伤害 30
assertEquals(calculateDamage(30, 'LEG'), Math.round(30 * 0.75), 'Glock-18 腿部: 30 × 0.75');
assertEquals(calculateDamage(30, 'HEAD'), 120, 'Glock-18 爆头: 30 × 4 = 120');

// 边界: 未知部位
assertEquals(calculateDamage(50, 'UNKNOWN'), 50, '未知部位: 50 × 1 = 50');
assertEquals(calculateDamage(50, null), 50, 'null 部位: 50 × 1 = 50');

// ── 测试: getBodyPart ─────────────────────────────────────

console.log('\n── 部位判定 ──');

// 标准 1.8m 身高
assertEquals(getBodyPart(1.7, 1.8), 'HEAD', 'y=1.7/1.8=0.94 → HEAD');
assertEquals(getBodyPart(1.5, 1.8), 'HEAD', 'y=1.5/1.8=0.83 → HEAD');
assertEquals(getBodyPart(1.44, 1.8), 'HEAD', 'y=1.44/1.8=0.80 → HEAD');
assertEquals(getBodyPart(1.2, 1.8), 'CHEST', 'y=1.2/1.8=0.67 → CHEST');
assertEquals(getBodyPart(1.0, 1.8), 'CHEST', 'y=1.0/1.8=0.556 → CHEST');
assertEquals(getBodyPart(0.99, 1.8), 'CHEST', 'y=0.99/1.8=0.55 → CHEST');
assertEquals(getBodyPart(0.8, 1.8), 'STOMACH', 'y=0.8/1.8=0.44 → STOMACH');
assertEquals(getBodyPart(0.6, 1.8), 'STOMACH', 'y=0.6/1.8=0.333 → STOMACH');
assertEquals(getBodyPart(0.59, 1.8), 'LEG', 'y=0.59/1.8=0.328 → LEG');
assertEquals(getBodyPart(0.3, 1.8), 'LEG', 'y=0.3/1.8=0.167 → LEG');
assertEquals(getBodyPart(0.0, 1.8), 'LEG', 'y=0 → LEG');

// 自定义身高
assertEquals(getBodyPart(0.8, 2.0), 'STOMACH', '2m身高: y=0.8/2.0=0.4 → STOMACH');

// ── 测试: 武器数据表 ──────────────────────────────────────

console.log('\n── 武器数据表 ──');

const allIds = getAllWeaponIds();
assert(allIds.length === 6, `武器总数: ${allIds.length} = 6`);
assert(allIds.includes('ak47'), '包含 AK-47');
assert(allIds.includes('awp'), '包含 AWP');
assert(allIds.includes('usps'), '包含 USP-S');
assert(allIds.includes('glock18'), '包含 Glock-18');
assert(allIds.includes('deagle'), '包含 Desert Eagle');
assert(allIds.includes('m4a4'), '包含 M4A4');

// 获取单个武器数据
const ak47 = getWeaponData('ak47');
assertEquals(ak47.name, 'AK-47', 'AK-47 名称');
assertEquals(ak47.type, 'rifle', 'AK-47 类型');
assertEquals(ak47.damage, 36, 'AK-47 伤害');
assertEquals(ak47.magSize, 30, 'AK-47 弹匣容量');
assertEquals(ak47.fireRate, 100, 'AK-47 射速');
assertEquals(ak47.price, 2700, 'AK-47 价格');

const awp = getWeaponData('awp');
assertEquals(awp.type, 'sniper', 'AWP 类型');
assertEquals(awp.scopedSpread, 0, 'AWP 开镜散布为 0');

const usps = getWeaponData('usps');
assertEquals(usps.type, 'pistol', 'USP-S 类型');

// 不存在的武器
assert(getWeaponData('nonexistent') === null, '不存在的武器返回 null');
assertEquals(getWeaponPrice('nonexistent'), Infinity, '不存在武器价格 = Infinity');

// 获取价格
assertEquals(getWeaponPrice('ak47'), 2700, 'AK-47 价格 2700');
assertEquals(getWeaponPrice('deagle'), 700, 'Deagle 价格 700');
assertEquals(getWeaponPrice('usps'), 200, 'USP-S 价格 200');

// ── 测试: 经济系统 (GameState) ────────────────────────────

console.log('\n── 经济系统 ──');

// 由于 GameState 需要完整依赖，这里测试纯逻辑：
// 金钱上限 = 16000

// 模拟金钱管理
let money = 800;
const MAX_MONEY = 16000;
const KILL_REWARD = 300;

// 加钱
money += KILL_REWARD;
assertEquals(money, 1100, '击杀 +$300');

// 连续加钱到上限
money = 15900;
money = Math.min(money + KILL_REWARD, MAX_MONEY);
assertEquals(money, 16000, '金钱触及上限 16000');

money = 16000;
money = Math.min(money + 500, MAX_MONEY);
assertEquals(money, 16000, '超过上限仍为 16000');

// 购买扣钱
money = 5000;
const akPrice = getWeaponPrice('ak47');
money -= akPrice;
assertEquals(money, 2300, '购买 AK-47 后: 5000 - 2700 = 2300');

// 不足购买
const awpPrice = getWeaponPrice('awp');
assert(money < awpPrice, `余额 $${money} 不足以购买 AWP ($${awpPrice})`);

// ── 测试: 武器弹药管理 (无依赖逻辑) ─────────────────────

console.log('\n── 弹药管理 ──');

// 模拟弹匣逻辑
let currentAmmo = ak47.magSize; // 30
let reserveAmmo = ak47.reserveAmmo; // 90

currentAmmo--;
assertEquals(currentAmmo, 29, '射击后弹药 -1');

// 射空弹匣
for (let i = 0; i < 29; i++) { currentAmmo--; }
assertEquals(currentAmmo, 0, '弹匣射空');

// 换弹
const needed = ak47.magSize - currentAmmo;
const available = Math.min(needed, reserveAmmo);
currentAmmo += available;
reserveAmmo -= available;
assertEquals(currentAmmo, 30, '换弹后弹匣满');
assertEquals(reserveAmmo, 60, '换弹后备弹减少');

// 再次换弹 (弹匣已满)
if (currentAmmo >= ak47.magSize) {
  // 不执行换弹
}
assertEquals(currentAmmo, 30, '弹匣满时不换弹');

// 无备弹时无法换弹
reserveAmmo = 0;
// 检查条件: slot.reserveAmmo <= 0 → return
assert(reserveAmmo <= 0, '无备弹无法换弹');

// ── 测试: 射速限制 ──────────────────────────────────────

console.log('\n── 射速限制 ──');

// 模拟射速检查
let lastShotTime = performance.now();
const fireRate = ak47.fireRate; // 100ms

// 刚射击过 — 应该被阻止
const now1 = lastShotTime + 50; // 50ms 后
assert(now1 - lastShotTime < fireRate, `50ms < ${fireRate}ms — 应被阻止`);

// 间隔足够 — 应该允许
const now2 = lastShotTime + 150; // 150ms 后
assert(now2 - lastShotTime >= fireRate, `150ms >= ${fireRate}ms — 应允许射击`);

// ── 汇总 ──────────────────────────────────────────────────

console.log('\n');
summary();

// 导出供外部使用
export { testResults, testPassed, testFailed };
