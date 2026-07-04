import {readFile,writeFile} from 'node:fs/promises';

const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
const title=String(event.issue?.title||'');
const body=String(event.issue?.body||'');
if(!title.startsWith('[ASIN Radar]'))throw new Error('not_asin_radar_request');
const match=body.match(/<!-- ASIN_RADAR_REQUEST\n([\s\S]*?)\n-->/);
if(!match)throw new Error('request_payload_missing');
const request=JSON.parse(match[1]);
const asin=String(request.asin||'').trim().toUpperCase();
if(!/^[A-Z0-9]{10}$/.test(asin))throw new Error('invalid_asin');
const keywords=[...new Set((Array.isArray(request.keywords)?request.keywords:[]).map(x=>String(x).trim()).filter(Boolean))];
if(keywords.length>5)throw new Error('keyword_limit_5');
const config=JSON.parse(await readFile('monitoring.config.json','utf8'));
config.products=Array.isArray(config.products)?config.products:[];
const existing=config.products.find(x=>x.asin===asin);
if(request.action==='add'){
  if(existing){existing.enabled=true;existing.keywords=keywords}else{if(config.products.length>=10)throw new Error('asin_limit_10');config.products.push({asin,enabled:true,keywords,competitors:[]})}
}else if(request.action==='keywords'){
  if(!existing)throw new Error('asin_not_found');existing.keywords=keywords;
}else if(request.action==='delete'){
  config.products=config.products.filter(x=>x.asin!==asin);
}else throw new Error('invalid_action');
await writeFile('monitoring.config.json',JSON.stringify(config,null,2)+'\n');
console.log(JSON.stringify({ok:true,action:request.action,asin,keywords}));
