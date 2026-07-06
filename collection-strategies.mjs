export const LEGACY_STRATEGIES=['pw-chromium','chrome-system','pw-fullload'];
export const EFFECTIVE_STRATEGIES=['chrome-cdp','chrome-system'];

export function strategiesFor(config={}){
  if(process.env.GITHUB_ACTIONS==='true')return ['chrome-system'];
  if(Array.isArray(config.collectionStrategies)&&config.collectionStrategies.length)return config.collectionStrategies;
  if(config.collectionMode==='legacy')return LEGACY_STRATEGIES;
  const pool=config.proxy?.enabled&&Array.isArray(config.proxy.servers)&&config.proxy.servers.length;
  if(pool||process.env.PROXY_LIST||process.env.PROXY_URL)return ['chrome-cdp','chrome-proxy','chrome-system'];
  return EFFECTIVE_STRATEGIES;
}

export const PRODUCT_STRATEGIES=EFFECTIVE_STRATEGIES;
export const KEYWORD_STRATEGIES=EFFECTIVE_STRATEGIES;

const PRODUCT_REQUIRED=['title','bsr'];
const PRODUCT_OPTIONAL=['price','rating','reviews'];
const KEYWORD_REQUIRED=['checkedPages'];
const KEYWORD_RANK_FIELDS=['organicRank','sponsoredRank'];

export function scoreProduct(result){
  let score=0;
  if(result?.title)score+=40;
  if(Array.isArray(result?.bsr)&&result.bsr.length)score+=30;
  if(result?.price)score+=10;
  if(result?.rating!=null)score+=10;
  if(result?.reviews!=null)score+=10;
  if(result?.status==='success')score+=20;
  if(result?.status==='needs_user')score-=50;
  return score;
}

export function scoreKeyword(result){
  let score=0;
  if(Number(result?.checkedPages)>0)score+=20;
  if(result?.organicRank!=null)score+=50;
  if(result?.sponsoredRank!=null)score+=25;
  if(result?.status==='found')score+=20;
  if(result?.status==='sponsored_only')score+=10;
  if(result?.status==='not_found_within_range'&&Number(result?.checkedPages)>0)score+=15;
  if(result?.status==='needs_user')score-=50;
  if(result?.status==='partial')score-=20;
  return score;
}

export function analyzeProduct(result,strategyId){
  if(!result)return {strategy:strategyId,ok:false,status:'error',score:-100,missing:PRODUCT_REQUIRED.concat(PRODUCT_OPTIONAL),reasons:['脚本未返回数据'],sourceUrl:null};
  const missing=[];
  const reasons=[];
  const r=result?.result||result||{};
  if(!r.title)missing.push('title');
  if(!Array.isArray(r.bsr)||!r.bsr.length)missing.push('bsr');
  if(!r.price)missing.push('price');
  if(r.rating==null)missing.push('rating');
  if(r.reviews==null)missing.push('reviews');
  if(r.navigationError)reasons.push(`导航失败：${r.navigationError}`);
  if(r.captcha||r.status==='needs_user')reasons.push('需要人工验证（验证码/登录）');
  if(r.status==='partial')reasons.push('页面不完整');
  if(Array.isArray(r.notes))reasons.push(...r.notes);
  if(!reasons.length&&!missing.filter(x=>PRODUCT_REQUIRED.includes(x)).length)reasons.push('采集成功');
  return {strategy:strategyId,ok:!!r.title&&Array.isArray(r.bsr)&&r.bsr.length>0,status:r.status||'unknown',score:scoreProduct(r),missing,reasons,sourceUrl:r.sourceUrl||null};
}

export function analyzeKeyword(result,strategyId){
  if(!result)return {strategy:strategyId,ok:false,status:'error',score:-100,missing:KEYWORD_REQUIRED.concat(KEYWORD_RANK_FIELDS),reasons:['脚本未返回数据'],sourceUrl:null};
  const missing=[];
  const reasons=[];
  const r=result||{};
  if(!Number(r.checkedPages))missing.push('checkedPages');
  if(r.organicRank==null)missing.push('organicRank');
  if(r.sponsoredRank==null)missing.push('sponsoredRank');
  if(r.navigationError)reasons.push(`导航失败：${r.navigationError}`);
  if(r.status==='needs_user')reasons.push('需要人工验证（验证码/登录）');
  if(r.status==='partial')reasons.push('搜索页未加载完成');
  if(r.status==='not_found_within_range')reasons.push(`前 ${r.checkedPages||0} 页无自然排名且无广告排名`);
  if(r.status==='sponsored_only')reasons.push('仅出现在广告位，无自然排名');
  if(r.status==='found')reasons.push(`自然排名 #${r.organicRank}`);
  if(r.organicNote)reasons.push(r.organicNote);
  if(r.sponsoredNote)reasons.push(r.sponsoredNote);
  return {strategy:strategyId,ok:Number(r.checkedPages)>0&&['found','not_found_within_range','sponsored_only'].includes(r.status),status:r.status||'unknown',score:scoreKeyword(r),missing,reasons,sourceUrl:r.sourceUrl||null};
}

export function mergeProductAttempts(attempts){
  const ranked=[...attempts].sort((a,b)=>b.analysis.score-a.analysis.score);
  const winner=ranked.find(x=>x.analysis.ok)||ranked[0];
  if(!winner||!winner.value)return {ok:false,winner:null,merged:null,attempts:ranked.map(x=>x.analysis),reasons:ranked.map(x=>`${x.strategy}：${x.analysis.reasons.join('；')}`),missing:PRODUCT_REQUIRED.concat(PRODUCT_OPTIONAL)};

  const merged={...(winner.value.result||{}),strategy:winner.strategy,capturedAt:new Date().toISOString()};
  for(const field of ['title','price','rating','reviews','pageTitle','sourceUrl']){
    if(merged[field]==null||merged[field]===''){
      for(const item of ranked){
        const v=item.value?.result?.[field];
        if(v!=null&&v!==''){merged[field]=v;break;}
      }
    }
  }
  if(!Array.isArray(merged.bsr)||!merged.bsr.length){
    for(const item of ranked){
      if(Array.isArray(item.value?.result?.bsr)&&item.value.result.bsr.length){merged.bsr=item.value.result.bsr;break;}
    }
  }
  const ok=!!merged.title&&Array.isArray(merged.bsr)&&merged.bsr.length>0;
  const missing=PRODUCT_REQUIRED.concat(PRODUCT_OPTIONAL).filter(f=>{
    if(f==='bsr')return !Array.isArray(merged.bsr)||!merged.bsr.length;
    if(f==='rating'||f==='reviews')return merged[f]==null;
    return !merged[f];
  });
  const agreeing=ranked.filter(x=>x.analysis.ok);
  return {
    ok,
    winner:winner.strategy,
    merged,
    attempts:ranked.map(x=>x.analysis),
    agreement:agreeing.length,
    reasons:ok?[`${agreeing.length} 个策略成功，采用 ${winner.strategy}`]:ranked.map(x=>`${x.strategy}：${x.analysis.reasons.join('；')}`),
    missing
  };
}

export function mergeKeywordAttempts(attempts){
  const ranked=[...attempts].sort((a,b)=>b.analysis.score-a.analysis.score);
  const usable=ranked.filter(x=>Number(x.value?.checkedPages)>0);
  const winner=usable.find(x=>x.analysis.ok)||usable[0]||ranked[0];
  if(!winner||!Number(winner.value?.checkedPages)){
    return {ok:false,winner:null,merged:null,attempts:ranked.map(x=>x.analysis),reasons:ranked.map(x=>`${x.strategy}：${x.analysis.reasons.join('；')}`),missing:KEYWORD_REQUIRED.concat(KEYWORD_RANK_FIELDS)};
  }

  const merged={...winner.value,strategy:winner.strategy,capturedAt:new Date().toISOString()};
  merged.checkedPages=Math.max(...usable.map(x=>Number(x.value.checkedPages)||0),merged.checkedPages||0);

  const organic=usable.map(x=>x.value.organicRank).filter(x=>x!=null);
  const sponsored=usable.map(x=>x.value.sponsoredRank).filter(x=>x!=null);
  if(organic.length){
    merged.organicRank=Math.min(...organic);
    const src=usable.find(x=>x.value.organicRank===merged.organicRank);
    merged.page=src?.value?.page??merged.page;
  }
  if(sponsored.length){
    merged.sponsoredRank=Math.min(...sponsored);
    const src=usable.find(x=>x.value.sponsoredRank===merged.sponsoredRank);
    merged.sponsoredPage=src?.value?.sponsoredPage??merged.sponsoredPage;
  }

  if(merged.organicRank!=null)merged.status='found';
  else if(merged.sponsoredRank!=null)merged.status='sponsored_only';
  else merged.status='not_found_within_range';

  merged.organicNote=merged.organicRank!=null?`自然排名 #${merged.organicRank}（第 ${merged.page} 页）`:`前 ${merged.checkedPages} 页无自然排名`;
  merged.sponsoredNote=merged.sponsoredRank!=null?`广告排名 #${merged.sponsoredRank}（第 ${merged.sponsoredPage} 页）`:`前 ${merged.checkedPages} 页无广告排名`;
  merged.strategyResults=ranked.map(x=>({strategy:x.strategy,status:x.value?.status,organicRank:x.value?.organicRank,sponsoredRank:x.value?.sponsoredRank,checkedPages:x.value?.checkedPages,score:x.analysis.score,ok:x.analysis.ok,reasons:x.analysis.reasons,missing:x.analysis.missing}));

  const organicSet=new Set(organic);
  const sponsoredSet=new Set(sponsored);
  const agreement={
    organic:organicSet.size<=1?'一致':`差异：${[...organicSet].join(' / ')}`,
    sponsored:sponsoredSet.size<=1?'一致':`差异：${[...sponsoredSet].join(' / ')}`
  };

  const missing=KEYWORD_RANK_FIELDS.filter(f=>merged[f]==null);
  if(!Number(merged.checkedPages))missing.unshift('checkedPages');

  return {
    ok:Number(merged.checkedPages)>0&&['found','not_found_within_range','sponsored_only'].includes(merged.status),
    winner:winner.strategy,
    merged,
    attempts:ranked.map(x=>x.analysis),
    agreement,
    reasons:usable.filter(x=>x.analysis.ok).length>1?[`${usable.filter(x=>x.analysis.ok).length} 个策略成功，合并去重后采用 ${winner.strategy}`]:winner.analysis.reasons,
    missing
  };
}
