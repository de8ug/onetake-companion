const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { zipSync } = require('fflate');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const out = path.resolve(process.argv[2] || path.join(root, 'release'));
const files = {};
const allow = ['README.md', 'QUICKSTART.md', 'USER_GUIDE.zh-CN.md', 'API.md', 'SECURITY.md', 'LICENSE', 'package.json', 'package-lock.json', 'config.env.example', 'launcher.cjs', 'cli.cjs', 'start.command', 'start.cmd', 'src', 'ui', 'contracts'];
function add(source, relative) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error('Release source must not be a symlink: ' + relative);
  if (stat.isDirectory()) { for (const child of fs.readdirSync(source).sort()) add(path.join(source, child), relative + '/' + child); return; }
  if (!stat.isFile() || /(^|\/)(\.|config\.env$)|\.(log|db|mov|mp4|webm)$/.test(relative)) throw new Error('Unexpected release file: ' + relative);
  if (relative.endsWith('.test.cjs')) return;
  files['onetake-workbench/' + relative] = [new Uint8Array(fs.readFileSync(source)), { os: 3, attrs: (relative === 'start.command' ? 0o100755 : 0o100644) << 16, mtime: new Date('2026-11-15T00:00:00Z') }];
}
for (const relative of allow) add(path.join(root, relative), relative);
// Bundle just the locked, MIT-licensed ZIP runtime. No personal state or arbitrary node_modules.
const runtime = fs.realpathSync(path.join(root, 'node_modules/fflate'));
const lock = require('../package-lock.json');
if (require(path.join(runtime, 'package.json')).version !== lock.packages['node_modules/fflate'].version) throw new Error('Installed fflate differs from lockfile');
for (const relative of ['package.json', 'LICENSE', 'README.md', 'lib', 'esm']) add(path.join(runtime, relative), 'node_modules/fflate/' + relative);
fs.mkdirSync(out, { recursive: true });
const name = `onetake-workbench-${version}.zip`;
const bytes = Buffer.from(zipSync(files, { level: 9 }));
fs.writeFileSync(path.join(out, name), bytes);
const digest = crypto.createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(path.join(out, name.replace('.zip', '.sha256')), `${digest}  ${name}\n`);
console.log(JSON.stringify({ file: path.join(out, name), files: Object.keys(files).length, bytes: bytes.length, sha256: digest }));
