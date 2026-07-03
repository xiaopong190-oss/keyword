import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {basename,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const DEFAULT_MODEL=process.env.OPENAI_MODEL||'gpt-5.4-mini';
const CODEX_TIMEOUT=Number(process.env.CODEX_TIMEOUT_MS||120000);
const API_TIMEOUT=Number(process.env.OPENAI_TIMEOUT_MS||120000);
const DEEPSEEK_TIMEOUT=Number(process.env.DEEPSEEK_TIMEOUT_MS||120000);

export function hasApiKey(env=process.env){return typeof env.OPENAI_API_KEY==='string'&&env.OPENAI_API_KEY.trim().length>0}

function runProcess(command,args,input,timeoutMs){return new Promise((resolvePromise,reject)=>{const child=spawn(command,args,{stdio:['pipe','pipe','pipe'],windowsHide:true});let stdout='',stderr='',settled=false;const timer=setTimeout(()=>{if(!settled){settled=true;child.kill();reject(new Error('local_codex_timeout'))}},timeoutMs);child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.on('error',e=>{clearTimeout(timer);if(!settled){settled=true;reject(e)}});child.on('close',code=>{clearTimeout(timer);if(settled)return;settled=true;if(code===0&&stdout.trim())resolvePromise(stdout.trim());else reject(new Error(stderr.trim()||`local_codex_exit_${code}`))});child.stdin.end(input)})}

export async function analyzeWithLocalCodex(prompt,{timeoutMs=CODEX_TIMEOUT}={}){
  // 成功执行比检测窗口进程更可靠：已登录、额度和CLI可用性会被一起验证。
  return runProcess('codex',['exec','--skip-git-repo-check','-'],prompt,timeoutMs);
}

export async function analyzeWithApi(prompt,{apiKey=process.env.OPENAI_API_KEY,model=DEFAULT_MODEL,timeoutMs=API_TIMEOUT,fetchImpl=fetch}={}){
  if(!apiKey)throw new Error('openai_api_key_missing');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model,input:prompt}),signal:controller.signal});if(!response.ok)throw new Error(`openai_api_${response.status}`);const data=await response.json();if(data.output_text)return data.output_text;const text=(data.output||[]).flatMap(item=>item.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n');if(!text)throw new Error('openai_api_empty_output');return text}finally{clearTimeout(timer)}
}

export async function analyzeWithDeepSeek(prompt,{deepseekApiKey=process.env.DEEPSEEK_API_KEY,deepseekModel=process.env.DEEPSEEK_MODEL||'deepseek-v4-flash',deepseekTimeoutMs=DEEPSEEK_TIMEOUT,fetchImpl=fetch}={}){
  if(!deepseekApiKey)throw new Error('deepseek_api_key_missing');const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),deepseekTimeoutMs);
  try{const response=await fetchImpl('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${deepseekApiKey}`},body:JSON.stringify({model:deepseekModel,messages:[{role:'system',content:'你是亚马逊运营数据分析师。只基于提供的数据分析，不虚构缺失指标。'},{role:'user',content:prompt}],thinking:{type:'disabled'}}),signal:controller.signal});if(!response.ok)throw new Error(`deepseek_api_${response.status}`);const data=await response.json();const text=data.choices?.[0]?.message?.content;if(!text)throw new Error('deepseek_api_empty_output');return text}finally{clearTimeout(timer)}
}

export async function analyzeWithFallback(prompt,options={}){
  const attempts=[];const order=(options.providerOrder||process.env.ANALYSIS_PROVIDER_ORDER||'codex,deepseek,openai').split(',').map(x=>x.trim()).filter(Boolean);const providers={codex:{name:'codex-local',run:options.localAnalyzer||analyzeWithLocalCodex},deepseek:{name:'deepseek-api',run:options.deepseekAnalyzer||analyzeWithDeepSeek},openai:{name:'openai-api',run:options.apiAnalyzer||analyzeWithApi}};
  for(const key of order){const provider=providers[key];if(!provider)continue;try{const text=await provider.run(prompt,options);return {provider:provider.name,text,attempts}}catch(error){attempts.push({provider:provider.name,error:error.message})}}
  return {provider:'queued',text:null,attempts};
}

export async function runAnalysisFile(inputPath,outputPath){const input=await readFile(resolve(inputPath),'utf8');const result=await analyzeWithFallback(input);const target=resolve(outputPath||`analysis-output/${basename(inputPath)}.analysis.json`);await mkdir(dirname(target),{recursive:true});await writeFile(target,JSON.stringify({...result,createdAt:new Date().toISOString()},null,2),'utf8');return {target,provider:result.provider}}

if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){const [input,output]=process.argv.slice(2);if(!input){console.error('Usage: node --env-file=.env.local analysis-provider.mjs <input-file> [output-file]');process.exitCode=2}else runAnalysisFile(input,output).then(x=>console.log(`analysis saved: ${x.target} (${x.provider})`)).catch(e=>{console.error(e.message);process.exitCode=1})}
