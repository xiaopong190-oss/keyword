const path=require('path');
const {legacyProfileDir}=require('./browser-profile.cjs');
const {playwrightProxy}=require('./proxy-pool.cjs');

const profiles={
  'pw-chromium':path.join(__dirname,'data','playwright-profile'),
  'chrome-system':legacyProfileDir,
  'chrome-proxy':path.join(__dirname,'data','playwright-profile-proxy'),
  'pw-fullload':path.join(__dirname,'data','playwright-profile-load')
};

const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const strategies={
  'pw-chromium':{channel:null,profile:'pw-chromium',waitUntil:'domcontentloaded',blockAssets:true,gotoTimeout:45000,postWait:3000},
  'chrome-system':{channel:'chrome',profile:'chrome-system',waitUntil:'domcontentloaded',blockAssets:true,gotoTimeout:45000,postWait:3000},
  'chrome-proxy':{channel:'chrome',profile:'chrome-proxy',waitUntil:'domcontentloaded',blockAssets:true,gotoTimeout:60000,postWait:4000,useProxy:true},
  'pw-fullload':{channel:null,profile:'pw-fullload',waitUntil:'load',blockAssets:false,gotoTimeout:60000,postWait:4000}
};

function getStrategy(id){
  return strategies[id]||strategies['pw-chromium'];
}

function listStrategies(ids){
  const order=ids||Object.keys(strategies);
  return order.map(id=>getStrategy(id)?{id,...getStrategy(id)}:null).filter(Boolean);
}

function launchOptions(strategyId){
  const s=getStrategy(strategyId);
  const opts={
    headless:true,
    locale:'en-US',
    timezoneId:'America/Los_Angeles',
    viewport:{width:1365,height:900},
    userAgent:UA,
    args:['--disable-blink-features=AutomationControlled']
  };
  if(s.channel)opts.channel=s.channel;
  if(s.useProxy){
    const proxy=playwrightProxy({
      server:process.env.COLLECTOR_PROXY_SERVER,
      username:process.env.COLLECTOR_PROXY_USERNAME,
      password:process.env.COLLECTOR_PROXY_PASSWORD
    });
    if(proxy)opts.proxy=proxy;
  }
  return {strategy:s,profileDir:profiles[s.profile]||profiles['pw-chromium'],launch:opts};
}

module.exports={getStrategy,listStrategies,launchOptions,defaultStrategyIds:Object.keys(strategies)};
