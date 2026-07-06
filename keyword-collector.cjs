const {chromium}=require('playwright');
const {launchOptions}=require('./browser-session.cjs');
const {acquireLock,releaseLock}=require('./browser-lock.cjs');

const [asinRaw,keywordRaw,pagesRaw]=process.argv.slice(2);
const asin=(asinRaw||'').toUpperCase();
const keyword=keywordRaw||'';
const maxPages=Math.max(1,Math.min(5,Number(pagesRaw)||3));
const strategyId=process.env.COLLECTOR_STRATEGY||'pw-chromium';

if(!/^[A-Z0-9]{10}$/.test(asin)||!keyword){
  console.error('Usage: keyword-collector ASIN keyword [pages]');
  process.exit(2);
}

async function isSponsored(card){
  const componentType=await card.getAttribute('data-component-type');
  if(componentType==='sp-sponsored-result')return true;
  if(await card.locator('[data-component-type="sp-sponsored-result"], .puis-sponsored-label-text, .s-sponsored-label-text, .s-label-popover-default').count())return true;
  const text=(await card.textContent())||'';
  return /\bSponsored\b/i.test(text);
}

function finalizeStatus(result){
  if(result.status==='needs_user'||result.status==='partial')return result;
  const hasOrganic=result.organicRank!=null;
  const hasSponsored=result.sponsoredRank!=null;
  if(hasOrganic)result.status='found';
  else if(hasSponsored)result.status='sponsored_only';
  else result.status='not_found_within_range';
  result.organicNote=hasOrganic?`自然排名 #${result.organicRank}（第 ${result.page} 页）`:`前 ${result.checkedPages} 页无自然排名`;
  result.sponsoredNote=hasSponsored?`广告排名 #${result.sponsoredRank}（第 ${result.sponsoredPage} 页）`:`前 ${result.checkedPages} 页无广告排名`;
  return result;
}

(async()=>{
  await acquireLock();
  const {strategy,profileDir,launch}=launchOptions(strategyId);
  try{
    const context=await chromium.launchPersistentContext(profileDir,launch);
    const page=context.pages()[0]||await context.newPage();
    if(strategy.blockAssets){
      await page.route('**/*',route=>{
        const type=route.request().resourceType();
        if(['image','media','font'].includes(type))return route.abort();
        return route.continue();
      });
    }

    let result={
      asin,keyword,strategy:strategyId,capturedAt:new Date().toISOString(),
      organicRank:null,sponsoredRank:null,page:null,sponsoredPage:null,
      status:'not_found_within_range',checkedPages:0,maxPages,
      sponsoredSeen:false,organicProductsChecked:0,sponsoredProductsChecked:0,
      sourceUrl:null,navigationError:null
    };
    let cumulativeOrganic=0,cumulativeSponsored=0;

    for(let pageNo=1;pageNo<=maxPages;pageNo++){
      let navigationError=null;
      try{
        await page.goto(`https://www.amazon.com/s?k=${encodeURIComponent(keyword)}&page=${pageNo}`,{waitUntil:strategy.waitUntil,timeout:strategy.gotoTimeout});
        await page.waitForSelector('[data-component-type="s-search-result"][data-asin], .s-result-item[data-asin]',{timeout:10000}).catch(()=>{});
      }catch(error){navigationError=error.name||'navigation_error'}
      await page.waitForTimeout(strategy.postWait);
      const sourceUrl=page.url();
      const body=(await page.locator('body').textContent().catch(()=>''))||'';
      result.sourceUrl=sourceUrl;result.navigationError=navigationError;
      if(/captcha|robot check|enter the characters/i.test(body)){result.status='needs_user';break}
      if(sourceUrl.startsWith('chrome-error:')||body.trim().length<100){result.status='partial';break}
      const cards=page.locator('[data-component-type="s-search-result"][data-asin], .s-result-item[data-asin]');
      const count=await cards.count();
      result.checkedPages=pageNo;
      let pageOrganic=0,pageSponsored=0;
      for(let i=0;i<count;i++){
        const card=cards.nth(i);
        const cardAsin=(await card.getAttribute('data-asin')||'').toUpperCase();
        const sponsored=await isSponsored(card);
        if(sponsored){
          pageSponsored++;result.sponsoredProductsChecked++;
          if(cardAsin===asin&&result.sponsoredRank==null){result.sponsoredSeen=true;result.sponsoredRank=cumulativeSponsored+pageSponsored;result.sponsoredPage=pageNo}
          continue;
        }
        pageOrganic++;result.organicProductsChecked++;
        if(cardAsin===asin&&result.organicRank==null){result.organicRank=cumulativeOrganic+pageOrganic;result.page=pageNo}
      }
      cumulativeOrganic+=pageOrganic;cumulativeSponsored+=pageSponsored;
    }
    finalizeStatus(result);
    await context.close();
    console.log(JSON.stringify(result));
  }finally{releaseLock()}
})().catch(error=>{releaseLock();console.error(error.stack||error.message);process.exit(1)});
