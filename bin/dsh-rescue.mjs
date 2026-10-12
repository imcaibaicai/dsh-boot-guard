#!/usr/bin/env node
/**
 * dsh-rescue: DeepSeek Harness 脱机状态诊断与急救工具
 *
 * 核心设计：
 * - 纯 Node 原生实现，零第三方依赖，支持 npx 直接运行或作为独立 CLI 运行；
 * - 动态探测 DSH_HOME 与操作系统日志目录，绝无硬编码路径；
 * - 包含崩溃日志实名解析、配置健康对比、客户端代码体检与安全配置还原。
 *
 * 用法：
 *   dsh-rescue report          # 分析最新崩溃日志与当前 profile 状态（默认）
 *   dsh-rescue diff            # 对比当前配置与健康基线 (last-good.json)
 *   dsh-rescue check           # 扫描所有已安装 client 插件的语法与结构
 *   dsh-rescue restore         # 预览还原方案（只读）
 *   dsh-rescue restore --apply # 确认执行还原（带自动备份与哈希核验）
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

function resolveDshHome() {
  if (process.env.DSH_HOME && fs.existsSync(process.env.DSH_HOME)) {
    return path.resolve(process.env.DSH_HOME);
  }
  const fallback = path.join(os.homedir(), '.dsh');
  return path.resolve(process.env.DSH_HOME || fallback);
}

function resolveCrashLogDir() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, '@deepseek-ai', 'dsh-desktop', 'logs');
  } else if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Logs', '@deepseek-ai', 'dsh-desktop');
  } else {
    return path.join(os.homedir(), '.config', '@deepseek-ai', 'dsh-desktop', 'logs');
  }
}

const DSH_HOME = resolveDshHome();
const PROFILE_DIR = path.join(DSH_HOME, 'profiles', 'desktop');
const DIAG_DIR = path.join(DSH_HOME, 'diagnostics');
const LAST_GOOD_PATH = path.join(DIAG_DIR, 'last-good.json');
const CRASH_LOG_DIR = resolveCrashLogDir();

function getHash(filePath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toUpperCase();
  } catch {
    return 'N/A';
  }
}

function parsePackageJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function parseInserts(p) {
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return [...raw.matchAll(/-\s*insert:\s*([^\r\n#]+)/g)].map(m => m[1].trim());
  } catch {
    return [];
  }
}

function getLatestCrashLog() {
  if (!fs.existsSync(CRASH_LOG_DIR)) return null;
  try {
    const files = fs.readdirSync(CRASH_LOG_DIR)
      .filter(f => f.startsWith('crash-') && f.endsWith('.log'))
      .map(f => {
        const full = path.join(CRASH_LOG_DIR, f);
        return { file: f, path: full, mtime: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return files[0] || null;
  } catch {
    return null;
  }
}

function cmdReport() {
  console.log('======================================================');
  console.log('       DeepSeek Harness 脱机急救与状态诊断报告        ');
  console.log('======================================================\n');

  console.log(`[环境信息]`);
  console.log(`  DSH_HOME:    ${DSH_HOME} ${fs.existsSync(DSH_HOME) ? '✅' : '❌'}`);
  console.log(`  桌面 Profile: ${PROFILE_DIR} ${fs.existsSync(PROFILE_DIR) ? '✅' : '❌'}`);

  const pkgPath = path.join(PROFILE_DIR, 'package.json');
  const patchPath = path.join(PROFILE_DIR, 'cordis.patch.yml');
  const pkg = parsePackageJson(pkgPath);
  const inserts = parseInserts(patchPath);

  const bundles = pkg?.dsh?.profile?.bundles || [];
  console.log(`\n[Profile 当前状态]`);
  console.log(`  package.json:     ${fs.existsSync(pkgPath) ? '存在' : '缺失'} | Bundles: ${bundles.length} 个 | SHA256: ${getHash(pkgPath).slice(0, 16)}...`);
  console.log(`  cordis.patch.yml: ${fs.existsSync(patchPath) ? '存在' : '缺失'} | Inserts: ${inserts.length} 个 | SHA256: ${getHash(patchPath).slice(0, 16)}...`);

  // 检测是否触发了官方禁用第三方插件
  if (bundles.length === 2 && bundles.includes('dsh-base') && bundles.includes('dsh-web-app')) {
    console.log('\n⚠️ 【严重警告】检测到 bundles 仅剩 2 个官方包！');
    console.log('   极大概率误点了崩溃弹窗上的「禁用第三方插件」按钮！');
    console.log('   插件未丢失，但已被官方逻辑裁剪。');
    console.log('   建议执行: dsh-rescue restore --apply 立即还原');
  }

  // 检查备份文件
  if (fs.existsSync(PROFILE_DIR)) {
    const bakFiles = fs.readdirSync(PROFILE_DIR)
      .filter(f => f.includes('.bak'))
      .map(f => ({ name: f, size: fs.statSync(path.join(PROFILE_DIR, f)).size }))
      .sort((a, b) => b.size - a.size);

    if (bakFiles.length > 0) {
      console.log(`\n[历史备份文件 (前 3 大)]`);
      bakFiles.slice(0, 3).forEach(b => console.log(`  - ${b.name} (${b.size} 字节)`));
    }
  }

  // 崩溃日志诊断
  const latestLog = getLatestCrashLog();
  console.log(`\n[最新崩溃日志分析]`);
  if (!latestLog) {
    console.log('  （日志目录无崩溃记录）');
  } else {
    console.log(`  日志文件: ${latestLog.file}`);
    console.log(`  记录时间: ${new Date(latestLog.mtime).toLocaleString()}`);
    const content = fs.readFileSync(latestLog.path, 'utf8');

    // 检测是否有守卫捕获标记
    const guardMatch = content.match(/\[DSH_BOOT_GUARD_CRITICAL\][^\r\n]*/);
    if (guardMatch) {
      console.log(`  🎯 【守卫精准命中元凶】:`);
      console.log(`     ${guardMatch[0]}`);
    }

    // 提取关键错误行
    const lines = content.split(/\r?\n/);
    const errIdx = lines.findIndex(l => l.startsWith('--- error ---'));
    if (errIdx !== -1) {
      console.log('  错误摘要:');
      for (let i = errIdx + 1; i < Math.min(lines.length, errIdx + 6); i++) {
        if (lines[i].trim()) console.log(`    ${lines[i]}`);
      }
    }
  }

  console.log('\n======================================================');
  console.log('可用命令：');
  console.log('  dsh-rescue diff          # 对比当前与上次好状态的差异');
  console.log('  dsh-rescue check         # 扫描检查所有 client 插件结构');
  console.log('  dsh-rescue restore       # 预览一键还原方案');
  console.log('  dsh-rescue restore --apply # 确认执行还原');
  console.log('======================================================\n');
}

function cmdDiff() {
  if (!fs.existsSync(LAST_GOOD_PATH)) {
    console.error('❌ 未找到 last-good.json 健康基线快照。');
    return;
  }
  const good = JSON.parse(fs.readFileSync(LAST_GOOD_PATH, 'utf8'));
  const currentPkg = parsePackageJson(path.join(PROFILE_DIR, 'package.json'));
  const currentInserts = parseInserts(path.join(PROFILE_DIR, 'cordis.patch.yml'));

  const goodBundles = new Set(good.packageJson?.bundles || []);
  const curBundles = new Set(currentPkg?.dsh?.profile?.bundles || []);

  const goodInserts = new Set(good.cordisPatch?.inserts || []);
  const curInserts = new Set(currentInserts);

  console.log(`=== 与上次健康状态 (${good.recordedAt}) 的对比 ===\n`);

  console.log(`Bundles 数量: 当前 ${curBundles.size} / 基线 ${goodBundles.size}`);
  const missingBundles = [...goodBundles].filter(x => !curBundles.has(x));
  if (missingBundles.length > 0) {
    console.log(`  ❌ 缺失的 Bundles (${missingBundles.length} 个):`);
    missingBundles.forEach(b => console.log(`     - ${b}`));
  } else {
    console.log('  ✅ 所有 Bundles 均在位');
  }

  console.log(`\nInserts 数量: 当前 ${curInserts.size} / 基线 ${goodInserts.size}`);
  const missingInserts = [...goodInserts].filter(x => !curInserts.has(x));
  if (missingInserts.length > 0) {
    console.log(`  ❌ 缺失的 Inserts (${missingInserts.length} 个):`);
    missingInserts.forEach(i => console.log(`     - ${i}`));
  } else {
    console.log('  ✅ 所有 Inserts 均在位');
  }
}

function cmdCheck() {
  console.log('=== 扫描当前所有客户端插件结构（检测 invalid plugin 崩溃隐患）===\n');
  const patchPath = path.join(PROFILE_DIR, 'cordis.patch.yml');
  const inserts = parseInserts(patchPath);
  const pkg = parsePackageJson(path.join(PROFILE_DIR, 'package.json'));
  const bundles = pkg?.dsh?.profile?.bundles || [];

  const allPlugins = [...new Set([...inserts, ...bundles])];
  const nodeModules = path.join(PROFILE_DIR, 'node_modules');

  let issuesFound = 0;

  for (const name of allPlugins) {
    const pkgJsonPath = path.join(nodeModules, name, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) continue;

    const p = parsePackageJson(pkgJsonPath);
    if (!p) {
      console.log(`⚠️  ${name}: package.json 无法解析或损坏`);
      issuesFound++;
      continue;
    }

    if (p.dsh?.client) {
      let clientSubpath = p.exports?.['./client'];
      if (typeof clientSubpath === 'object' && clientSubpath !== null) {
        clientSubpath = clientSubpath.default || clientSubpath.import || clientSubpath.require;
      }
      if (typeof clientSubpath !== 'string') {
        clientSubpath = 'lib/client.js';
      }
      const clientFile = path.join(nodeModules, name, clientSubpath);
      if (!fs.existsSync(clientFile)) {
        console.log(`❌ ${name}: 声明了 dsh.client 但找不到客户端文件: ${clientFile}`);
        issuesFound++;
        continue;
      }

      const clientContent = fs.readFileSync(clientFile, 'utf8');
      const hasApply = clientContent.includes('apply');
      if (!hasApply) {
        console.log(`🚨 ${name}: 客户端代码全文无 apply 关键字！极可能在冷启动时触发 invalid plugin 崩溃！`);
        issuesFound++;
      } else {
        console.log(`✅ ${name}: 客户端结构正常 (导出 apply 存在)`);
      }
    }
  }

  if (issuesFound === 0) {
    console.log('\n🎉 扫描完成，未发现结构性缺陷插件！');
  } else {
    console.log(`\n⚠️ 发现 ${issuesFound} 处潜在隐患，请留意排查。`);
  }
}

function cmdRestore(apply = false) {
  if (!fs.existsSync(LAST_GOOD_PATH)) {
    console.error('❌ 未找到 last-good.json，无法执行还原。');
    return;
  }
  const good = JSON.parse(fs.readFileSync(LAST_GOOD_PATH, 'utf8'));

  if (!fs.existsSync(PROFILE_DIR)) {
    console.error('❌ 桌面 profile 目录不存在:', PROFILE_DIR);
    return;
  }

  const bakCandidates = fs.readdirSync(PROFILE_DIR)
    .filter(f => f.startsWith('cordis.patch.yml.bak'))
    .map(f => {
      const full = path.join(PROFILE_DIR, f);
      return { file: f, path: full, hash: getHash(full), size: fs.statSync(full).size };
    })
    .sort((a, b) => b.size - a.size);

  const bestBak = bakCandidates.find(c => c.hash === good.cordisPatch.hash) || bakCandidates[0];

  console.log('=== 还原方案 ===');
  console.log(`目标健康基线: ${good.recordedAt}`);
  console.log(`还原源 Patch:  ${bestBak ? bestBak.file : '无可用备份'} (${bestBak?.size} 字节)`);
  console.log(`还原 Bundles:  恢复至 ${good.packageJson.bundlesCount} 个`);

  if (!apply) {
    console.log('\n【预览模式】未修改任何文件。如确认执行还原，请添加 --apply 参数：');
    console.log('  dsh-rescue restore --apply\n');
    return;
  }

  console.log('\n正在执行还原...');
  const ts = Date.now();
  const pkgPath = path.join(PROFILE_DIR, 'package.json');
  const patchPath = path.join(PROFILE_DIR, 'cordis.patch.yml');

  const pkgPreBak = path.join(PROFILE_DIR, `package.json.bak-pre-rescue-${ts}`);
  const patchPreBak = path.join(PROFILE_DIR, `cordis.patch.yml.bak-pre-rescue-${ts}`);
  fs.copyFileSync(pkgPath, pkgPreBak);
  fs.copyFileSync(patchPath, patchPreBak);
  console.log(`✅ 已创建抢救前安全备份:`);
  console.log(`   - ${path.basename(pkgPreBak)}`);
  console.log(`   - ${path.basename(patchPreBak)}`);

  if (bestBak) {
    fs.copyFileSync(bestBak.path, patchPath);
    console.log(`✅ cordis.patch.yml 已从 ${bestBak.file} 还原 (SHA256: ${getHash(patchPath)})`);
  }

  const pkg = parsePackageJson(pkgPath);
  if (pkg) {
    pkg.dsh = pkg.dsh || {};
    pkg.dsh.profile = pkg.dsh.profile || {};
    pkg.dsh.profile.bundles = good.packageJson.bundles;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`✅ package.json 已还原 bundles 至 ${good.packageJson.bundles.length} 项 (SHA256: ${getHash(pkgPath)})`);
  }

  console.log('\n🎉 还原操作完成！配置已恢复至健康基线。请重新启动 DSH 验证。');
}

const args = process.argv.slice(2);
const sub = args[0] || 'report';

switch (sub) {
  case 'report':
    cmdReport();
    break;
  case 'diff':
    cmdDiff();
    break;
  case 'check':
    cmdCheck();
    break;
  case 'restore':
    cmdRestore(args.includes('--apply'));
    break;
  default:
    console.log(`未知命令 "${sub}"，请使用 report / diff / check / restore`);
    break;
}
