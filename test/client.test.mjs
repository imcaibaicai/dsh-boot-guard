import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

console.log('=== 开始 dsh-boot-guard client.js 离线结构自测 ===');

const clientCode = fs.readFileSync('D:\\Users\\c1732\\DeepSeekHarness\\Agent学习\\plugins\\dsh-boot-guard\\lib\\client.js', 'utf8');

// 模拟 window 和 ModuleLoader
let registeredModule = null;
const fakeWindow = {
  __ModuleLoader__: {
    load: (mod) => {
      registeredModule = mod;
    }
  }
};

const fakeDocument = {
  querySelector: () => null,
  createElement: () => ({ dataset: {} }),
  head: { appendChild: () => {} }
};

const context = vm.createContext({
  window: fakeWindow,
  document: fakeDocument,
  console: console
});

vm.runInContext(clientCode, context);

assert.ok(registeredModule, '模块未注册到 __ModuleLoader__');
assert.strictEqual(registeredModule.id, 'dsh-boot-guard');
assert.strictEqual(typeof registeredModule.factory, 'function', 'factory 必须是函数');

// 执行 factory，检查返回值
const fakeRequire = (name) => {
  if (name === 'react') return { createElement: () => ({}) };
  return {};
};

const exportsObj = registeredModule.factory(fakeRequire);
assert.ok(exportsObj && typeof exportsObj === 'object', 'factory 返回值必须是对象');
assert.strictEqual(typeof exportsObj.apply, 'function', 'exports.apply 必须是函数！');
assert.ok(Array.isArray(exportsObj.inject), 'exports.inject 必须是数组！');
assert.ok(exportsObj.inject.includes('slots'), 'exports.inject 必须包含 slots');

console.log('✅ client.js 自检完全通过！结构健康，符合 Cordis 插件契约。');
