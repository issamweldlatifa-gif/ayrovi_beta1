#!/usr/bin/env node
/**
 * جهوزية الإصدار — يشغّلها صاحب المشروع **قبل** ما يبعث بناء AAB.
 *
 * علاش: كل واحد من البنود اللي تحت ينجّم يفشل بلا ما يبان: بصمة App Links ناقصة
 * ⇒ الروابط ما تفتحش التطبيق؛ `versionCode` عاود استعمل ⇒ Play يرفض الحزمة؛
 * خادم موش منشور ⇒ الدخول يفشل في التلفون؛ أسرار ناقصة ⇒ الأزرار ما تخدمش.
 * كل واحد من هذوما يتقال هنا بصراحة: PASS ولا FAIL ولا WARN ولا SKIP — بلا
 * «يبدو جاهزاً».
 *
 * الاستعمال:
 *   node scripts/release-preflight.mjs --api-base https://ayrovi-beta1-1.onrender.com \
 *        --version-name 2.0.1 --version-code 8
 *   node scripts/release-preflight.mjs --json          # تقرير للآلة
 *
 * ملاحظة: الأسرار ما تتقراش ولا تتعرض — كان `gh` موجود نتحقّقوا من **الأسماء**
 * فقط، وإلاّ نقولوها SKIP بصراحة.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS = {
  apiBase: 'https://ayrovi-beta1-1.onrender.com',
  origin: 'https://ayrovi-beta1-1.onrender.com',
  packageName: 'app.ayrovi.mobile',
  repo: 'issamweldlatifa-gif/ayrovi_beta1',
  branch: 'arena/c0321e79-ayrovi-beta1',
  timeoutMs: 8000,
};
/** الأسرار الأربعة اللي يستعملها `.github/workflows/mobile-release-aab.yml`. */
const SECRET_NAMES = [
  'ANDROID_KEYSTORE_BASE64',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
];

function parseArgs(argv) {
  const options = { ...DEFAULTS, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`القيمة ناقصة لـ${token}`);
      return argv[index];
    };
    switch (token) {
      case '--api-base': options.apiBase = next(); break;
      case '--origin': options.origin = next(); break;
      case '--package': options.packageName = next(); break;
      case '--repo': options.repo = next(); break;
      case '--branch': options.branch = next(); break;
      case '--version-name': options.versionName = next(); break;
      case '--version-code': options.versionCode = Number(next()); break;
      case '--timeout': options.timeoutMs = Number(next()); break;
      case '--branch-commit': options.branchCommit = next(); break;
      case '--secrets': options.secrets = next().split(',').map((value) => value.trim()).filter(Boolean); break;
      case '--json': options.json = true; break;
      case '--help': case '-h': options.help = true; break;
      default: throw new Error(`مدخل غير معروف: ${token}`);
    }
  }
  return options;
}

function usage() {
  return [
    'release-preflight — جهوزية الإصدار قبل بناء AAB',
    '',
    'المدخلات (كلها اختيارية):',
    '  --api-base <url>     عنوان الخادم اللي يتچرى في الحزمة (افتراضي https://ayrovi-beta1-1.onrender.com)',
    '  --origin <url>       أصل الموقع اللي فيه assetlinks.json (افتراضي مثل الخادم)',
    '  --package <id>       اسم الحزمة (افتراضي app.ayrovi.mobile)',
    '  --version-name <s>   الإصدار اللي باش يتنشر (لازم ≥ متاع app.json)',
    '  --version-code <n>   كود الإصدار (لازم > متاع app.json، يزيد دايماً)',
    '  --branch-commit <s>  SHA متاع الفرع بدل سؤال GitHub',
    '  --secrets a,b,c      أسماء الأسرار الموجودة بدل استعمال gh',
    '  --json               تقرير JSON للآلة (يزد على الطبع العادي)',
    '  --timeout <ms>       مهلة كل طلب شبكة (افتراضي 8000)',
  ].join('\n');
}

function appJson() {
  const file = path.join(HERE, '..', 'app.json');
  try {
    const payload = JSON.parse(readFileSync(file, 'utf8'));
    const expo = payload.expo || {};
    return {
      ok: true,
      version: String(expo.version || ''),
      versionCode: Number(expo.android?.versionCode ?? 0),
      packageName: String(expo.android?.package || ''),
      hosts: (expo.android?.intentFilters || [])
        .flatMap((filter) => filter?.data || [])
        .map((entry) => String(entry?.host || ''))
        .filter(Boolean),
    };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

function compareVersions(left, right) {
  const a = String(left).split('.').map((part) => Number(part) || 0);
  const b = String(right).split('.').map((part) => Number(part) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/** بصمة شهادة SHA-256 كما يشترطها أندرويد: 32 بايت `AA:BB:…`. */
function isValidFingerprint(value) {
  return /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(String(value || '').trim());
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: response.status, json, text: text.slice(0, 300) };
  } catch (error) {
    return { status: 0, json: null, text: '', error: String(error?.name === 'AbortError' ? 'timeout' : error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    return { status: response.status, text: (await response.text()).slice(0, 4000) };
  } catch (error) {
    return { status: 0, text: '', error: String(error?.name === 'AbortError' ? 'timeout' : error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

function ghSecretNames(repo) {
  try {
    const output = execFileSync('gh', ['secret', 'list', '--repo', repo], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, names: output.split('\n').map((line) => line.split('\t')[0].trim()).filter(Boolean) };
  } catch (error) {
    return { ok: false, error: String(error?.stderr || error?.message || error).trim().slice(0, 200) };
  }
}

async function githubBranchCommit(repo, branch, timeoutMs) {
  const result = await fetchJson(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch)}`, timeoutMs);
  if (result.status !== 200 || !result.json?.sha) {
    return { ok: false, detail: `GitHub ما جاوبش (${result.status || result.error || 'خطأ'})` };
  }
  return { ok: true, sha: String(result.json.sha).slice(0, 12) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const checks = [];
  const record = (id, label, status, detail) => checks.push({ id, label, status, detail });

  // 1) هوية التطبيق: الحزمة في app.json لازم تطابق اللي ننشروه — وإلاّ الروابط
  //    العميقة والحزمة على Play يتباعدوا بلا ما يبان.
  const app = appJson();
  if (!app.ok) {
    record('app-json', 'app.json', 'fail', `ما تقراش: ${app.error}`);
  } else {
    record('app-json', 'app.json',
      app.packageName === options.packageName ? 'pass' : 'fail',
      `الحزمة ${app.packageName} · الإصدار ${app.version} (${app.versionCode}) · النطاقات: ${app.hosts.join(', ') || '—'}`);
  }

  // 2) الإصدار: Play يرفض versionCode معاد استعماله، والاسم ما ينقصش.
  if (app.ok) {
    if (!Number.isFinite(options.versionCode)) {
      record('version-code', 'كود الإصدار', 'fail', 'لازم --version-code (رقم صحيح)');
    } else if (options.versionCode <= app.versionCode) {
      record('version-code', 'كود الإصدار', 'fail', `${options.versionCode} ≤ ${app.versionCode} (متاع app.json) — Play يرفض إعادة استعمال نفس الكود`);
    } else {
      record('version-code', 'كود الإصدار', 'pass', `${options.versionCode} > ${app.versionCode}`);
    }
    if (options.versionName) {
      const order = compareVersions(options.versionName, app.version);
      record('version-name', 'اسم الإصدار',
        order < 0 ? 'fail' : 'pass',
        order < 0 ? `${options.versionName} أصغر من ${app.version}` : `${options.versionName} (app.json: ${app.version})`);
    } else {
      record('version-name', 'اسم الإصدار', 'skip', 'بلا --version-name: ننشروا نفس اسم app.json');
    }
  }

  // 3) الخادم: حيّ + جاهز + أي كود منشور فعلاً.
  const health = await fetchJson(`${options.apiBase}/api/health`, options.timeoutMs);
  record('server-health', 'الخادم يجاوب',
    health.status === 200 && health.json?.status === 'ok' ? 'pass' : 'fail',
    health.status === 200 ? `v${health.json?.version ?? '?'}` : `ما جاوبش: ${health.error || health.status}`);

  let deployedCommit = '';
  if (health.status === 200) {
    const ready = await fetchJson(`${options.apiBase}/api/ready`, options.timeoutMs);
    if (ready.status === 200 && ready.json?.status === 'ready') {
      deployedCommit = String(ready.json.commit || '');
      record('server-ready', 'قاعدة البيانات والجاهزية', 'pass', `commit=${deployedCommit || '?'}`);
      const deployedBranch = String(ready.json.branch || '');
      if (!deployedCommit || deployedCommit === 'local') {
        record('server-deploy', 'كود الفرع منشور؟', 'warn',
          'الخادم يقول commit=local ⇒ موش منشور من Git. تعديلات الفرع (دخول التطبيق، AYWEBs) ما توصلش للتلفون.');
      } else if (deployedBranch && deployedBranch !== 'unknown' && deployedBranch !== options.branch) {
        // الخادم يعلن الفرع: نتحقّقو منو بالحرف بدل ما نخمّنو من الـSHA.
        record('server-branch', 'فرع الخادم', 'warn',
          `الخادم منشور من «${deployedBranch}» وموش من «${options.branch}» ⇒ كود الفرع هذا ما وصلوش.`);
      } else if (options.branchCommit) {
        const same = deployedCommit.startsWith(options.branchCommit.slice(0, 7));
        record('server-deploy', 'كود الفرع منشور؟', same ? 'pass' : 'warn',
          same ? `نفس ${options.branchCommit.slice(0, 7)}` : `المنشور ${deployedCommit} · رأس الفرع ${options.branchCommit.slice(0, 7)}`);
      }
    } else {
      record('server-ready', 'قاعدة البيانات والجاهزية', 'fail', `ما جاوبش: ${ready.error || ready.status}`);
    }
  }

  // 4) إعدادات البيع الفعلية: هي اللي يشوفها المستعمل في شاشة الشراء.
  if (health.status === 200) {
    const config = await fetchJson(`${options.apiBase}/api/public/commerce-config`, options.timeoutMs);
    if (config.status === 200 && config.json && typeof config.json === 'object') {
      const capability = config.json.capabilities || {};
      const deposit = config.json.deposit || {};
      const methods = Array.isArray(config.json.paymentMethods) ? config.json.paymentMethods : [];
      record('commerce-config', 'إعدادات الشراء', 'pass',
        `وسائل مقبولة: ${methods.join('، ') || 'كل شي'} · تسبقة ${deposit.percent ?? '?'}% · بوابة الكارطة ${capability.cardGateway ? 'مركّبة' : 'موش مركّبة'}`);
      if (!deposit.bankRib && !deposit.posteAccount) {
        record('deposit-details', 'تفاصيل التحويل', 'warn', 'بلا RIB وبلا حساب بريدي ⇒ تحويل/البريد ما يتاحوش في التطبيق');
      }
    } else {
      record('commerce-config', 'إعدادات الشراء', 'warn', `ما تقرتش: ${config.error || config.status}`);
    }
  }

  // 5) الروابط العميقة: النصف الثاني (بصمة المفتاح) — الحاجة الوحيدة اللي
  //    يخلّيها المالك، وهي أكثر حاجة تنسى.
  const links = await fetchText(`${options.origin}/.well-known/assetlinks.json`, options.timeoutMs);
  if (links.status === 200) {
    let parsed = null;
    try { parsed = JSON.parse(links.text); } catch { parsed = null; }
    const target = Array.isArray(parsed) ? parsed.find((entry) => entry?.target?.package_name === options.packageName) : null;
    const fingerprints = Array.isArray(target?.target?.sha256_cert_fingerprints) ? target.target.sha256_cert_fingerprints : [];
    const valid = fingerprints.filter(isValidFingerprint);
    if (!target) {
      record('assetlinks', 'روابط أندرويد (assetlinks.json)', 'fail', `الملف ينشر، وما فيهش الحزمة ${options.packageName}`);
    } else if (valid.length === 0) {
      record('assetlinks', 'روابط أندرويد (assetlinks.json)', 'fail', 'بصمة SHA-256 صالحة ما فماش (32 بايت)');
    } else {
      record('assetlinks', 'روابط أندرويد (assetlinks.json)', 'pass', `${valid.length} بصمة · ${valid[0].slice(0, 17)}…`);
      if (valid.length < 2) {
        record('assetlinks-play', 'بصمة Google Play', 'warn',
          'بصمة واحدة: كان Play يعيد التوقيع (App Signing)، زيد بصمة Play Console وإلاّ التطبيق المثبّت من Play ما يفتحش الروابط.');
      }
    }
  } else if (links.status === 404) {
    record('assetlinks', 'روابط أندرويد (assetlinks.json)', 'fail',
      `404 — ما فماش بصمة مضبوطة في بيئة الخادم (ANDROID_APP_LINK_SHA256) على ${options.origin}`);
  } else {
    record('assetlinks', 'روابط أندرويد (assetlinks.json)', 'warn', `ما تقراش: ${links.error || links.status}`);
  }

  // 5.b) تطابق نطاق الروابط العميقة مع أصل الخادم: `intentFilters` تعلن نطاقاً،
  //      و`assetlinks.json` لازم يكون على **نفس** النطاق. كان الأصل مختلفاً
  //      (Render مقابل نطاق مستقبلي)، الروابط ما تفتحش التطبيق — نقولوها.
  if (app.ok && app.hosts.length > 0) {
    let originHost = '';
    try { originHost = new URL(options.origin).host; } catch { originHost = ''; }
    const declared = app.hosts.map((host) => String(host).trim()).filter(Boolean);
    const matches = declared.includes(originHost);
    record('links-host', 'نطاق الروابط العميقة',
      matches ? 'pass' : 'warn',
      matches
        ? `${originHost} معلن في app.json`
        : `app.json يعلن ${declared.join(', ')} بينما الخادم على ${originHost || '—'} — الروابط ما تفتحش التطبيق حتى يتوحّدو`);
  }

  // 6) الأسرار (الأسماء فقط، موش القيم): بلاها زرّ البناء ما يخدمش.
  const secrets = options.secrets
    ? { ok: true, names: options.secrets }
    : ghSecretNames(options.repo);
  if (!secrets.ok) {
    record('secrets', 'أسرار التوقيع', 'skip', `gh ما خدمش (${secrets.error}) — تحقّق يدوياً من: ${SECRET_NAMES.join(', ')}`);
  } else {
    const missing = SECRET_NAMES.filter((name) => !secrets.names.includes(name));
    record('secrets', 'أسرار التوقيع', missing.length ? 'fail' : 'pass',
      missing.length ? `ناقصة: ${missing.join(', ')}` : 'الأربعة موجودين');
  }

  // 7) رأس الفرع: للتذكير بمن نبنوا — وما نغلطوش بين فرع و`main`.
  const branchCommit = options.branchCommit
    ? { ok: true, sha: options.branchCommit.slice(0, 12) }
    : await githubBranchCommit(options.repo, options.branch, options.timeoutMs);
  record('branch', 'رأس الفرع', branchCommit.ok ? 'pass' : 'skip',
    branchCommit.ok ? `${options.branch} = ${branchCommit.sha}` : branchCommit.detail);

  const summary = {
    pass: checks.filter((check) => check.status === 'pass').length,
    warn: checks.filter((check) => check.status === 'warn').length,
    fail: checks.filter((check) => check.status === 'fail').length,
    skip: checks.filter((check) => check.status === 'skip').length,
  };
  const report = { ok: summary.fail === 0, apiBase: options.apiBase, origin: options.origin, summary, checks };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return report.ok ? 0 : 1;
  }

  const marks = { pass: 'PASS', fail: 'FAIL', warn: 'WARN', skip: 'SKIP' };
  console.log(`جهوزية الإصدار — ${options.apiBase}`);
  console.log('─'.repeat(64));
  for (const check of checks) {
    console.log(`[${marks[check.status]}] ${check.label} — ${check.detail}`);
  }
  console.log('─'.repeat(64));
  console.log(`النتيجة: ${summary.fail} فشل · ${summary.warn} تحذير · ${summary.skip} متخطّى · ${summary.pass} ناجح`);
  console.log(summary.fail === 0
    ? 'البناء ينجّم يمشي. راجع التحذيرات قبل ما تنشره.'
    : 'ما تبنِش توّا: كمّل اللي فشل (الأسرار ولا البصمة ولا الخادم).');
  return report.ok ? 0 : 1;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    console.error(`release-preflight: ${error?.message || error}`);
    process.exitCode = 1;
  });
