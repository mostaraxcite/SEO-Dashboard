(()=>{
  const NF=new Intl.NumberFormat('en-US');
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  function safeUrl(v){try{const u=new URL(String(v));return /^https?:$/.test(u.protocol)?u.href:'#';}catch(_){return '#';}}
  const currentYear=new Date().getFullYear();
  const today=()=>new Date().toISOString().slice(0,10);
  const yearStart=()=>`${currentYear}-01-01`;
  const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));

  let bitlyState={
    campaign:document.getElementById('campaignTag')?.value||new URLSearchParams(location.search).get('campaign')||'all',
    start:document.getElementById('dateFrom')?.value||new URLSearchParams(location.search).get('from')||yearStart(),
    end:document.getElementById('dateTo')?.value||new URLSearchParams(location.search).get('to')||today()
  };

  function campaignOptions(){
    if(typeof CAMPAIGN_TAGS==='object'&&CAMPAIGN_TAGS){
      return Object.entries(CAMPAIGN_TAGS).map(([key,c])=>`<option value="${esc(key)}">${esc(c?.label||key)}</option>`).join('');
    }
    return '<option value="all">كل الحملات</option><option value="bmw">BMW</option>';
  }

  function panel(){
    let root=document.getElementById('bitlyPanel');
    if(root) return root;
    const css=document.createElement('style');
    css.textContent=`
      .bitly-panel{margin-top:22px}.bitly-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}.bitly-source{font-size:11px;font-weight:800;color:#ee6123;background:#fff4ee;border:1px solid #ffd9c8;border-radius:999px;padding:6px 10px;direction:ltr}.bitly-filter{width:100%;display:flex;justify-content:flex-start;align-items:flex-end;gap:8px;flex-wrap:wrap;direction:rtl;margin:14px 0 6px;padding:12px 0;border-top:1px solid #edf0f4;border-bottom:1px solid #edf0f4}.bitly-filter .bf-title{height:36px;display:flex;align-items:center;font-size:12px;font-weight:800;color:#0f1728;margin-left:4px}.bitly-filter .bf-group{display:flex;flex-direction:column;gap:4px;text-align:right}.bitly-filter label{font-family:Tajawal,sans-serif;font-size:11px;color:#667085;font-weight:700}.bitly-filter input,.bitly-filter select{height:36px;border:1px solid #d7dee8;border-radius:9px;background:#fff;padding:0 10px;font-family:Tajawal,Arial,sans-serif;font-size:12px;color:#101828;outline:none}.bitly-filter input{font-family:JetBrains Mono,Tajawal,sans-serif;direction:ltr}.bitly-filter select{min-width:150px;font-weight:700;cursor:pointer}.bitly-filter input:focus,.bitly-filter select:focus{border-color:#0794d2;box-shadow:0 0 0 3px rgba(7,148,210,.10)}.bitly-filter button{height:36px;border-radius:9px;padding:0 14px;border:1px solid #d7dee8;background:#fff;color:#344054;font-family:Tajawal,sans-serif;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}.bitly-filter .bf-apply{background:#078dcc;color:#fff;border-color:#078dcc}.bitly-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0}.bitly-stat{border:1px solid #e5eaf1;border-radius:13px;padding:13px;background:#fbfcfe}.bitly-stat .b-label{font-size:11px;color:#667085;font-weight:700}.bitly-stat .b-value{font:800 23px/1.25 JetBrains Mono,Tajawal,sans-serif;margin-top:5px;color:#101828}.bitly-stat .b-sub{font-size:10px;color:#98a2b3;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bitly-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(260px,.7fr);gap:16px}.bitly-table-wrap{overflow:auto}.bitly-table{width:100%;border-collapse:collapse}.bitly-table th,.bitly-table td{padding:11px 9px;border-bottom:1px solid #edf0f4;font-size:12px;text-align:right;vertical-align:top}.bitly-table th{font-size:10px;color:#667085;text-transform:uppercase}.bitly-table .b-num{font-family:JetBrains Mono,Tajawal,sans-serif;text-align:left;direction:ltr;font-weight:800}.bitly-link{direction:ltr;text-align:left;display:inline-block;color:#078dcc;text-decoration:none;font-family:JetBrains Mono,monospace;font-size:11px;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bitly-title{font-weight:800;color:#101828;margin-bottom:4px;max-width:260px}.city-chips{display:flex;gap:4px;flex-wrap:wrap}.city-chip{font-size:10px;background:#f2f4f7;color:#344054;border-radius:999px;padding:3px 7px;white-space:nowrap}.city-list{display:flex;flex-direction:column;gap:10px;margin-top:12px}.city-row{display:grid;grid-template-columns:minmax(80px,1fr) 2fr auto;align-items:center;gap:8px;font-size:11px}.city-name{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.city-track{height:7px;border-radius:99px;background:#eef1f5;overflow:hidden}.city-fill{height:100%;background:#078dcc;border-radius:99px}.city-clicks{font-family:JetBrains Mono,monospace;direction:ltr}.bitly-empty,.bitly-error,.bitly-loading{padding:18px;border-radius:11px;background:#f8fafc;color:#667085;font-size:12px;line-height:1.8}.bitly-error{background:#fff5f5;color:#b42318}.bitly-warning{margin:10px 0;padding:9px 11px;background:#fffaeb;border:1px solid #fedf89;border-radius:9px;color:#7a2e0e;font-size:11px;line-height:1.7}@media(max-width:850px){.bitly-summary{grid-template-columns:repeat(2,1fr)}.bitly-grid{grid-template-columns:1fr}}@media(max-width:700px){.bitly-filter{gap:6px}.bitly-filter .bf-title{width:100%;height:auto}.bitly-filter input{max-width:145px}.bitly-filter select{min-width:130px}.bitly-filter button{padding:0 10px}}@media(max-width:520px){.bitly-summary{grid-template-columns:1fr 1fr}.bitly-table th:nth-child(4),.bitly-table td:nth-child(4){display:none}}
    `;
    document.head.appendChild(css);
    root=document.createElement('section');
    root.id='bitlyPanel';root.className='panel bitly-panel';
    root.innerHTML=`
      <div class="bitly-head"><div class="panel-head" style="margin:0"><div><h2>أداء روابط الحملة</h2><div class="note" id="bitlyNote">النقرات والمدن من Bitly</div></div></div><div class="bitly-source">BITLY LIVE</div></div>
      <div class="bitly-filter" id="bitlyFilter">
        <div class="bf-title">فلاتر الروابط</div>
        <div class="bf-group"><label for="bitlyCampaignTag">Campaign View</label><select id="bitlyCampaignTag">${campaignOptions()}</select></div>
        <div class="bf-group"><label for="bitlyDateFrom">من</label><input id="bitlyDateFrom" type="date" value="${esc(bitlyState.start)}"></div>
        <div class="bf-group"><label for="bitlyDateTo">إلى</label><input id="bitlyDateTo" type="date" max="${today()}" value="${esc(bitlyState.end)}"></div>
        <button id="bitlyApplyDate" class="bf-apply" type="button">تطبيق</button>
        <button id="bitlyResetDate" type="button">من بداية السنة</button>
      </div>
      <div id="bitlyBody" class="bitly-loading">جاري تحميل بيانات الروابط…</div>`;
    const footer=document.querySelector('footer');
    if(footer) footer.parentElement.insertBefore(root,footer); else document.querySelector('.wrap')?.appendChild(root);
    const campaign=document.getElementById('bitlyCampaignTag');
    if(campaign&&[...campaign.options].some(o=>o.value===bitlyState.campaign)) campaign.value=bitlyState.campaign;
    return root;
  }

  function selectedCampaign(){return bitlyState.campaign;}
  function range(){return {start:bitlyState.start,end:bitlyState.end};}
  function label(){return document.getElementById('bitlyCampaignTag')?.selectedOptions?.[0]?.textContent?.trim()||selectedCampaign();}
  function citiesHtml(cities=[]){
    if(!cities.length) return '<span style="color:#98a2b3">—</span>';
    return `<div class="city-chips">${cities.slice(0,5).map(c=>`<span class="city-chip">${esc(c.city)} · ${NF.format(c.clicks)}</span>`).join('')}</div>`;
  }

  function render(data){
    const body=document.getElementById('bitlyBody');if(!body)return;
    const note=document.getElementById('bitlyNote');if(note)note.textContent=`${label()} · ${data.range?.start_date||'كل الفترة'} — ${data.range?.end_date||'اليوم'} · تحديث كل 30 دقيقة`;
    if(!data.matchedLinks){
      body.className='bitly-empty';
      body.innerHTML=`لم يتم العثور على روابط Bitly مطابقة لـ <b>${esc(label())}</b>. إذا كانت روابط حملة السيارات موجودة بالفعل في Bitly، اجعل عنوان الرابط أو الـTag يحتوي على <b>BMW</b> أو <b>car raffle</b> حتى يلتقطها الداشبورد تلقائيًا.`;
      return;
    }
    const topLink=data.topLink;
    const topCity=data.topCity;
    const warning=data.cityMetricsAvailable?'':`<div class="bitly-warning">إجمالي النقرات يعمل، لكن تفاصيل المدن لم تُرجعها خطة/صلاحيات Bitly الحالية. يمكن إبقاء الجدول بالنقرات فقط أو ترقية صلاحية City metrics.</div>`;
    const rows=(data.links||[]).map(l=>`<tr><td><div class="bitly-title">${esc(l.title||l.id)}</div><a class="bitly-link" href="${esc(safeUrl(l.shortUrl))}" target="_blank" rel="noopener">${esc(l.shortUrl)}</a></td><td class="b-num">${NF.format(l.clicks||0)}</td><td>${citiesHtml(l.cities)}</td><td>${esc(l.group||'—')}</td></tr>`).join('');
    const maxCity=Math.max(...(data.cities||[]).map(c=>c.clicks),1);
    const cityRows=(data.cities||[]).slice(0,10).map(c=>`<div class="city-row"><div class="city-name" title="${esc([c.city,c.region].filter(Boolean).join('، '))}">${esc(c.city||'Unknown')}</div><div class="city-track"><div class="city-fill" style="width:${Math.max(2,(c.clicks/maxCity)*100)}%"></div></div><div class="city-clicks">${NF.format(c.clicks)}</div></div>`).join('')||'<div class="bitly-empty">لا توجد بيانات مدن متاحة.</div>';
    body.className='';
    body.innerHTML=`
      <div class="bitly-summary">
        <div class="bitly-stat"><div class="b-label">إجمالي نقرات Bitly</div><div class="b-value">${NF.format(data.totalClicks||0)}</div><div class="b-sub">${NF.format(data.matchedLinks)} روابط مطابقة</div></div>
        <div class="bitly-stat"><div class="b-label">أعلى مدينة</div><div class="b-value" style="font-family:Tajawal,sans-serif;font-size:20px">${esc(topCity?.city||'—')}</div><div class="b-sub">${topCity?NF.format(topCity.clicks)+' نقرة':'لا توجد بيانات'}</div></div>
        <div class="bitly-stat"><div class="b-label">أفضل رابط</div><div class="b-value">${topLink?NF.format(topLink.clicks):'—'}</div><div class="b-sub">${esc(topLink?.title||topLink?.shortUrl||'لا توجد بيانات')}</div></div>
        <div class="bitly-stat"><div class="b-label">روابط Bitly المكتشفة</div><div class="b-value">${NF.format(data.discoveredLinks||0)}</div><div class="b-sub">داخل حساب Bitly المتصل</div></div>
      </div>${warning}
      <div class="bitly-grid">
        <div class="bitly-table-wrap"><table class="bitly-table"><thead><tr><th>الرابط</th><th>النقرات</th><th>أهم المدن</th><th>Bitly Group</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div><div style="font-size:13px;font-weight:900;color:#101828">أعلى المدن</div><div class="note">مجمعة من روابط الحملة المطابقة</div><div class="city-list">${cityRows}</div></div>
      </div>`;
  }

  async function loadBitly(){
    panel();
    const body=document.getElementById('bitlyBody');if(body){body.className='bitly-loading';body.textContent='جاري تحميل بيانات Bitly…';}
    const c=selectedCampaign();const r=range();
    const qs=new URLSearchParams({campaign:c,start_date:r.start,end_date:r.end});
    try{
      const res=await fetch(`/api/bitly?${qs}`,{cache:'no-store'});
      const data=await res.json();
      if(!res.ok||!data.ok) throw new Error(data.error||`HTTP ${res.status}`);
      render(data);
    }catch(e){
      if(body){body.className='bitly-error';body.textContent='تعذر تحميل بيانات Bitly: '+e.message;}
    }
  }

  function installFilters(){
    document.getElementById('bitlyCampaignTag')?.addEventListener('change',e=>{bitlyState.campaign=e.target.value;});
    document.getElementById('bitlyApplyDate')?.addEventListener('click',()=>{
      const start=document.getElementById('bitlyDateFrom')?.value;
      const end=document.getElementById('bitlyDateTo')?.value;
      const campaign=document.getElementById('bitlyCampaignTag')?.value||'all';
      if(!validDate(start)||!validDate(end)||start>end){
        const body=document.getElementById('bitlyBody');
        if(body){body.className='bitly-error';body.textContent='اختار فترة صحيحة للروابط: تاريخ البداية لازم يكون قبل أو مساوي لتاريخ النهاية.';}
        return;
      }
      bitlyState={campaign,start,end};
      loadBitly();
    });
    document.getElementById('bitlyResetDate')?.addEventListener('click',()=>{
      bitlyState={campaign:document.getElementById('bitlyCampaignTag')?.value||'all',start:yearStart(),end:today()};
      const start=document.getElementById('bitlyDateFrom');const end=document.getElementById('bitlyDateTo');
      if(start)start.value=bitlyState.start;if(end)end.value=bitlyState.end;
      loadBitly();
    });
  }

  panel();
  installFilters();
  loadBitly();
  document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(loadBitly,0));
  setInterval(loadBitly,1800000);
})();
