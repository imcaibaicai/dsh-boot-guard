# dsh-boot-guard

> **DeepSeek Harness (DSH) 启动守卫与故障排查增强**  
> *Pre-boot in-place guard against broken client plugins, crash diagnostics CLI, and zero-loss profile recovery.*

[中文文档](#中文文档) | [English Documentation](#english-documentation)

---

<a id="中文文档"></a>
## 💡 为什么需要它？

在 DeepSeek Harness 桌面端开发或使用第三方插件时，常遇到两大严重痛点：

1. **匿名报错（日志不点名）**：  
   某个客户端插件若漏写 `apply` 方法（例如返回了空对象 `{}`），Cordis 校验器会在启动阶段抛出通用错误：  
   `Error: invalid plugin, expect function or object with an "apply" method, received object`  
   **报错日志里没有任何插件名字或模块标识**，排查极度困难。
2. **误点重置导致配置被清空**：  
   启动失败时官方弹窗提供「禁用第三方插件」按钮，误触后官方逻辑会把 `cordis.patch.yml` 备份改名并将 `bundles` 裁剪为仅剩 2 个官方核心包，应用进入全新欢迎引导界面，视觉上如同“数据被清空”。
3. **缺少脱机急救工具**：  
   当 DSH 因插件语法错误或依赖死锁完全起不来时，官方没有内建的 `doctor` 诊断命令，排查只能依赖手工逆向与日志翻找。

`dsh-boot-guard` 专为解决这三点而设计：**守卫预防、实名点名、就地兜底隔离、脱机一键急救。**

---

## 🛡️ 核心特性

- **🚀 零侵入前置守卫（Pre-boot Guard）**：  
  利用官方 `webserver/index-inject` 机制，在任何 Loader entry 创建前注入微创拦截器，捕获 `ClientModuleSystem.materialize`。
- **🩺 就地兜底隔离（In-place Fallback）**：  
  检测到畸形插件（缺少 `apply`）时，**就地自动注入空函数兜底，阻断整个应用的崩溃**！主程序正常打开，坏插件自身躺平。
- **🎯 崩溃实名点名**：  
  拦截到异常时立即在控制台打印 `[DSH_BOOT_GUARD_CRITICAL]`，被 Electron 主进程直接写入 `crash-*.log`，告别“匿名崩溃”。
- **🚑 脱机急救工具 (dsh-rescue CLI)**：  
  DSH 完全起不来时无需启动主程序，终端一键分析最新崩溃原因、比对健康基线快照、一键从备份原样还原。
- **📊 设置页诊断面板**：  
  在「设置 → 插件」旁注册「启动诊断」页签，直观查看当前核验插件与被兜底的异常插件清单。
- **🔒 绝对安全防自爆**：  
  守卫自身逻辑全链路 `try/catch` 保护，遇异常静默放行；运行时对 profile 零写入。

---

## 📦 安装与使用

### 方式 A：作为 DSH 插件常驻（推荐）

1. 克隆本仓库到本地：
   ```powershell
   git clone https://github.com/imcaibaicai/dsh-boot-guard.git
   cd dsh-boot-guard
   ```

2. 运行一键挂载脚本（Windows PowerShell 5.1 通用）：
   ```powershell
   .\install.ps1
   ```
   *（脚本会自动建立 junction 软链接并在 `cordis.patch.yml` 首行插入 `- insert: dsh-boot-guard`，改动前自动备份原配置）*

3. 完全重启 DSH 桌面端即可享受全程守卫保护。如需卸载，执行：
   ```powershell
   .\install.ps1 -Uninstall
   ```

---

### 方式 B：作为独立急救 CLI (dsh-rescue)

当 DSH 已经崩溃且进不去界面时，无需安装插件，直接在终端使用急救工具：

```bash
# 全局或直接运行
node bin/dsh-rescue.mjs report
```

#### 常用命令：

- **分析最新崩溃原因**：
  ```bash
  node bin/dsh-rescue.mjs report
  ```
  *自动读取并解析最新的 `crash-*.log`，检测是否误触了官方「禁用第三方插件」按钮。*

- **静态扫描所有插件结构**：
  ```bash
  node bin/dsh-rescue.mjs check
  ```
  *离线扫描 `node_modules` 下所有 client 插件，提前发现缺少 `apply` 的定时炸弹。*

- **比对配置差异**：
  ```bash
  node bin/dsh-rescue.mjs diff
  ```
  *比对当前 `cordis.patch.yml` 与 `package.json` 和上次健康基线的差异。*

- **一键安全还原**：
  ```bash
  node bin/dsh-rescue.mjs restore --apply
  ```
  *自动从备份还原完整 patch 与 bundles 清单，操作前自动生成二次备份并打印 SHA256。*

---

## 🧪 自动化测试

运行自带的离线契约与拦截测试集：
```bash
npm test
```

---

<a id="english-documentation"></a>
## 🌐 English Documentation

### Overview

`dsh-boot-guard` is a resilience and diagnostic enhancement for DeepSeek Harness (DSH). It intercepts malformed client plugins before Cordis loader initialization, applies in-place fallbacks to prevent fatal application crashes, identifies culprit plugins in crash logs, and provides a standalone offline recovery tool (`dsh-rescue`).

### Key Highlights

1. **Pre-boot In-place Guard**: Hooks into `webserver/index-inject` to intercept `ClientModuleSystem.materialize`.
2. **Safe Fallback**: Injects an empty `apply` stub on malformed plugins so DSH can still boot cleanly while isolating the broken plugin.
3. **Culprit Identification**: Outputs explicit plugin identifiers so crash logs never say anonymous `invalid plugin, received object`.
4. **Offline Rescue CLI**: Diagnostic, diffing, and rollback tools that work even when DSH cannot start.

### License

MIT License.
