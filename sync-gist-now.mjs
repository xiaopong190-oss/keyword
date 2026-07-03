import {openDatabase,dashboardData} from './database.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {syncToGist} from './gist-sync.mjs';

await mkdir('public/data',{recursive:true});
await writeFile('public/data/latest.json',JSON.stringify(dashboardData(openDatabase()),null,2));
const result=await syncToGist();
console.log(JSON.stringify(result,null,2));
if(result.status==='skipped')process.exitCode=2;
