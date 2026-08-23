// LinkedIn compatibility patch: Supermetrics may return Campaign group name instead of Campaign name.
CAMPAIGN_TAGS.sealtec.patterns.LinkedIn=['sealtec','sealtic'];

const originalIx=ix;
ix=function(headers,aliases){
  const normalizedAliases=(aliases||[]).map(norm);
  if(normalizedAliases.includes('campaign name')||normalizedAliases.includes('campaign')){
    const normalizedHeaders=(headers||[]).map(norm);
    const groupIndex=normalizedHeaders.findIndex(v=>v==='campaign group name'||v.includes('campaign group name'));
    if(groupIndex>=0) return groupIndex;
  }
  return originalIx(headers,aliases);
};
