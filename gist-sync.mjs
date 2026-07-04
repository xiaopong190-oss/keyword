import {readFile,writeFile,mkdir} from 'node:fs/promises';

const API='https://api.github.com';
const headers=token=>({Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'});
async function request(path,options,fetchImpl){const response=await fetchImpl(`${API}${path}`,options);if(!response.ok)throw new Error(`github_gist_${response.status}`);return response.status===204?null:response.json()}
async function existingId(env){if(env.GITHUB_GIST_ID)return env.GITHUB_GIST_ID;try{return (await readFile('data/gist-id.txt','utf8')).trim()}catch{return null}}
async function savePublicSource(gistId){await mkdir('public',{recursive:true});await writeFile('public/data-source.json',JSON.stringify({type:'github-gist',gistId,apiUrl:`https://api.github.com/gists/${gistId}`},null,2),'utf8')}
export async function syncToGist(file='public/data/latest.json',{env=process.env,fetchImpl=fetch,writePublicSource=true}={}){
  const token=env.GITHUB_GIST_TOKEN;if(!token)return {status:'skipped',reason:'gist_token_not_configured'};
  const latest=JSON.parse(await readFile(file,'utf8'));let gistId=await existingId(env),gist=null;
  if(gistId)gist=await request(`/gists/${gistId}`,{headers:headers(token)},fetchImpl);
  const month=latest.generatedAt.slice(0,7);const historyName=`history-${month}.json`;let history=[];
  const oldContent=gist?.files?.[historyName]?.content;if(oldContent){try{history=JSON.parse(oldContent)}catch{history=[]}}
  history.push(latest);const max=62;if(history.length>max)history=history.slice(-max);
  let reports='[]';try{reports=await readFile('public/data/reports.json','utf8')}catch{reports=gist?.files?.['reports.json']?.content||'[]'}let configContent=gist?.files?.['config.json']?.content;try{if(!configContent)configContent=await readFile('monitoring.config.json','utf8')}catch{configContent='{"products":[]}'}const files={'latest.json':{content:JSON.stringify(latest,null,2)},[historyName]:{content:JSON.stringify(history,null,2)},'reports.json':{content:reports},'config.json':{content:configContent}};
  if(!gistId){const created=await request('/gists',{method:'POST',headers:headers(token),body:JSON.stringify({description:'ASIN Radar data store',public:false,files})},fetchImpl);gistId=created.id;await mkdir('data',{recursive:true});await writeFile('data/gist-id.txt',gistId,'utf8');if(writePublicSource)await savePublicSource(gistId);return {status:'created',gistId,htmlUrl:created.html_url}}
  const updated=await request(`/gists/${gistId}`,{method:'PATCH',headers:headers(token),body:JSON.stringify({files})},fetchImpl);if(writePublicSource)await savePublicSource(gistId);return {status:'synced',gistId,htmlUrl:updated.html_url};
}
