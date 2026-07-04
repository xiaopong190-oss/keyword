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
  const items=[];let status='partial',sourceUrl=null,navigationError=null,observedPage=false,fallbackUsed=false,pageTitle=null,bodyHint=null,reviewLink=null;
  const page=context.pages()[0]||await context.newPage();
  await page.route('**/*',r=>['image','media','font'].includes(r.request().resourceType())?r.abort():r.continue());
  // 先打开可访问率更高的商品页，并继承该页面产生的 Cookie 与真实评论链接。
  try{await page.goto(`https://www.amazon.com/dp/${asin}#customerReviews`,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(3500)}catch(e){navigationError=e.name||'product_navigation_error'}
  sourceUrl=page.url();pageTitle=await page.title().catch(()=>null);let body=(await page.locator('body').textContent().catch(()=>''))||'';bodyHint=clean(body)?.slice(0,240)||null;
  if(/captcha|robot check|enter the characters/i.test(`${pageTitle} ${body}`))status='needs_user';
  else if(!sourceUrl.startsWith('chrome-error:')&&body.trim().length>=100){observedPage=true;await extract(page,items);const links=page.locator('a[data-hook="see-all-reviews-link-foot"], #reviews-medley-footer a, a[href*="product-reviews"]');if(await links.count())reviewLink=await links.first().getAttribute('href')}
  // 商品页没有内嵌正文时，使用页面实际给出的链接进入评论页，而不是猜测直链。
  if(status!=='needs_user'&&reviewLink){
    fallbackUsed=true;for(let pageNo=1;pageNo<=maxPages;pageNo++){try{const u=new URL(reviewLink,'https://www.amazon.com');u.searchParams.set('sortBy','recent');u.searchParams.set('pageNumber',String(pageNo));await page.goto(u.href,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(2500);sourceUrl=page.url();pageTitle=await page.title().catch(()=>pageTitle);body=(await page.locator('body').textContent().catch(()=>''))||'';if(/captcha|robot check|enter the characters/i.test(`${pageTitle} ${body}`)){status='needs_user';break}if(sourceUrl.startsWith('chrome-error:')||body.trim().length<100)break;observedPage=true;const before=items.length;await extract(page,items);if(items.length===before)break}catch(e){navigationError=e.name||'review_navigation_error';break}}
  }
  if(items.length)status='success';else if(status!=='needs_user')status='partial';
  await page.close();await context.close();console.log(JSON.stringify({asin,capturedAt:new Date().toISOString(),sourceUrl,navigationError,status,fallbackUsed,reviewLink,observedPage,pageTitle,bodyHint,reviews:items}));
})().catch(e=>{console.error(e.stack||e.message);process.exit(1)});
