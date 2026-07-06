const fs=require('fs');
const path=require('path');

const lockFile=path.join(__dirname,'data','browser.lock');

function releaseLock(){
  try{fs.unlinkSync(lockFile)}catch{}
}

function sleep(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

async function acquireLock(maxWaitMs=120000){
  fs.mkdirSync(path.dirname(lockFile),{recursive:true});
  const start=Date.now();
  while(Date.now()-start<maxWaitMs){
    try{
      fs.writeFileSync(lockFile,String(process.pid),{flag:'wx'});
      return;
    }catch{
      const age=Date.now()-fs.statSync(lockFile).mtimeMs;
      if(age>180000)releaseLock();
      await sleep(1000);
    }
  }
  throw new Error('browser_lock_timeout');
}

module.exports={acquireLock,releaseLock};
