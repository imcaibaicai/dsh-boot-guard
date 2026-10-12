import assert from 'node:assert';

console.log('=== 开始 dsh-boot-guard 拦截与自动兜底单元测试 ===');

function cordisResolve(plugin) {
  if (typeof plugin === 'function') return plugin;
  if (plugin && typeof plugin === 'object' && typeof plugin.apply === 'function') return plugin.apply;
  return null;
}

function verifyCordisAccepts(id, exports) {
  const resolved = cordisResolve(exports);
  if (!resolved) {
    throw new Error(`Cordis reject: invalid plugin, expect function or object with an "apply" method, received ${typeof exports}`);
  }
  return true;
}

class MockClientModuleSystem {
  constructor() {
    this.factories = new Map();
    this.loadCache = new Map();
  }

  register(id, factory) {
    this.factories.set(id, { factory });
  }

  materialize(id) {
    if (this.loadCache.has(id)) return this.loadCache.get(id);
    const item = this.factories.get(id);
    if (!item) throw new Error('no factory for ' + id);
    const exports = item.factory();
    const record = { id, exports };
    this.loadCache.set(id, record);
    return record;
  }
}

const guardReport = {
  verified: [],
  repaired: [],
  errors: []
};

function installGuardOnModuleSystem(system) {
  const origMaterialize = system.materialize;
  system.materialize = function(id, ownerId) {
    const record = origMaterialize.apply(this, arguments);
    if (!record) return record;

    try {
      const exp = record.exports;
      if (exp && typeof exp === 'object') {
        if (typeof exp.apply !== 'function') {
          const reportItem = { id, timestamp: Date.now() };
          guardReport.repaired.push(reportItem);
          console.error(`[DSH_BOOT_GUARD_CRITICAL] 捕获到畸形插件 "${id}" (缺少 apply 方法)，已自动就地兜底。`);

          exp.apply = function apply() {};
          if (!Array.isArray(exp.inject)) {
            exp.inject = [];
          }
        } else {
          guardReport.verified.push(id);
        }
      } else if (typeof exp === 'function') {
        guardReport.verified.push(id);
      }
    } catch (guardErr) {
      console.error('[DSH_BOOT_GUARD] Guard error:', guardErr);
    }

    return record;
  };
}

const system = new MockClientModuleSystem();
installGuardOnModuleSystem(system);

system.register('valid-object-plugin', () => ({
  inject: [],
  apply: function() {}
}));

system.register('valid-function-plugin', () => function myPlugin() {});

system.register('broken-plugin-missing-apply', () => {
  var module = { exports: {} };
  return module.exports;
});

const rec1 = system.materialize('valid-object-plugin');
assert.strictEqual(verifyCordisAccepts('valid-object-plugin', rec1.exports), true);

const rec2 = system.materialize('valid-function-plugin');
assert.strictEqual(verifyCordisAccepts('valid-function-plugin', rec2.exports), true);

assert.throws(() => {
  verifyCordisAccepts('raw-broken', {});
}, /invalid plugin/);

const rec3 = system.materialize('broken-plugin-missing-apply');
assert.strictEqual(typeof rec3.exports.apply, 'function');
assert.strictEqual(verifyCordisAccepts('broken-plugin-missing-apply', rec3.exports), true);

assert.strictEqual(guardReport.repaired.length, 1);
assert.strictEqual(guardReport.repaired[0].id, 'broken-plugin-missing-apply');
assert.strictEqual(guardReport.verified.length, 2);

console.log('✅ guard.test.mjs 全部测试通过（4/4）！');
