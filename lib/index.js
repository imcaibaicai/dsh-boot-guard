/**
 * dsh-boot-guard: 宿主端入口
 *
 * 核心职责：
 * 1. 订阅 webserver/index-inject，在 <head> 最前列注入前置防御脚本，捕获并兜底畸形客户端插件；
 * 2. 提供只读状态查询接口 /api/boot-guard/status；
 * 3. 自身保持绝对健壮与零副作用，所有操作均包裹于 try/catch 中。
 */

const inlineGuardScript = `(function() {
  if (window.__DSH_BOOT_GUARD_INSTALLED__) return;
  window.__DSH_BOOT_GUARD_INSTALLED__ = true;
  window.__DSH_BOOT_GUARD_REPORT__ = {
    installedAt: Date.now(),
    verified: [],
    repaired: [],
    errors: []
  };

  var report = window.__DSH_BOOT_GUARD_REPORT__;

  function patchModuleSystem(system) {
    if (!system || system.__guarded__) return;
    system.__guarded__ = true;

    var origMaterialize = system.materialize;
    if (typeof origMaterialize === 'function') {
      system.materialize = function(id, ownerId) {
        var record = origMaterialize.apply(this, arguments);
        if (!record) return record;
        try {
          var exp = record.exports;
          if (exp && typeof exp === 'object') {
            if (typeof exp.apply !== 'function') {
              var item = { id: id, timestamp: Date.now() };
              report.repaired.push(item);
              console.error('[DSH_BOOT_GUARD_CRITICAL] 捕获到畸形插件 "' + id + '" (缺少 apply 方法)，已就地自动兜底空函数以保障系统启动！');
              exp.apply = function apply() {};
              if (!Array.isArray(exp.inject)) exp.inject = [];
            } else {
              report.verified.push(id);
            }
          } else if (typeof exp === 'function') {
            report.verified.push(id);
          }
        } catch (guardErr) {
          console.error('[DSH_BOOT_GUARD] Guard internal error:', guardErr);
        }
        return record;
      };
    }
  }

  function hookModuleLoader() {
    var loader = window.__ModuleLoader__;
    if (!loader || loader.__guarded__) return;
    loader.__guarded__ = true;

    var origCreate = loader.create;
    if (typeof origCreate === 'function') {
      loader.create = function(options) {
        var system = origCreate.apply(this, arguments);
        try {
          patchModuleSystem(system);
        } catch (e) {
          console.error('[DSH_BOOT_GUARD] Patch system error:', e);
        }
        return system;
      };
    }
  }

  if (window.__ModuleLoader__) {
    hookModuleLoader();
  } else {
    var _loader = undefined;
    Object.defineProperty(window, '__ModuleLoader__', {
      configurable: true,
      enumerable: true,
      get: function() { return _loader; },
      set: function(val) {
        _loader = val;
        try { hookModuleLoader(); } catch (e) {}
      }
    });
  }
})();`;

export function apply(ctx) {
  try {
    // 1. 订阅 webserver/index-inject，推入前置防御脚本
    ctx.on('webserver/index-inject', (table) => {
      try {
        table.unshift({
          kind: 'script',
          placement: 'head',
          text: inlineGuardScript
        });
      } catch (err) {
        console.error('[dsh-boot-guard] Error injecting guard script:', err);
      }
    });

    // 2. 注册只读状态 HTTP 端点
    if (ctx.webServer && typeof ctx.webServer.register === 'function') {
      ctx.webServer.register({
        kind: 'exact',
        path: '/api/boot-guard/status',
        handler: async () => {
          return new Response(JSON.stringify({
            ok: true,
            service: 'dsh-boot-guard',
            timestamp: Date.now()
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      });
    }
  } catch (outerErr) {
    console.error('[dsh-boot-guard] Host activation error:', outerErr);
  }
}
