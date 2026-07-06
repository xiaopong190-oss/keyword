const path=require('path');
module.exports={
  profileDir:path.join(__dirname,'data','playwright-profile'),
  legacyProfileDir:path.join(__dirname,'.chrome-profile')
};
