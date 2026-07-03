const {chromium}=require('playwright');
const crypto=require('crypto');
const path=require('path');

const asin=(process.argv[2]||'').toUpperCase();
const maxPages=Math.max(1,Math.min(3,Number(process.argv[3])||1));
if(!/^[A-Z0-9]{10}$/.test(asin)){console.error('Invalid ASIN');process.exit(2)}

const clean=s=>s?.replace(/\s+/g,' ').trim()||null;
const star=s=>{const m=String(s||'').match(/[0-5](?:\.[0-9])?/);return m?Number(m[0]):null};
const date=s=>{const m=String(s||'').match(/(?:on|于)\s+(.+)$/i);if(!m)return null;const d=new Date(m[1]);return Number.isNaN(d.valueOf())?null:d.toISOString().slice(0,10)};

async function extract(page,items){
  const cards=page.locator('[data-hook="review"], [data-hook="review-card"]');
  const count=await cards.count();
  for(let i=0;i<count;i++){
    const c=cards.nth(i),id=await c.getAttribute('id');
    const get=async selectors=>{for(const s of selectors){const x=c.locator(s);if(await x.count()){const v=clean(await x.first().textContent().catch(()=>null));if(v)return v}}return null};
    const dateText=await get(['[data-hook="review-date"]','.review-date']);
    const item={asin,capturedAt:new Date().toISOString(),date:date(dateText),rating:star(await get(['[data-hook="review-star-rating"]','[data-hook="cmps-review-star-rating"]','i[data-hook] .a-icon-alt'])),title:await get(['[data-hook="review-title"]','.review-title']),body:await get(['[data-hook="review-body"]','.review-text']),verified:/verified purchase/i.test((await c.textContent())||'')};
    if(!item.body&&!item.title)continue;
    item.reviewKey=id||crypto.createHash('sha256').update(`${asin}|${item.date}|${item.title}|${item.body}`).digest('hex');
    if(!items.some(x=>x.reviewKey===item.reviewKey))items.push(item);
  }
  return count;
}

(async()=>{
  const context=await chromium.launchPersistentContext(path.join(__dirname,'.chrome-profile'),{headless:true,channel:'chrome',locale:'en-US',timezoneId:'America/Los_Angeles',viewport:{width:1365,height:900},args:['--disable-blink-features=AutomationControlled']});
  const items=[];let status='success',sourceUrl=null,navigationError=null,observedPage=false,fallbackUsed=false,pageTitle=null,bodyHint=null;
  for(let pageNo=1;pageNo<=maxPages;pageNo++){
    const page=await context.newPage();
    await page.route('**/*',r=>['image','media','font'].includes(r.request().resourceType())?r.abort():r.continue());
    try{await page.goto(`https://www.amazon.com/product-reviews/${asin}/?reviewerType=all_reviews&sortBy=recent&pageNumber=${pageNo}`,{waitUntil:'domcontentloaded',timeout:30000})}catch(e){navigationError=e.name||'navigation_error'}
    await page.waitForTimeout(2500);sourceUrl=page.url();pageTitle=await page.title().catch(()=>null);const body=(await page.locator('body').textContent().catch(()=>''))||'';bodyHint=clean(body)?.slice(0,240)||null;
    if(/captcha|robot check|enter the characters/i.test(`${pageTitle} ${body}`)){status='needs_user';await page.close();break}
    if(sourceUrl.startsWith('chrome-error:')||body.trim().length<100){status='partial';await page.close();break}
    observedPage=true;const count=await extract(page,items);await page.close();if(count===0)break;
  }
  // Amazon 偶尔对独立评论页返回空壳；回退到商品页内嵌评论区。
  if(status!=='needs_user'&&items.length===0){
    fallbackUsed=true;const page=await context.newPage();await page.route('**/*',r=>['image','media','font'].includes(r.request().resourceType())?r.abort():r.continue());
    try{await page.goto(`https://www.amazon.com/dp/${asin}#customerReviews`,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(3500);sourceUrl=page.url();pageTitle=await page.title().catch(()=>pageTitle);const body=(await page.locator('body').textContent().catch(()=>''))||'';bodyHint=clean(body)?.slice(0,240)||bodyHint;if(/captcha|robot check|enter the characters/i.test(`${pageTitle} ${body}`))status='needs_user';else{await extract(page,items);if(items.length)status='success'}}catch(e){navigationError=e.name||'fallback_navigation_error'}await page.close();
  }
  if(status==='success'&&(!observedPage||items.length===0))status='partial';
  await context.close();console.log(JSON.stringify({asin,capturedAt:new Date().toISOString(),sourceUrl,navigationError,status,fallbackUsed,pageTitle,bodyHint,reviews:items}));
})().catch(e=>{console.error(e.stack||e.message);process.exit(1)});
