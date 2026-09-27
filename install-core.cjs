/*
 * ZCode 气泡版 UI 安装核心脚本
 * 用法:
 *   node install-core.cjs install   打补丁并安装（要求 ZCode 已关闭）
 *   node install-core.cjs restore   还原官方原版（要求 ZCode 已关闭）
 *   node install-core.cjs dryrun    只打包到 staging，不动真文件（自检用）
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const asar = require('@electron/asar');

const RES = process.env.ZCODE_RES_DIR || 'D:/Zcode/resources';
const APP_ASAR = path.join(RES, 'app.asar');
const BACKUP = path.join(RES, 'app.asar.original-backup.asar');
const ROLLING = path.join(RES, 'app.asar.last-bubble.asar');
const UI_MOD = __dirname;
const STAGING = path.join(os.tmpdir(), 'zcode-uimod-staging');
const WORK = path.join(os.tmpdir(), 'zcode-uimod-work');
const UNPACK_GLOB = '{**/*.node,**/*.dll,**/*.exe,**/node-pty/**,**/ssh2/**}';

function log(msg) { console.log('[ui-mod] ' + msg); }
function die(msg) { console.error('[ui-mod] ERROR: ' + msg); process.exit(1); }

function isZcodeRunning() {
  try {
    const out = require('child_process').execSync(
      'tasklist /FI "IMAGENAME eq ZCode.exe" /NH', { encoding: 'buffer' }).toString('latin1');
    return /ZCode\.exe/i.test(out);
  } catch (e) { return true; } // 检测失败时按"在运行"处理，宁可拦住
}

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }

function patchExtracted(work) {
  // 1) CSS: patch every renderer css that defines --color-accent (idempotent by marker)
  const bubble = fs.readFileSync(path.join(UI_MOD, 'bubble.css'), 'utf8');
  const assets = path.join(work, 'out', 'renderer', 'assets');
  const cssFiles = fs.readdirSync(assets).filter(f => f.endsWith('.css'));
  let cssPatched = 0;
  for (const f of cssFiles) {
    const p = path.join(assets, f);
    let s = fs.readFileSync(p, 'utf8');
    if (!s.includes('--color-accent')) continue;
    if (s.includes('__UI_MOD_BUBBLE__')) {
      // strip old block then re-add (keeps version fresh)
      s = s.replace(/\/\*__UI_MOD_BUBBLE__[\s\S]*?__UI_MOD_BUBBLE__ END \*\//g, '');
    }
    fs.writeFileSync(p, s + '\n' + bubble, 'utf8');
    cssPatched++;
  }
  if (!cssPatched) die('no target css found (app structure changed?)');
  log('css patched: ' + cssPatched + ' file(s)');

  // 2) DOM 诊断脚本（可选：公开发布版不带这个文件，自动跳过）
  const hasDump = fs.existsSync(path.join(UI_MOD, '__uimod__.js'));
  if (hasDump) fs.copyFileSync(path.join(UI_MOD, '__uimod__.js'), path.join(assets, '__uimod__.js'));
  // 2.5) 主题素材（如鲸鱼水印，文件存在才拷，CSS 以 url() 引用）
  if (fs.existsSync(path.join(UI_MOD, 'whale_wm.png'))) {
    fs.copyFileSync(path.join(UI_MOD, 'whale_wm.png'), path.join(assets, 'whale_wm.png'));
    log('theme asset: whale_wm.png copied');
  }
  if (hasDump) {
    const htmlPath = path.join(work, 'out', 'renderer', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    if (!html.includes('__uimod__.js')) {
      if (!html.includes('</body>')) die('index.html has no </body>');
      html = html.replace('</body>', '<script src="./assets/__uimod__.js"></script></body>');
      fs.writeFileSync(htmlPath, html, 'utf8');
      log('index.html: dump script injected');
    } else {
      log('index.html: already injected');
    }
  } else {
    log('no dump script, skip index.html injection');
  }
  return cssPatched;
}

async function doPack(work, outAsar) {
  // pack must produce <name>.unpacked next to output; pack as "app.asar" inside its own dir
  const outDir = path.dirname(outAsar);
  fs.mkdirSync(outDir, { recursive: true });
  await asar.createPackageWithOptions(work, outAsar, { unpack: UNPACK_GLOB });
  const n = (fs.existsSync(outAsar + '.unpacked'))
    ? (function count(d) { let c = 0; for (const e of fs.readdirSync(d, { withFileTypes: true })) { c += e.isDirectory() ? count(path.join(d, e.name)) : 1; } return c; })(outAsar + '.unpacked')
    : 0;
  log('packed: ' + outAsar + ' (' + Math.round(fs.statSync(outAsar).size / 1048576) + ' MB, unpacked files: ' + n + ')');
  if (n < 12) die('unpacked natives look wrong (' + n + ' files, expect >=12)');
}

async function install(dryRun) {
  if (isZcodeRunning()) die('ZCode is running. Close it first, then run this again.');
  if (!fs.existsSync(APP_ASAR)) die('app.asar not found at ' + APP_ASAR);

  // backup original once
  if (!fs.existsSync(BACKUP)) {
    fs.copyFileSync(APP_ASAR, BACKUP);
    log('backup created: app.asar.original-backup.asar');
  } else {
    log('backup already exists, keep it');
  }

  // fresh extract from CURRENT asar (works right after app updates too)
  rmrf(WORK);
  log('extracting current app.asar ...');
  await asar.extractAll(APP_ASAR, WORK);

  patchExtracted(WORK);

  // pack into staging as app.asar so unpacked dir gets the right name
  rmrf(STAGING);
  await doPack(WORK, path.join(STAGING, 'app.asar'));
  rmrf(WORK);

  if (dryRun) { log('dry-run complete, nothing installed.'); return; }

  // swap
  if (fs.existsSync(ROLLING)) fs.rmSync(ROLLING, { force: true });
  fs.renameSync(APP_ASAR, ROLLING);
  try {
    fs.copyFileSync(path.join(STAGING, 'app.asar'), APP_ASAR);
  } catch (e) {
    // rollback: put the previous asar back so ZCode still starts
    if (!fs.existsSync(APP_ASAR) && fs.existsSync(ROLLING)) fs.renameSync(ROLLING, APP_ASAR);
    throw e;
  }
  rmrf(path.join(RES, 'app.asar.unpacked'));
  const srcUnpacked = path.join(STAGING, 'app.asar.unpacked');
  if (fs.existsSync(srcUnpacked)) {
    // Temp 和 D: 是不同卷，rename 会 EXDEV，必须复制
    fs.cpSync(srcUnpacked, path.join(RES, 'app.asar.unpacked'), { recursive: true });
  } else {
    die('staging unpacked dir missing: ' + srcUnpacked);
  }
  rmrf(STAGING);
  log('installed. Start ZCode to see the bubble UI.');
}

function restore() {
  if (isZcodeRunning()) die('ZCode is running. Close it first, then run this again.');
  if (!fs.existsSync(BACKUP)) die('no backup found: ' + BACKUP);
  fs.copyFileSync(BACKUP, APP_ASAR);
  log('restored original app.asar (unpacked natives untouched).');
  log('Done. Start ZCode.');
}

const cmd = process.argv[2];
(async () => {
  if (cmd === 'install') await install(false);
  else if (cmd === 'dryrun') await install(true);
  else if (cmd === 'restore') restore();
  else die('usage: node install-core.cjs install|restore|dryrun');
})().catch(e => { console.error(e); die('failed'); });
