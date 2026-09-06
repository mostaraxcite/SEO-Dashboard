// LinkedIn compatibility patch for Supermetrics campaign-group queries.
CAMPAIGN_TAGS.sealtec.patterns.LinkedIn=['sealtec','sealtic'];

const baseParse=parse;
parse=function(platform,p,tag=selectedTag){
  if(platform==='LinkedIn'){
    const t=table(p);
    if(Array.isArray(t)&&t.length>1&&Array.isArray(t[0])){
      const cloned=t.map(row=>Array.isArray(row)?row.slice():row);
      const headers=cloned[0].map(v=>String(v??''));
      const normalized=headers.map(norm);
      let campaignIndex=normalized.findIndex(v=>v==='campaign name'||v==='campaign');
      const groupIndex=normalized.findIndex(v=>v.includes('campaign group name'));
      if(campaignIndex<0&&groupIndex>=0){
        cloned[0][groupIndex]='Campaign name';
        campaignIndex=groupIndex;
      }

      // Sealtec fallback: Supermetrics LinkedIn responses may rename/move the campaign-group field.
      if(tag==='sealtec'){
        let matchedRows=[];
        if(campaignIndex>=0){
          matchedRows=cloned.slice(1).filter(r=>/sealtec|sealtic/i.test(String(r?.[campaignIndex]??'')));
        }
        if(!matchedRows.length){
          matchedRows=cloned.slice(1).filter(r=>Array.isArray(r)&&r.some(cell=>/sealtec|sealtic/i.test(String(cell??''))));
        }
        if(matchedRows.length){
          if(campaignIndex<0){
            campaignIndex=matchedRows[0].findIndex(cell=>/sealtec|sealtic/i.test(String(cell??'')));
            if(campaignIndex>=0) cloned[0][campaignIndex]='Campaign name';
          }
          const mini=[cloned[0],...matchedRows];
          return baseParse(platform,mini,tag);
        }
      }

      return baseParse(platform,cloned,tag);
    }
  }
  return baseParse(platform,p,tag);
};

function hideUnavailablePlatforms(){
  // Do not expose technical/API errors as platform rows. If a platform has no
  // usable campaign data for the selected view, it simply does not appear.
  ['paidRows','rows'].forEach(id=>{
    const tbody=document.getElementById(id);
    if(!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr=>{
      if(tr.querySelector('.err')) tr.remove();
    });
  });

  // Remove the generic missing-source warning from the visible notice while
  // preserving other useful warnings such as stale/legacy data messages.
  const notice=document.getElementById('notice');
  if(notice){
    let text=String(notice.textContent||'');
    text=text.replace(/مصادر غير متاحة أو بدون بيانات مطابقة:\s*[^.]*\.\s*/g,'').trim();
    notice.textContent=text;
    if(!text) notice.style.display='none';
  }
}

const baseRenderPayload=renderPayload;
renderPayload=function(p){
  baseRenderPayload(p);
  hideUnavailablePlatforms();

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
      const found=t.slice(1).some(r=>Array.isArray(r)&&r.some(cell=>/sealtec|sealtic/i.test(String(cell??''))));
      if(!found){
        diagnostic=`LinkedIn عبر ${s.sourceEnv||'SM_LINKEDIN_URL'}: الداتا وصلت لكن لا يوجد أي صف يحتوي Sealtec/Sealtic.`;
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

setTimeout(()=>{try{if(lastPayload) renderPayload(lastPayload);}catch(_){}},0);
