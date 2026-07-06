import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {openDatabase,saveProduct,saveKeyword,saveReviews,dashboardData} from './database.mjs';
import {syncToGist} from './gist-sync.mjs';
import {getLocalConfig} from './config-store.mjs';
import {writeProgress} from './collection-progress.mjs';
import {strategiesFor,analyzeProduct,analyzeKeyword,mergeProductAttempts,mergeKeywordAttempts} from './collection-strategies.mjs';

const require=createRequire(import.meta.url);
const {releaseLock}=require('./browser-lock.cjs');
const {loadProxyPool,pickProxy,proxyEnv}=require('./proxy-pool.cjs');

const config=await getLocalConfig();
const proxyPool=loadProxyPool(config);
const productStrategies=strategiesFor(config);
const keywordStrategies=strategiesFor(config);
const root=resolve('.');
const stageTimeoutFor=stage=>{
  const pages=Number(config.maxSearchPages)||3;
  if(stage==='keyword')return Number(config.keywordTimeoutMs)||Math.max(240000,pages*40000);
  return Number(config.productTimeoutMs)||Number(config.stageTimeoutMs)||90000;
};
const node=process.execPath;
const env={...process.env,NODE_PATH:resolve('node_modules'),CHROME_DEBUG_URL:config.chromeDebugUrl||process.env.CHROME_DEBUG_URL||'http://127.0.0.1:9222'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const log=(message,extra={})=>{console.error(`[${new Date().toISOString()}] ${message}`);return writeProgress({message,...extra})};
const validAsin=x=>/^[A-Z0-9]{10}$/.test(String(x||''));

function run(script,args,timeoutMs,strategyId,proxySeed=0){
  const proxy=strategyId==='chrome-proxy'?pickProxy(proxyPool,proxySeed,config.proxy?.rotation||'round-robin'):null;
  const proxyVars=proxyEnv(proxy);
  return new Promise((ok,bad)=>{
    const p=spawn(node,[script,...args],{env:{...env,...proxyVars,COLLECTOR_STRATEGY:strategyId},cwd:root,windowsHide:true});
    let out='',err='';
    const timer=setTimeout(()=>{p.kill('SIGKILL');releaseLock();bad(new Error(`${script}_timeout`))},timeoutMs);
    p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);
    p.on('close',code=>{
      clearTimeout(timer);
      if(code===0){
        try{
          const text=out.trim();
          const line=text.includes('\n')?text.split('\n').filter(x=>x.trim().startsWith('{')).at(-1)||text:text;
          ok(JSON.parse(line));
        }catch{bad(new Error(`${script}_invalid_json`))}
      }else bad(new Error(err.trim()||`${script}_exit_${code}`));
    });
  });
}

function scriptFor(stage,strategyId){
  if(strategyId==='chrome-cdp')return stage==='product'?'cdp-product-collector.cjs':'cdp-keyword-collector.cjs';
  return stage==='product'?'playwright-collector.cjs':'keyword-collector.cjs';
}

async function runMultiStrategy({stage,args,strategies,analyze,merge,timeoutMs,asin,keyword}){
  const attempts=[];
  for(const strategyId of strategies){
    const script=scriptFor(stage,strategyId);
    const proxyNote=strategyId==='chrome-proxy'&&proxyPool.length?` · IP ${pickProxy(proxyPool,attempts.length,config.proxy?.rotation||'round-robin')?.label||'proxy'}`:'';
    await log(`${stage}${keyword?` · ${keyword}`:''} · 策略 ${strategyId}${proxyNote}`,{running:true,stage,asin,keyword:keyword||null,strategy:strategyId});
    try{
      releaseLock();
      const value=await run(script,args,timeoutMs,strategyId,attempts.length);
      const analysis=analyze(value,strategyId);
      attempts.push({strategy:strategyId,value,analysis});
      await log(`${strategyId}：${analysis.ok?'成功':'失败'}（${analysis.reasons.slice(0,2).join('；')}）`,{running:true,stage,strategy:strategyId});
    }catch(error){
      const analysis={strategy:strategyId,ok:false,status:'error',score:-100,missing:['all'],reasons:[error.message],sourceUrl:null};
      attempts.push({strategy:strategyId,value:null,analysis});
      releaseLock();
    }
    await sleep(2000);
  }
  const bundle=merge(attempts);
  return {ok:bundle.ok,merged:bundle.merged,attempts:bundle.attempts,reasons:bundle.reasons,missing:bundle.missing,winner:bundle.winner,agreement:bundle.agreement};
}

const db=openDatabase();
const summary={startedAt:new Date().toISOString(),products:[],keywords:[],reviews:[],validation:[],stageFailures:[],needsUser:[],errors:[]};
await log('多策略采集开始',{running:true,stage:'start'});
releaseLock();

for(const item of config.products.filter(x=>x.enabled)){
  const configCheck={stage:'config',asin:item.asin,ok:validAsin(item.asin)&&Array.isArray(item.keywords)&&item.keywords.length<=5};
  summary.validation.push(configCheck);
  if(!configCheck.ok){summary.stageFailures.push({...configCheck,reason:'invalid_config'});continue}

  const product=await runMultiStrategy({
    stage:'product',args:[item.asin],
    strategies:productStrategies,analyze:analyzeProduct,merge:mergeProductAttempts,
    timeoutMs:stageTimeoutFor('product'),asin:item.asin
  });

  if(product.ok&&product.merged?.asin){
    const result=product.merged;
    const embedded=result.embeddedReviews||[];
    const validEmbedded=embedded.filter(x=>x.body&&x.date&&x.rating>=1&&x.rating<=5);
    result.validEmbeddedReviews=validEmbedded;
    result.strategyResults=product.attempts;
    saveProduct(db,result);
    summary.products.push({...result,strategies:product.attempts,winner:product.winner});
    summary.validation.push({stage:'product',asin:item.asin,ok:true,winner:product.winner,agreement:product.agreement,missing:product.missing,reasons:product.reasons,attempts:product.attempts});
  }else{
    summary.stageFailures.push({asin:item.asin,stage:'product',reasons:product.reasons,missing:product.missing,attempts:product.attempts});
    summary.validation.push({stage:'product',asin:item.asin,ok:false,missing:product.missing,reasons:product.reasons,attempts:product.attempts});
    await log(`商品页全部策略失败，继续关键词：${item.asin}`,{running:true,stage:'product_failed',asin:item.asin});
  }

  for(const keyword of item.keywords||[]){
    const result=await runMultiStrategy({
      stage:'keyword',args:[item.asin,keyword,String(config.maxSearchPages||3)],
      strategies:keywordStrategies,analyze:analyzeKeyword,merge:mergeKeywordAttempts,
      timeoutMs:stageTimeoutFor('keyword'),asin:item.asin,keyword
    });
    if(result.ok&&result.merged?.asin){
      const value={...result.merged,strategyResults:result.attempts};
      saveKeyword(db,value);
      summary.keywords.push({...value,winner:result.winner,agreement:result.agreement});
      summary.validation.push({stage:'keyword',asin:item.asin,keyword,ok:true,winner:result.winner,agreement:result.agreement,missing:result.missing,reasons:result.reasons});
    }else{
      summary.stageFailures.push({asin:item.asin,keyword,stage:'keyword',reasons:result.reasons,missing:result.missing,attempts:result.attempts});
      summary.validation.push({stage:'keyword',asin:item.asin,keyword,ok:false,missing:result.missing,reasons:result.reasons,attempts:result.attempts});
    }
  }

  if(product.ok){
    await log(`reviews · ${item.asin} · 策略 chrome-system`,{running:true,stage:'reviews',asin:item.asin,strategy:'chrome-system'});
    try{
      const reviewValue=await run('review-collector.cjs',[item.asin,String(config.maxReviewPages||1)],Number(config.reviewTimeoutMs)||120000,'chrome-system');
      const valid=(reviewValue.reviews||[]).filter(x=>x.asin===item.asin&&x.body&&x.date&&x.rating>=1&&x.rating<=5);
      if(reviewValue.status==='success'&&valid.length){saveReviews(db,valid);summary.reviews.push({asin:item.asin,status:'success',count:valid.length,reportedTotal:product.merged.reviews,validation:reviewValue.validation,source:'review_page'});summary.validation.push({stage:'reviews',asin:item.asin,ok:true,count:valid.length})}
      else{summary.reviews.push({asin:item.asin,status:'failed',count:0,reportedTotal:product.merged.reviews,reason:'no_valid_review_bodies',diagnostic:{status:reviewValue.status,sourceUrl:reviewValue.sourceUrl,navigationError:reviewValue.navigationError,reviewLink:reviewValue.reviewLink,validation:reviewValue.validation}});summary.validation.push({stage:'reviews',asin:item.asin,ok:false});summary.stageFailures.push({asin:item.asin,stage:'reviews',reason:'no_valid_review_bodies'})}
    }catch(error){summary.reviews.push({asin:item.asin,status:'failed',count:0,reportedTotal:product.merged.reviews,reason:error.message});summary.validation.push({stage:'reviews',asin:item.asin,ok:false,error:error.message});summary.stageFailures.push({asin:item.asin,stage:'reviews',reason:error.message})}
  }

  await sleep(config.delayBetweenRequestsMs||3000);
}

await mkdir('public/data',{recursive:true});
const latest=dashboardData(db);
latest.collectionHealth={generatedAt:new Date().toISOString(),reviews:summary.reviews,stageFailures:summary.stageFailures,validation:summary.validation};
await writeFile('public/data/latest.json',JSON.stringify(latest,null,2));
for(const item of config.products.filter(x=>x.enabled)){
  const productRows=db.prepare(`SELECT COUNT(*) n FROM product_snapshots WHERE asin=? AND status='success'`).get(item.asin).n;
  const keywordRows=db.prepare(`SELECT COUNT(*) n FROM keyword_snapshots WHERE asin=?`).get(item.asin).n;
  summary.validation.push({stage:'database',asin:item.asin,ok:productRows>0||keywordRows>0,checks:{productRows,keywordRows}});
}
try{
  summary.gist=await syncToGist();
  summary.validation.push({stage:'gist',ok:['created','synced'].includes(summary.gist.status),status:summary.gist.status});
}catch(e){
  summary.gist={status:'failed',error:e.message};
}
await mkdir('data/runs',{recursive:true});
summary.finishedAt=new Date().toISOString();
const runFile=`data/runs/${summary.startedAt.replace(/[:.]/g,'-')}.json`;
await writeFile(runFile,JSON.stringify(summary,null,2));
await log('多策略采集完成',{running:false,stage:'done',products:summary.products.length,keywords:summary.keywords.length});
console.log(JSON.stringify({runFile,products:summary.products.length,keywords:summary.keywords.length,reviews:summary.reviews,stageFailures:summary.stageFailures,validation:summary.validation},null,2));
