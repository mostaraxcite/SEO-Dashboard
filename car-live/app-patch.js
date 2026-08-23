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

const baseRenderPayload=renderPayload;
renderPayload=function(p){
  baseRenderPayload(p);
  if(selectedTag!=='sealtec') return;

  const s=p?.sources?.LinkedIn;
  let diagnostic='';
  if(!s){
    diagnostic='LinkedIn: المصدر غير موجود في استجابة /api/data.';
  }else if(!s.ok){
    diagnostic=`LinkedIn عبر ${s.sourceEnv||'SM_LINKEDIN_URL'}: ${s.error||'فشل المصدر بدون تفاصيل'}`;
  }else{
    const t=table(s.data);
    if(!Array.isArray(t)||t.length<2||!Array.isArray(t[0])){
      diagnostic=`LinkedIn عبر ${s.sourceEnv||'SM_LINKEDIN_URL'}: الداتا وصلت لكن بدون صفوف جدول.`;
    }else{
      const headers=t[0].map(v=>String(v??''));
      const nh=headers.map(norm);
      let ci=nh.findIndex(v=>v==='campaign name'||v==='campaign');
      if(ci<0) ci=nh.findIndex(v=>v.includes('campaign group name'));
      if(ci<0){
        diagnostic=`LinkedIn عبر ${s.sourceEnv||'SM_LINKEDIN_URL'}: الداتا وصلت لكن لا يوجد Campaign name أو Campaign group name.`;
      }else{
        const names=t.slice(1).map(r=>String(r?.[ci]??'').trim()).filter(Boolean);
        const matched=names.filter(name=>/sealtec|sealtic/i.test(name));
        if(!matched.length){
          diagnostic=`LinkedIn عبر ${s.sourceEnv||'SM_LINKEDIN_URL'}: الداتا وصلت ولكن أسماء الحملات المستلمة لا تطابق Sealtec. المستلم: ${names.slice(0,8).join(' | ')||'لا توجد أسماء'}`;
        }
      }
    }
  }

  if(diagnostic){
    const notice=document.getElementById('notice');
    if(notice){
      notice.style.display='block';
      const current=String(notice.textContent||'').trim();
      notice.textContent=current?`${current} ${diagnostic}`:diagnostic;
    }
  }
};

// If app.js finished its first fetch unusually fast, force one render with the patched parser/diagnostics.
setTimeout(()=>{try{if(lastPayload) renderPayload(lastPayload);}catch(_){}},0);
