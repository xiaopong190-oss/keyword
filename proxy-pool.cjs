function parseProxyLine(line){
  const raw=String(line||'').trim();
  if(!raw)return null;
  try{
    if(raw.includes('://')){
      const url=new URL(raw);
      return {
        server:`${url.protocol}//${url.host}`,
        username:decodeURIComponent(url.username||''),
        password:decodeURIComponent(url.password||''),
        label:url.host
      };
    }
    const [host,port,user,pass]=raw.split(':');
    if(!host||!port)return null;
    const server=/^\d+$/.test(port)?`http://${host}:${port}`:null;
    if(!server)return null;
    return {server,username:user||'',password:pass||'',label:host};
  }catch{return null}
}

function loadProxyPool(config={}){
  const pool=[];
  const seen=new Set();
  const add=item=>{
    if(!item?.server||seen.has(item.server))return;
    seen.add(item.server);
    pool.push(item);
  };
  for(const item of config.proxy?.servers||[])add({server:item.server,username:item.username||'',password:item.password||'',label:item.label||item.server});
  const listEnv=process.env.PROXY_LIST||'';
  for(const line of listEnv.split(/\r?\n|,/))add(parseProxyLine(line));
  if(process.env.PROXY_URL)add(parseProxyLine(process.env.PROXY_URL));
  return pool;
}

function pickProxy(pool,seed=0,mode='round-robin'){
  if(!pool.length)return null;
  if(mode==='random')return pool[Math.floor(Math.random()*pool.length)];
  return pool[Math.abs(seed)%pool.length];
}

function proxyEnv(proxy){
  if(!proxy)return {};
  return {
    COLLECTOR_PROXY_SERVER:proxy.server,
    COLLECTOR_PROXY_USERNAME:proxy.username||'',
    COLLECTOR_PROXY_PASSWORD:proxy.password||'',
    COLLECTOR_PROXY_LABEL:proxy.label||proxy.server
  };
}

function playwrightProxy(proxy){
  if(!proxy?.server)return null;
  const out={server:proxy.server};
  if(proxy.username)out.username=proxy.username;
  if(proxy.password)out.password=proxy.password;
  return out;
}

module.exports={loadProxyPool,pickProxy,proxyEnv,playwrightProxy,parseProxyLine};
