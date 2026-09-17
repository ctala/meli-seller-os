import {describe,it,expect} from 'vitest';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

const scanner=join(process.cwd(),'scripts/public-scan.mjs');
const repo=(prefix:string)=>{
  const cwd=mkdtempSync(join(tmpdir(),prefix));
  execFileSync('git',['init','-q'],{cwd});
  execFileSync('git',['config','user.email','test@example.test'],{cwd});
  execFileSync('git',['config','user.name','test'],{cwd});
  return cwd;
};
const run=(cwd:string)=>execFileSync('node',[scanner],{cwd,encoding:'utf8',stdio:'pipe'});

describe('scanner complete Git surfaces',()=>{
  it('rejects a staged secret even when the worktree version is safe',()=>{
    const cwd=repo('meli-scan-staged-');
    writeFileSync(join(cwd,'note.txt'),'access'+'_token=abcdefghijk');
    execFileSync('git',['add','note.txt'],{cwd});
    writeFileSync(join(cwd,'note.txt'),'safe worktree text');
    expect(()=>run(cwd)).toThrow();
  });

  it('rejects a reachable historical real ID when HEAD is safe',()=>{
    const cwd=repo('meli-scan-history-');
    writeFileSync(join(cwd,'note.txt'),'ML'+'C12345678');
    execFileSync('git',['add','note.txt'],{cwd});
    execFileSync('git',['commit','-qm','unsafe historical fixture'],{cwd});
    writeFileSync(join(cwd,'note.txt'),'safe HEAD text');
    execFileSync('git',['add','note.txt'],{cwd});
    execFileSync('git',['commit','-qm','safe head'],{cwd});
    expect(()=>run(cwd)).toThrow();
  });
});
