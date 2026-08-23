// LinkedIn compatibility patch for Supermetrics campaign-group queries.
CAMPAIGN_TAGS.sealtec.patterns.LinkedIn=['sealtec','sealtic'];

const baseParse=parse;
parse=function(platform,p,tag=selectedTag){
  if(platform==='LinkedIn'){
    const t=table(p);
    if(Array.isArray(t)&&t.length&&Array.isArray(t[0])){
      const cloned=t.map(row=>Array.isArray(row)?row.slice():row);
      const headers=cloned[0].map(v=>String(v??''));
      const normalized=headers.map(norm);
      const campaignIndex=normalized.findIndex(v=>v==='campaign name'||v==='campaign');
      const groupIndex=normalized.findIndex(v=>v.includes('campaign group name'));
      if(campaignIndex<0&&groupIndex>=0) cloned[0][groupIndex]='Campaign name';
      return baseParse(platform,cloned,tag);
    }
  }
  return baseParse(platform,p,tag);
};

// If app.js finished its first fetch unusually fast, force one render with the patched parser.
setTimeout(()=>{try{if(lastPayload) renderPayload(lastPayload);}catch(_){}},0);
