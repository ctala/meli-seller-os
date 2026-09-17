import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const skip=new Set(['node_modules','.git','.wrangler']);
const rules=[
  [/\bMLC\d{6,}\b/i,'real_item_id'],
  [/(?:seller(?:_id)?|item_id)\s*[:=]\s*['\"]?(?!1000000[1-9]\b)\d{8,12}/i,'real_numeric_id'],
  [/\b(?:sk_live|api[_-]?key|access[_-]?token)\s*[=:]\s*[A-Za-z0-9_-]{8,}/i,'secret'],
  [/[A-Za-z0-9._%+-]+@(?!example\.test\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,'email'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,'private_key'],
  [/receipt_mac|"mac"\s*:\s*"[a-f0-9]{32,}/i,'receipt'],
  [/https?:\/\/(?!example\.test\b|api\.mercadolibre\.com\b)[^\s'"`]+/i,'real_domain'],
  [/\bCristian\b/i,'personal_name']
];

function command(command,args){return execFileSync(command,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});}
function exempt(file,rule,content){return file==='package.json'&&(
  rule==='personal_name'||(rule==='real_domain'&&/github\.com\/ctala\/meli-seller-os/.test(content))
);}
function scanText(file,content,bad){
  for(const [re,name] of rules)if(re.test(content)&&!exempt(file,name,content))bad.push(`${file}:${name}`);
  if(/\.[cm]?[jt]s$/.test(file)&&file!=='src/index.ts'&&(/POST\s+['"`]\/answers|method\s*:\s*['"]POST['"][\s\S]{0,100}\/answers/i.test(content)||/PUT\s+['"`]\/items\//i.test(content)))bad.push(`${file}:alternate_write`);
  if(/\.[cm]?[jt]s$/.test(file)&&/POST\s+(?:['"`])?\/items(?:['"`/]|$)/i.test(content))bad.push(`${file}:create_listing`);
}
function scanPath(file,bad){
  if((file.startsWith('.env.')||file.startsWith('.dev.vars.'))&&file!=='.env.example')bad.push(`${file}:hidden_secret_file`);
}
function worktreeFiles(dir,files=[]){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(skip.has(entry.name))continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())worktreeFiles(full,files);
    else if(entry.isFile())files.push(path.relative(root,full));
  }
  return files;
}
function readSurfaceFile(file){
  try{return fs.readFileSync(path.join(root,file),'utf8');}
  catch{try{return command('git',['show',`:${file}`]);}catch{return null;}}
}
function scanRepositorySurface(bad){
  let indexed=[];
  try{indexed=command('git',['ls-files','--cached']).trim().split('\n').filter(Boolean);}catch{}
  for(const file of new Set([...worktreeFiles(root),...indexed])){
    scanPath(file,bad);
    if(file==='scripts/public-scan.mjs'||file.startsWith('tests/')||file==='package-lock.json')continue;
    const content=readSurfaceFile(file);
    if(content!==null)scanText(file,content,bad);
  }
}
function scanGitObjects(bad){
  for(const args of [['fsck','--full','--no-reflogs'],['fsck','--full','--no-reflogs','--unreachable']]){
    let output='';
    try{output=command('git',args);}catch(error){output=`${error.stdout||''}${error.stderr||''}`;bad.push('git_fsck:failed');}
    for(const line of output.split('\n'))if(/^(?:dangling|unreachable) (?:blob|commit|tree|tag)\b/.test(line))bad.push(`git_fsck:${line}`);
  }
}
function scanPack(bad){
  if(!fs.existsSync(path.join(root,'package.json')))return;
  let manifest;
  try{manifest=JSON.parse(command('npm',['pack','--dry-run','--json','--ignore-scripts']));}
  catch{bad.push('npm_pack:failed');return;}
  const entries=Array.isArray(manifest)?manifest[0]?.files:manifest?.files;
  if(!Array.isArray(entries)){bad.push('npm_pack:missing_manifest');return;}
  for(const entry of entries){
    const file=typeof entry==='string'?entry:entry?.path;
    if(typeof file!=='string'){bad.push('npm_pack:invalid_manifest');continue;}
    scanPath(file,bad);
    let content;
    try{content=fs.readFileSync(path.join(root,file),'utf8');}catch{bad.push(`${file}:pack_member_unreadable`);continue;}
    scanText(file,content,bad);
  }
}

const bad=[];
scanRepositorySurface(bad);
scanGitObjects(bad);
scanPack(bad);
if(bad.length){console.error([...new Set(bad)].join('\n'));process.exit(1);}
console.log('public scan passed');
