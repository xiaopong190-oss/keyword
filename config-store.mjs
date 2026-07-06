import {readFile,writeFile} from 'node:fs/promises';

const file='monitoring.config.json';

function normalizeConfig(config){
  config.products=(config.products||[]).map(p=>({
    ...p,
    keywords:Array.isArray(p.keywords)?p.keywords:(p.keywords?[p.keywords]:[]),
    competitors:Array.isArray(p.competitors)?p.competitors:(p.competitors?[p.competitors]:[])
  }));
  return config;
}

export async function resolveConfigApiUrl(){
  if(process.env.CONFIG_API_URL)return process.env.CONFIG_API_URL.replace(/\/$/,'');
  try{
    const runtime=JSON.parse(await readFile('public/runtime-config.json','utf8'));
    return runtime.configApiUrl?.replace(/\/$/,'')||null;
  }catch{
    return null;
  }
}

async function readLocalConfig(){
  return normalizeConfig(JSON.parse(await readFile(file,'utf8')));
}

async function writeLocalConfig(config){
  await writeFile(file,JSON.stringify(config,null,2)+'\n');
}

export async function fetchRemoteConfig(apiUrl){
  const resolved=apiUrl||await resolveConfigApiUrl();
  if(!resolved)throw new Error('config_api_url_missing');
  const response=await fetch(`${resolved}/config`);
  if(!response.ok)throw new Error(`config_api_${response.status}`);
  return normalizeConfig(await response.json());
}

export async function pullRemoteConfig(){
  const apiUrl=await resolveConfigApiUrl();
  if(!apiUrl)return null;
  const remote=await fetchRemoteConfig(apiUrl);
  await writeLocalConfig(remote);
  return remote;
}

export async function pushRemoteConfig(action,asin,keywords=[]){
  const apiUrl=await resolveConfigApiUrl();
  if(!apiUrl)return null;
  const response=await fetch(`${apiUrl}/config`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({action,asin,keywords})
  });
  if(!response.ok)throw new Error(`config_push_${response.status}`);
  return response.json();
}

export async function getLocalConfig(){
  return readLocalConfig();
}

export async function getConfig(){
  const apiUrl=await resolveConfigApiUrl();
  if(apiUrl){
    try{
      const remote=await fetchRemoteConfig(apiUrl);
      await writeLocalConfig(remote);
      return remote;
    }catch(error){
      console.error(`Remote config pull failed, using local file: ${error.message}`);
    }
  }
  return readLocalConfig();
}

export async function addProduct({asin,keywords=[]}){
  const config=await readLocalConfig(),id=String(asin||'').trim().toUpperCase();
  if(!/^[A-Z0-9]{10}$/.test(id))throw new Error('invalid_asin');
  if(config.products.some(x=>x.asin===id))throw new Error('asin_exists');
  if(config.products.length>=10)throw new Error('asin_limit_10');
  const normalized=keywords.map(x=>String(x).trim()).filter(Boolean).slice(0,5);
  config.products.push({asin:id,enabled:true,keywords:normalized,competitors:[]});
  await writeLocalConfig(config);
  try{await pushRemoteConfig('add',id,normalized)}catch(error){console.error(`Remote config push failed: ${error.message}`)}
  return config;
}

export async function deleteProduct(asin){
  const config=await readLocalConfig(),before=config.products.length;
  config.products=config.products.filter(x=>x.asin!==asin);
  if(config.products.length===before)throw new Error('asin_not_found');
  for(const p of config.products)p.competitors=(p.competitors||[]).filter(x=>x!==asin);
  await writeLocalConfig(config);
  try{await pushRemoteConfig('delete',asin,[])}catch(error){console.error(`Remote config push failed: ${error.message}`)}
  return config;
}

export async function setKeywords({asin,keywords=[]}){
  const config=await readLocalConfig(),id=String(asin||'').trim().toUpperCase(),product=config.products.find(x=>x.asin===id);
  if(!product)throw new Error('asin_not_found');
  if(!Array.isArray(keywords))throw new Error('keywords_must_be_array');
  const normalized=[...new Set(keywords.map(x=>String(x).trim()).filter(Boolean))].slice(0,5);
  product.keywords=normalized;
  await writeLocalConfig(config);
  try{await pushRemoteConfig('keywords',id,normalized)}catch(error){console.error(`Remote config push failed: ${error.message}`)}
  return config;
}
