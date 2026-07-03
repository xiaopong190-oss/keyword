const {chromium}=require('playwright');
const fs=require('fs');
const path=require('path');

const asin=(process.argv[2]||'').trim().toUpperCase();
if(!/^[A-Z0-9]{10}$/.test(asin)){console.error('Invalid ASIN');process.exit(2)}

const root=__dirname;
const profile=path.join(root,'.chrome-profile');
const outDir=path.join(root,'data','captures');
fs.mkdirSync(profile,{recursive:true});fs.mkdirSync(outDir,{recursive:true});

const clean=s=>s?.replace(/\s+/g,' ').trim()||null;
const number=s=>{if(!s)return null;const match=String(s).match(/[0-9][0-9,.]*/);if(!match)return null;const n=Number(match[0].replace(/,/g,''));return Number.isFinite(n)?n:null};
const star=s=>{const m=String(s||'').match(/[0-5](?:\.[0-9])?/);return m?Number(m[0]):null};
const text=async(page,selectors)=>{for(const selector of selectors){const el=page.locator(selector);if(await el.count()){const value=clean(await el.first().textContent().catch(()=>null));if(value)return value}}return null};

(async()=>{
  const context=await chromium.launchPersistentContext(profile,{headless:true,channel:'chrome',locale:'en-US',timezoneId:'America/Los_Angeles',viewport:{width:1365,height:900},args:['--disable-blink-features=AutomationControlled']});
  const page=context.pages()[0]||await context.newPage();
  await page.route('**/*',route=>{const type=route.request().resourceType();if(['image','media','font'].includes(type))return route.abort();return route.continue()});
  const url=`https://www.amazon.com/dp/${asin}`;
  let navigationError=null;
  try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000})}catch(e){navigationError=e.name||'navigation_timeout'}
  await page.waitForTimeout(2500);
  const pageTitle=await page.title().catch(()=>null);
  const bodyHint=clean(await page.locator('body').textContent({timeout:3000}).catch(()=>null));
  const captcha=/captcha|enter the characters you see|robot check/i.test(`${pageTitle||''} ${bodyHint||''}`);
  const title=await text(page,['#productTitle','h1.a-size-large']);
  const priceText=await text(page,['#corePrice_feature_div .a-offscreen','#apex_desktop .a-offscreen','.priceToPay .a-offscreen']);
  const ratingText=await text(page,['#acrPopover .a-icon-alt','[data-hook="rating-out-of-text"]']);
  const reviewsText=await text(page,['#acrCustomerReviewText','[data-hook="total-review-count"]']);
  const details=await text(page,['#detailBullets_feature_div','#productDetails_detailBullets_sections1','#prodDetails']);
  const bsr=[];
  for(const match of (details||'').matchAll(/#([\d,]+)\s+in\s+([^#()]+?)(?=\s*\(|\s*#|$)/g)){const category=clean(match[2])?.split(/\s+ASIN\s+/i)[0]||null;bsr.push({rank:Number(match[1].replace(/,/g,'')),category})}
  const embeddedReviews=[];const cards=page.locator('[data-hook="review"], [data-hook="review-card"]');const cardCount=await cards.count();
  for(let i=0;i<cardCount;i++){const c=cards.nth(i),get=async s=>clean(await c.locator(s).first().textContent().catch(()=>null));const dateText=await get('[data-hook="review-date"]'),m=String(dateText||'').match(/(?:on|于)\s+(.+)$/i),d=m?new Date(m[1]):null;const item={asin,capturedAt:new Date().toISOString(),date:d&&!Number.isNaN(d.valueOf())?d.toISOString().slice(0,10):null,rating:star(await get('[data-hook="review-star-rating"], [data-hook="cmps-review-star-rating"]')),title:await get('[data-hook="review-title"]'),body:await get('[data-hook="review-body"]'),verified:/verified purchase/i.test((await c.textContent())||'')};if(item.body||item.title){item.reviewKey=await c.getAttribute('id')||`${asin}-${i}-${item.date||'unknown'}`;embeddedReviews.push(item)}}
  const result={asin,marketplace:'amazon.com',capturedAt:new Date().toISOString(),sourceUrl:page.url(),status:captcha?'needs_user':title?'success':'partial',navigationError,pageTitle,title,price:priceText,rating:number(ratingText),reviews:number(reviewsText),bsr,embeddedReviews,captcha,notes:[]};
  if(!title)result.notes.push('Product title not found');if(!priceText)result.notes.push('Price not visible');if(!bsr.length)result.notes.push('BSR not visible');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');const output=path.join(outDir,`${asin}-${stamp}.json`);
  fs.writeFileSync(output,JSON.stringify(result,null,2));
  console.log(JSON.stringify({output,result},null,2));
  await context.close();
})().catch(error=>{console.error(error.stack||error.message);process.exit(1)});
