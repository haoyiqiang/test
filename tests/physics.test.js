/**
 * tests/physics.test.js — 物理系统单元测试
 *
 * 测试内容:
 *   1. AABB 碰撞检测 — 重叠 vs 分离
 *   2. 射线检测 — 命中 vs 未命中, 最近命中点
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

// ── 导入 ──────────────────────────────────────────────────

import * as THREE from 'three';
import { PhysicsSystem } from '../src/physics.js';

// ── 测试: AABB 碰撞检测 ──────────────────────────────────

console.log('\n── AABB 碰撞检测 ──');

const physics = new PhysicsSystem();

// 添加一个测试碰撞体
const wall = {
  position: new THREE.Vector3(0, 1, 0),
  size: new THREE.Vector3(2, 2, 2),
};
physics.addCollider(wall);

// 测试 1: 完全重叠 → 应碰撞
{
  const pos = new THREE.Vector3(0, 1, 0);
  const size = new THREE.Vector3(1, 1, 1);
  const result = physics.checkCollision(pos, size);
  assert(result.collided, 'AABB 完全重叠 → collided=true');
}

// 测试 2: 部分重叠 → 应碰撞
{
  const pos = new THREE.Vector3(0.8, 1, 0.8);
  const size = new THREE.Vector3(1, 1, 1);
  const result = physics.checkCollision(pos, size);
  assert(result.collided, 'AABB 部分重叠 → collided=true');
}

// 测试 3: 刚好接触 (边缘相邻) → 应碰撞 (重叠量=0，但 ≤0 被跳过)
{
  const pos = new THREE.Vector3(2.0, 1, 0);
  const size = new THREE.Vector3(1, 1, 1);
  // wall: pos(0,1,0) size(2,2,2), half=(1,1,1), 范围 x=[-1,1]
  // player: pos(2,1,0) size(1,1,1), half=(0.5,0.5,0.5), 范围 x=[1.5,2.5]
  // overlapX = 0.5 + 1 - |2-0| = 1.5 - 2 = -0.5 <= 0 → 不碰撞
  const result = physics.checkCollision(pos, size);
  assert(!result.collided, 'AABB 刚好分离 (边缘相邻) → collided=false');
}

// 测试 4: 完全分离 → 不应碰撞
{
  const pos = new THREE.Vector3(10, 10, 10);
  const size = new THREE.Vector3(1, 1, 1);
  const result = physics.checkCollision(pos, size);
  assert(!result.collided, 'AABB 完全分离 → collided=false');
}

// 测试 5: 碰撞推出 — 被推离碰撞体
{
  const pos = new THREE.Vector3(0.6, 1, 0.6);
  const size = new THREE.Vector3(1, 1, 1);
  const result = physics.checkCollision(pos, size);
  assert(result.collided, '碰撞后应被推出');
  // 因为 X 和 Z 重叠量较小，应在 X 或 Z 上推出
  const dx = Math.abs(result.position.x);
  const dz = Math.abs(result.position.z);
  assert(dx > 0.6 || dz > 0.6, '被推出后位置不再在碰撞体内');
}

// 测试 6: 无碰撞体 → 不碰撞
{
  const emptyPhysics = new PhysicsSystem();
  const pos = new THREE.Vector3(0, 0, 0);
  const size = new THREE.Vector3(1, 1, 1);
  const result = emptyPhysics.checkCollision(pos, size);
  assert(!result.collided, '无碰撞体 → collided=false');
}

// ── 测试: 射线检测 ──────────────────────────────────────

console.log('\n── 射线检测 ──');

// 重置并添加明确位置的碰撞体
const rayPhysics = new PhysicsSystem();

// 添加两面墙
rayPhysics.addCollider({
  position: new THREE.Vector3(0, 1, 10),
  size: new THREE.Vector3(4, 2, 0.5),
});

rayPhysics.addCollider({
  position: new THREE.Vector3(0, 1, 20),
  size: new THREE.Vector3(4, 2, 0.5),
});

// 测试 7: 射线穿过 AABB → 命中
{
  const origin = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(0, 0, 1); // 向 +Z 射击
  const hit = rayPhysics.raycast(origin, dir, 100);
  assert(hit !== null, '射线穿过碰撞体 → 命中');
  assertApprox(hit.distance, 9.75, 0.1, '命中距离 ≈ 9.75 (碰撞体前表面)');
  assert(hit.point.z > 9 && hit.point.z < 10, '命中点 Z 在碰撞体范围内');
}

// 测试 8: 射线不穿过任何碰撞体 → 未命中
{
  const origin = new THREE.Vector3(0, 5, 0);
  const dir = new THREE.Vector3(0, 0, 1);
  const hit = rayPhysics.raycast(origin, dir, 100);
  assert(hit === null, '射线高于碰撞体 → 未命中');
}

// 测试 9: 射线背向碰撞体 → 未命中
{
  const origin = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(0, 0, -1); // 向 -Z 射击
  const hit = rayPhysics.raycast(origin, dir, 100);
  assert(hit === null, '射线背向碰撞体 → 未命中');
}

// 测试 10: 两个碰撞体 — 返回最近命中点
{
  const origin = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(0, 0, 1);
  const hit = rayPhysics.raycast(origin, dir, 100);
  assert(hit !== null, '多个碰撞体 → 命中');
  // 应命中第一个 (z=10 处)
  assert(hit.distance < 15, '命中距离 < 15 (应该命中第一个碰撞体)');
}

// 测试 11: 射线方向非归一化 → 仍然正确处理
{
  const origin = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(0, 0, 2).normalize(); // 归一化后仍指向 +Z
  const hit = rayPhysics.raycast(origin, dir, 100);
  assert(hit !== null, '归一化方向 → 命中');
}

// 测试 12: maxDistance 限制
{
  const origin = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(0, 0, 1);
  const hit = rayPhysics.raycast(origin, dir, 5); // 最大距离 5
  // 碰撞体在 z=10, 所以距离 5 时未命中
  assert(hit === null, 'maxDistance=5, 碰撞体在 z=10 → 未命中');
}

// 测试 13: 空碰撞体列表 → 未命中
{
  const emptyPhysics = new PhysicsSystem();
  const origin = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(0, 0, 1);
  const hit = emptyPhysics.raycast(origin, dir, 100);
  assert(hit === null, '无碰撞体 → 未命中');
}

// 测试 14: 射线起点在碰撞体内部 → 命中
{
  const origin = new THREE.Vector3(0, 1, 10); // 在碰撞体中心
  const dir = new THREE.Vector3(0, 0, 1);
  const hit = rayPhysics.raycast(origin, dir, 100);
  assert(hit !== null, '射线起点在碰撞体内部 → 命中 (穿出)');
}

// ── 测试: 移除碰撞体 ─────────────────────────────────────

console.log('\n── 碰撞体管理 ──');

const mgrPhysics = new PhysicsSystem();
const obj = {
  position: new THREE.Vector3(0, 0, 0),
  size: new THREE.Vector3(1, 1, 1),
};
mgrPhysics.addCollider(obj);
assert(mgrPhysics._colliders.length === 1, '添加碰撞体后列表长度 = 1');

mgrPhysics.removeCollider(obj);
assert(mgrPhysics._colliders.length === 0, '移除碰撞体后列表长度 = 0');

// ── 汇总 ──────────────────────────────────────────────────

console.log('\n');
summary();

export { testResults, testPassed, testFailed };
