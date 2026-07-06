const {connectCdp,findPage}=require('./cdp-session.cjs');

const [asinRaw,keywordRaw,pagesRaw]=process.argv.slice(2);
const asin=(asinRaw||'').toUpperCase();
const keyword=keywordRaw||'';
const maxPages=Math.max(1,Math.min(5,Number(pagesRaw)||3));
const debugUrl=process.env.CHROME_DEBUG_URL||'http://127.0.0.1:9222';

if(!/^[A-Z0-9]{10}$/.test(asin)||!keyword){
  console.error('Usage: cdp-keyword-collector ASIN keyword [pages]');
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

function needsUser(message){
  return {asin,keyword,strategy:'chrome-cdp',status:'needs_user',checkedPages:0,organicRank:null,sponsoredRank:null,navigationError:'waiting_for_page',notes:[message]};
}

function keywordPattern(){
  const encoded=encodeURIComponent(keyword).replace(/%/g,'(?:%..)?');
  return new RegExp(`[?&]k=${encoded.replace(/\s+/g,'(?:\\+|%20)')}`,'i');
}

async function extractFromPage(page,pageNo,result,cumulativeOrganic,cumulativeSponsored){
  await page.bringToFront().catch(()=>{});
  await page.waitForTimeout(1200);
  const sourceUrl=page.url();
  const body=(await page.locator('body').textContent().catch(()=>''))||'';
  result.sourceUrl=sourceUrl;
  if(/captcha|robot check|enter the characters/i.test(body)){result.status='needs_user';return {stop:true}}
  if(sourceUrl.startsWith('chrome-error:')||body.trim().length<100){result.status='partial';result.navigationError='page_not_loaded';return {stop:true}}
  const cards=page.locator('[data-component-type="s-search-result"][data-asin], .s-result-item[data-asin]');
  const count=await cards.count();
  if(!count){result.status='partial';result.navigationError='no_search_results';return {stop:true}}
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
  return {stop:false,pageOrganic,pageSponsored};
}

(async()=>{
  let browser;
  try{
    ({browser}=await connectCdp(debugUrl));
    const context=browser.contexts()[0];
    const pattern=keywordPattern();
    const result={
      asin,keyword,strategy:'chrome-cdp',capturedAt:new Date().toISOString(),
      organicRank:null,sponsoredRank:null,page:null,sponsoredPage:null,
      status:'not_found_within_range',checkedPages:0,maxPages,
      sponsoredSeen:false,organicProductsChecked:0,sponsoredProductsChecked:0,
      sourceUrl:null,navigationError:null
    };
    let cumulativeOrganic=0,cumulativeSponsored=0;

    for(let pageNo=1;pageNo<=maxPages;pageNo++){
      const page=findPage(context,href=>/\/s\?/.test(href)&&pattern.test(href)&&(!pageNo||new RegExp(`(?:^|[?&])page=${pageNo}(?:&|$)`).test(href)||pageNo===1&&!/[?&]page=/.test(href)));
      if(!page){
        const searchUrl=`https://www.amazon.com/s?k=${encodeURIComponent(keyword)}&page=${pageNo}`;
        console.log(JSON.stringify(needsUser(pageNo===1?`请在 Chrome 中打开关键词搜索第 ${pageNo} 页：${searchUrl}`:`请打开第 ${pageNo} 页：${searchUrl}`)));
        process.exit(0);
      }
      const extracted=await extractFromPage(page,pageNo,result,cumulativeOrganic,cumulativeSponsored);
      if(extracted.stop)break;
      cumulativeOrganic+=extracted.pageOrganic;cumulativeSponsored+=extracted.pageSponsored;
    }
    finalizeStatus(result);
    console.log(JSON.stringify(result));
  }catch(error){
    const message=String(error.message||error);
    const hint=/ECONNREFUSED|connect|timeout/i.test(message)?'请先运行 start-chrome-debug.cmd':message;
    console.log(JSON.stringify(needsUser(hint)));
    process.exit(0);
  }finally{browser=null}
})().catch(error=>{console.error(error.stack||error.message);process.exit(1)});
