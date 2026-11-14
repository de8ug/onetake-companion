const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { unzipSync } = require('fflate');
test('release ZIP extracts to a standalone runtime and contains no personal state', () => {
 const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'onetake-release-'));
 try {
  const run = spawnSync(process.execPath,[path.join(__dirname,'../scripts/package-release.cjs'),tmp],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const result=JSON.parse(run.stdout), entries=unzipSync(fs.readFileSync(result.file));
  for(const [name,bytes] of Object.entries(entries)) {
   assert(name.startsWith('onetake-workbench/'));
   assert.doesNotMatch(name, /(^|\/)(\.git|\.env|\.onetake-pro|config\.env|pairing-token|model-settings\.json)(\/|$)|\.(mov|mp4|db|log)$/);
   const file=path.join(tmp,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);
  }
  const isolated=path.join(tmp,'onetake-workbench');
  const loaded=spawnSync(process.execPath,['-e','require("./src/server.cjs");require("fflate")'],{cwd:isolated,encoding:'utf8',env:{PATH:process.env.PATH,HOME:tmp}});
  assert.equal(loaded.status,0,loaded.stderr);
  assert(!fs.existsSync(path.join(tmp,'.onetake-pro')));
  const cli=spawnSync(process.execPath,['cli.cjs','--help'],{cwd:isolated,encoding:'utf8'});
  assert.equal(cli.status,0,cli.stderr);
 } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});
