import {mkdir,readFile,writeFile} from 'node:fs/promises';

const file='data/collection-progress.json';

export async function writeProgress(patch){
  await mkdir('data',{recursive:true});
  let current={};
  try{current=JSON.parse(await readFile(file,'utf8'))}catch{}
  const next={...current,...patch,updatedAt:new Date().toISOString()};
  await writeFile(file,JSON.stringify(next,null,2));
}
