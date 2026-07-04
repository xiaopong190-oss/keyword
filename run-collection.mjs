import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {openDatabase,saveProduct,saveKeyword,saveReviews,dashboardData} from './database.mjs';
import {syncToGist} from './gist-sync.mjs';

const config=JSON.parse(await readFile('monitoring.config.json','utf8'));
const node=process.execPath;
const modules='C:/Users/15869/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const env={...process.env,NODE_PATH:`${modules};${modules}/.pnpm/node_modules`};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function run(script,args,timeoutMs=60000){return new Promise((ok,bad)=>{const p=spawn(node,[script,...args],{env,windowsHide:true});let out='',err='';const timer=setTimeout(()=>{p.kill();bad(new Error(`${script}_timeout`))},timeoutMs);p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',bad);p.on('close',code=>{clearTimeout(timer);if(code===0){try{ok(JSON.parse(out.trim()))}catch{bad(new Error(`${script}_invalid_json`))}}else bad(new Error(err||`${script}_exit_${code}`))})})}

async function retryStage({stage,script,args,accept,attempts=config.retryAttempts||3}){const failures=[];for(let attempt=1;attempt<=attempts;attempt++){try{const value=await run(script,args,config.stageTimeoutMs||60000);if(accept(value))return {ok:true,value,attempt,failures};failures.push({attempt,result:value.status||value.result?.status||'rejected'})}catch(e){failures.push({attempt,error:e.message})}if(attempt<attempts)await sleep((config.retryDelaysMs||[30000,120000])[attempt-1]||120000)}return {ok:false,stage,failures}}

const db=openDatabase();
const summary={startedAt:new Date().toISOString(),products:[],keywords:[],reviews:[],stageFailures:[],needsUser:[],errors:[]};

for(const item of config.products.filter(x=>x.enabled)){
  const product=await retryStage({stage:'product',script:'playwright-collector.cjs',args:[item.asin],accept:x=>x.result?.status==='success'});
  if(product.ok){const embedded=product.value.result.embeddedReviews||[],validEmbedded=embedded.filter(x=>x.body&&x.date&&x.rating>=1&&x.rating<=5);product.value.result.validEmbeddedReviews=validEmbedded;saveProduct(db,product.value.result);if(validEmbedded.length)saveReviews(db,validEmbedded);summary.products.push({...product.value.result,attempts:product.attempt})}else{summary.stageFailures.push({asin:item.asin,...product});continue}

  for(const keyword of item.keywords||[]){const result=await retryStage({stage:'keyword',script:'keyword-collector.cjs',args:[item.asin,keyword,String(config.maxSearchPages||2)],accept:x=>['found','not_found_within_range','sponsored_only'].includes(x.status)});if(result.ok){saveKeyword(db,result.value);summary.keywords.push({...result.value,attempts:result.attempt})}else{summary.stageFailures.push({asin:item.asin,keyword,...result})}}

  if(product.value.result.validEmbeddedReviews?.length){summary.reviews.push({asin:item.asin,status:'success',count:product.value.result.validEmbeddedReviews.length,reportedTotal:product.value.result.reviews,source:'product_page',attempts:product.attempt})}else{const reviews=await retryStage({stage:'reviews',script:'review-collector.cjs',args:[item.asin,String(config.maxReviewPages||1)],accept:x=>x.status==='success'&&x.reviews?.length>0});if(reviews.ok){saveReviews(db,reviews.value.reviews||[]);summary.reviews.push({asin:item.asin,status:'success',count:reviews.value.reviews.length,reportedTotal:product.value.result.reviews,validation:reviews.value.validation,source:'review_page',attempts:reviews.attempt})}else{summary.reviews.push({asin:item.asin,status:'failed',count:0,reportedTotal:product.value.result.reviews,reason:product.value.result.reviews>0?'reported_reviews_but_no_valid_bodies':'no_reviews_reported'});summary.stageFailures.push({asin:item.asin,...reviews});if(reviews.failures.some(x=>x.result==='needs_user'))summary.needsUser.push({asin:item.asin,stage:'reviews'})}}
  if(config.delayBetweenRequestsMs)await sleep(config.delayBetweenRequestsMs);
}

await mkdir('public/data',{recursive:true});
const latest=dashboardData(db);latest.collectionHealth={generatedAt:new Date().toISOString(),reviews:summary.reviews,stageFailures:summary.stageFailures};
await writeFile('public/data/latest.json',JSON.stringify(latest,null,2));
try{summary.gist=await syncToGist()}catch(e){summary.gist={status:'failed',error:e.message}}
await mkdir('data/runs',{recursive:true});summary.finishedAt=new Date().toISOString();
const runFile=`data/runs/${summary.startedAt.replace(/[:.]/g,'-')}.json`;await writeFile(runFile,JSON.stringify(summary,null,2));
console.log(JSON.stringify({runFile,products:summary.products.length,keywords:summary.keywords.length,reviews:summary.reviews,gist:summary.gist,stageFailures:summary.stageFailures,needsUser:summary.needsUser},null,2));
