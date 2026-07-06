const {chromium}=require('playwright');

const DEFAULT_URL=process.env.CHROME_DEBUG_URL||'http://127.0.0.1:9222';

async function connectCdp(url=DEFAULT_URL){
  const browser=await chromium.connectOverCDP(url,{timeout:8000});
  const context=browser.contexts()[0];
  if(!context)throw new Error('cdp_no_context');
  return {browser,context,debugUrl:url};
}

function findPage(context,predicate){
  for(const page of context.pages()){
    try{
      const href=page.url();
      if(predicate(href,page))return page;
    }catch{}
  }
  return null;
}

async function pageForUrl(context,url,options={}){
  const {waitUntil='domcontentloaded',timeout=60000,postWait=2500,preferExisting=true}=options;
  const match=url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp(match,'i');
  if(preferExisting){
    const existing=findPage(context,href=>pattern.test(href));
    if(existing){
      await existing.bringToFront().catch(()=>{});
      await existing.waitForTimeout(postWait);
      return {page:existing,reused:true};
    }
  }
  const page=await context.newPage();
  await page.goto(url,{waitUntil,timeout});
  await page.waitForTimeout(postWait);
  return {page,reused:false};
}

module.exports={DEFAULT_URL,connectCdp,findPage,pageForUrl};
