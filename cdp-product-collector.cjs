const fs=require('fs');
const path=require('path');
const {connectCdp,findPage}=require('./cdp-session.cjs');

const asin=(process.argv[2]||'').trim().toUpperCase();
const debugUrl=process.env.CHROME_DEBUG_URL||'http://127.0.0.1:9222';
if(!/^[A-Z0-9]{10}$/.test(asin)){console.error('Invalid ASIN');process.exit(2)}

const outDir=path.join(__dirname,'data','captures');
const clean=s=>s?.replace(/\s+/g,' ').trim()||null;
const number=s=>{if(!s)return null;const match=String(s).match(/[0-9][0-9,.]*/);if(!match)return null;const n=Number(match[0].replace(/,/g,''));return Number.isFinite(n)?n:null};
const star=s=>{const m=String(s||'').match(/[0-5](?:\.[0-9])?/);return m?Number(m[0]):null};
const text=async(page,selectors)=>{for(const selector of selectors){const el=page.locator(selector);if(await el.count()){const value=clean(await el.first().textContent().catch(()=>null));if(value)return value}}return null};

function needsUser(message){
  return {result:{asin,strategy:'chrome-cdp',status:'needs_user',navigationError:'waiting_for_page',notes:[message],title:null,bsr:[]}};
}

(async()=>{
  fs.mkdirSync(outDir,{recursive:true});
  let browser;
  try{
    ({browser}=await connectCdp(debugUrl));
    const context=browser.contexts()[0];
    const url=`https://www.amazon.com/dp/${asin}`;
    const page=findPage(context,href=>new RegExp(`/dp/${asin}|/gp/product/${asin}`,'i').test(href));
    if(!page){
      console.log(JSON.stringify(needsUser(`请在本机 Chrome 中打开商品页：${url}，确认标题和 BSR 可见后再采集`)));
      process.exit(0);
    }
    await page.bringToFront().catch(()=>{});
    await page.waitForTimeout(1500);
    const pageTitle=await page.title().catch(()=>null);
    const bodyHint=clean(await page.locator('body').textContent({timeout:5000}).catch(()=>null));
    const captcha=/captcha|enter the characters you see|robot check/i.test(`${pageTitle||''} ${bodyHint||''}`);
    const title=await text(page,['#productTitle','h1.a-size-large']);
    const priceText=await text(page,['#corePrice_feature_div .a-offscreen','#apex_desktop .a-offscreen','.priceToPay .a-offscreen']);
    const ratingText=await text(page,['#acrPopover .a-icon-alt','[data-hook="rating-out-of-text"]']);
    const reviewsText=await text(page,['#acrCustomerReviewText','[data-hook="total-review-count"]']);
    const details=await text(page,['#detailBullets_feature_div','#productDetails_detailBullets_sections1','#prodDetails']);
    const bsr=[];
    for(const match of (details||'').matchAll(/#([\d,]+)\s+in\s+([^#()]+?)(?=\s*\(|\s*#|$)/g)){
      const category=clean(match[2])?.split(/\s+ASIN\s+/i)[0]||null;
      bsr.push({rank:Number(match[1].replace(/,/g,'')),category});
    }
    const asinInputs=page.locator('#ASIN, input[name="ASIN"], input[name="asin"]');
    let pageAsin=null;
    if(await asinInputs.count())pageAsin=clean(await asinInputs.first().getAttribute('value'))?.toUpperCase()||null;
    const canonical=page.locator('link[rel="canonical"]');
    const canonicalUrl=await canonical.count()?await canonical.first().getAttribute('href'):null;
    const canonicalAsin=String(canonicalUrl||'').match(/\/(?:dp|product)\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase()||null;
    const verifiedAsin=pageAsin||canonicalAsin;
    const asinVerified=!verifiedAsin||verifiedAsin===asin;
    const result={
      asin,strategy:'chrome-cdp',reusedTab:true,pageAsin,canonicalAsin,asinVerified,
      marketplace:'amazon.com',capturedAt:new Date().toISOString(),sourceUrl:page.url(),
      status:captcha?'needs_user':title&&asinVerified?'success':'partial',
      navigationError:null,pageTitle,title,price:priceText,rating:number(ratingText),reviews:number(reviewsText),
      bsr,bsrEvidence:clean(details)?.slice(0,800)||null,embeddedReviews:[],captcha,notes:[]
    };
    if(!title)result.notes.push('Product title not found');
    if(!asinVerified)result.notes.push(`ASIN mismatch: requested ${asin}, page ${verifiedAsin}`);
    if(!priceText)result.notes.push('Price not visible');
    if(!bsr.length)result.notes.push('BSR not visible');
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    fs.writeFileSync(path.join(outDir,`${asin}-${stamp}.json`),JSON.stringify(result,null,2));
    console.log(JSON.stringify({output:path.join(outDir,`${asin}-${stamp}.json`),result}));
  }catch(error){
    const message=String(error.message||error);
    const hint=/ECONNREFUSED|connect|timeout/i.test(message)?'请先运行 start-chrome-debug.cmd':message;
    console.log(JSON.stringify(needsUser(hint)));
    process.exit(0);
  }finally{browser=null}
})().catch(error=>{console.error(error.stack||error.message);process.exit(1)});
