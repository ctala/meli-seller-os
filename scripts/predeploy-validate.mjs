import fs from 'node:fs';
const file=process.argv[2]||'wrangler.toml';
if(!fs.existsSync(file)) throw new Error(`missing ${file}; copy wrangler.example.toml first`);
const text=fs.readFileSync(file,'utf8');
if(/00000000-0000-0000-0000-000000000000|REPLACE_WITH_D1_DATABASE_UUID/.test(text)) throw new Error('placeholder D1 database_id rejected');
console.log(`predeploy configuration accepted: ${file}`);
