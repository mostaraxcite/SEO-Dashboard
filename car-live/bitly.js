(()=>{
  const NF=new Intl.NumberFormat('en-US');
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const safeUrl=v=>{try{const u=new URL(String(v));return /^https?:$/.test(u.protocol)?u.href:'#';}catch(_){return '#';}};
  const iso=d=>d.toISOString().slice(0,10);
  const today=()=>iso(new Date());
  const yearStart=()=>`${new Date().getFullYear()}-01-01`;
  const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
  const daysAgo=n=>{const d=new Date();d.setUTCDate(d.getUTCDate()-n);return iso(d);};

  let rawData=null;
  let bitlyState={
    campaign:document.getElementById('campaignTag')?.value||new URLSearchParams(location.search).get('campaign')||'all',
    start:document.getElementById('dateFrom')?.value||new URLSearchParams(location.search).get('from')||yearStart(),
    end:document.getElementById('dateTo')?.value||new URLSearchParams(location.search).get('to')||today(),
    allTime:false,
    search:'',
    clickFilter:'all',
    group:'all',
    limit:50
  };

  function campaignOptions(){
    if(typeof CAMPAIGN_TAGS==='object'&&CAMPAIGN_TAGS){
      return Object.entries(CAMPAIGN_TAGS).map(([key,c])=>`<option value="${esc(key)}">${esc(c?.label||key)}</option>`).join('');
    }
    return '<option value="all">كل الحملات</option><option value="bmw">BMW</option><option value="sealtec">Sealtec</option>';
  }

  function panel(){
    let root=document.getElementById('bitlyPanel');
    if(root) return root;
    const css=document.createElement('style');
    css.textContent=`
      .bitly-panel{margin-top:22px}
      .bitly-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .bitly-source{font-size:11px;font-weight:800;color:#ee6123;background:#fff4ee;border:1px solid #ffd9c8;border-radius:999px;padding:6px 10px;direction:ltr}
      .bitly-filter{width:100%;display:flex;justify-content:flex-start;align-items:flex-end;gap:8px;flex-wrap:wrap;direction:rtl;margin:14px 0 6px;padding:12px 0;border-top:1px solid #edf0f4;border-bottom:1px solid #edf0f4}
      .bitly-filter .bf-title{height:36px;display:flex;align-items:center;font-size:12px;font-weight:800;color:#0f1728;margin-left:4px}
      .bitly-filter .bf-group{display:flex;flex-direction:column;gap:4px;text-align:right}
      .bitly-filter label{font-family:Tajawal,sans-serif;font-size:11px;color:#667085;font-weight:700}
      .bitly-filter input,.bitly-filter select{height:36px;border:1px solid #d7dee8;border-radius:9px;background:#fff;padding:0 10px;font-family:Tajawal,Arial,sans-serif;font-size:12px;color:#101828;outline:none}
      .bitly-filter input[type=date]{font-family:JetBrains Mono,Tajawal,sans-serif;direction:ltr}
      .bitly-filter input[type=search]{min-width:210px}
      .bitly-filter select{min-width:130px;font-weight:700;cursor:pointer}
      .bitly-filter input:focus,.bitly-filter select:focus{border-color:#0794d2;box-shadow:0 0 0 3px rgba(7,148,210,.10)}
      .bitly-filter button{height:36px;border-radius:9px;padding:0 13px;border:1px solid #d7dee8;background:#fff;color:#344054;font-family:Tajawal,sans-serif;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
      .bitly-filter .bf-apply{background:#078dcc;color:#fff;border-color:#078dcc}
      .bitly-filter .bf-preset.active{background:#eaf7fd;border-color:#8bd1ef;color:#0677aa}
      .bitly-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0}
      .bitly-stat{border:1px solid #e5eaf1;border-radius:13px;padding:13px;background:#fbfcfe}
      .bitly-stat .b-label{font-size:11px;color:#667085;font-weight:700}
      .bitly-stat .b-value{font:800 23px/1.25 JetBrains Mono,Tajawal,sans-serif;margin-top:5px;color:#101828}
      .bitly-stat .b-sub{font-size:10px;color:#98a2b3;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .bitly-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(260px,.7fr);gap:16px}
      .bitly-table-wrap{overflow:auto}
      .bitly-table{width:100%;border-collapse:collapse}
      .bitly-table th,.bitly-table td{padding:11px 9px;border-bottom:1px solid #edf0f4;font-size:12px;text-align:right;vertical-align:top}
      .bitly-table th{font-size:10px;color:#667085;text-transform:uppercase}
      .bitly-table .b-num{font-family:JetBrains Mono,Tajawal,sans-serif;text-align:left;direction:ltr;font-weight:800}
      .bitly-link{direction:ltr;text-align:left;display:inline-block;color:#078dcc;text-decoration:none;font-family:JetBrains Mono,monospace;font-size:11px;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .bitly-title{font-weight:800;color:#101828;margin-bottom:4px;max-width:300px}
      .metric-error{font-size:10px;color:#b42318;margin-top:4px;max-width:240px}
      .city-chips{display:flex;gap:4px;flex-wrap:wrap}.city-chip{font-size:10px;background:#f2f4f7;color:#344054;border-radius:999px;padding:3px 7px;white-space:nowrap}
      .city-list{display:flex;flex-direction:column;gap:10px;margin-top:12px}
      .city-row{display:grid;grid-template-columns:minmax(80px,1fr) 2fr auto;align-items:center;gap:8px;font-size:11px}
      .city-name{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .city-track{height:7px;border-radius:99px;background:#eef1f5;overflow:hidden}.city-fill{height:100%;background:#078dcc;border-radius:99px}
      .city-clicks{font-family:JetBrains Mono,monospace;direction:ltr}
      .bitly-empty,.bitly-error,.bitly-loading{padding:18px;border-radius:11px;background:#f8fafc;color:#667085;font-size:12px;line-height:1.8}
      .bitly-error{background:#fff5f5;color:#b42318}
      .bitly-warning{margin:10px 0;padding:9px 11px;background:#fffaeb;border:1px solid #fedf89;border-radius:9px;color:#7a2e0e;font-size:11px;line-height:1.7}
      .bitly-info{margin:10px 0;padding:9px 11px;background:#eff8ff;border:1px solid #b2ddff;border-radius:9px;color:#175cd3;font-size:11px;line-height:1.7}
      @media(max-width:850px){.bitly-summary{grid-template-columns:repeat(2,1fr)}.bitly-grid{grid-template-columns:1fr}}
      @media(max-width:700px){.bitly-filter{gap:6px}.bitly-filter .bf-title{width:100%;height:auto}.bitly-filter input{max-width:155px}.bitly-filter input[type=search]{min-width:180px;max-width:100%}.bitly-filter select{min-width:120px}.bitly-filter button{padding:0 9px}}
      @media(max-width:520px){.bitly-summary{grid-template-columns:1fr 1fr}.bitly-table th:nth-child(4),.bitly-table td:nth-child(4){display:none}}
    `;
    document.head.appendChild(css);
    root=document.createElement('section');
    root.id='bitlyPanel';root.className='panel bitly-panel';
    root.innerHTML=`
      <div class="bitly-head">
        <div class="panel-head" style="margin:0"><div><h2>أداء روابط الحملة</h2><div class="note" id="bitlyNote">النقرات والمدن من Bitly</div></div></div>
        <div class="bitly-source">BITLY LIVE</div>
      </div>
      <div class="bitly-filter" id="bitlyFilter">
        <div class="bf-title">فلاتر الروابط</div>
        <div class="bf-group"><label>Campaign View</label><select id="bitlyCampaignTag">${campaignOptions()}</select></div>
        <div class="bf-group"><label>من</label><input id="bitlyDateFrom" type="date" value="${esc(bitlyState.start)}"></div>
        <div class="bf-group"><label>إلى</label><input id="bitlyDateTo" type="date" max="${today()}" value="${esc(bitlyState.end)}"></div>
        <button class="bf-preset" data-days="0" type="button">اليوم</button>
        <button class="bf-preset" data-days="7" type="button">7 أيام</button>
        <button class="bf-preset" data-days="30" type="button">30 يوم</button>
        <button id="bitlyYtd" type="button">من بداية السنة</button>
        <button id="bitlyAllTime" type="button">كل المدة</button>
        <button id="bitlyApplyDate" class="bf-apply" type="button">تطبيق</button>
        <div class="bf-group"><label>بحث في الروابط</label><input id="bitlySearch" type="search" placeholder="اسم أو رابط..." value=""></div>
        <div class="bf-group"><label>النقرات</label><select id="bitlyClickFilter"><option value="all">الكل</option><option value="clicked">أكثر من 0</option><option value="zero">0 فقط</option><option value="error">أخطاء API</option></select></div>
        <div class="bf-group"><label>المجموعة</label><select id="bitlyGroupFilter"><option value="all">كل المجموعات</option></select></div>
        <div class="bf-group"><label>عدد النتائج</label><select id="bitlyLimit"><option value="30">30</option><option value="50" selected>50</option><option value="100">100</option></select></div>
      </div>
      <div id="bitlyBody" class="bitly-loading">جاري تحميل بيانات الروابط…</div>`;
    const footer=document.querySelector('footer');
    if(footer) footer.parentElement.insertBefore(root,footer); else document.querySelector('.wrap')?.appendChild(root);
    const campaign=document.getElementById('bitlyCampaignTag');
    if(campaign&&[...campaign.options].some(o=>o.value===bitlyState.campaign)) campaign.value=bitlyState.campaign;
    return root;
  }

  function label(){return document.getElementById('bitlyCampaignTag')?.selectedOptions?.[0]?.textContent?.trim()||bitlyState.campaign;}
  function citiesHtml(cities=[]){
    if(!cities.length) return '<span style="color:#98a2b3">—</span>';
    return `<div class="city-chips">${cities.slice(0,5).map(c=>`<span class="city-chip">${esc(c.city)} · ${NF.format(c.clicks)}</span>`).join('')}</div>`;
  }

  function syncGroupOptions(data){
    const el=document.getElementById('bitlyGroupFilter');if(!el)return;
    const current=bitlyState.group;
    const opts=(data.groups||[]).map(g=>`<option value="${esc(g.name||g.guid)}">${esc(g.name||g.guid)}</option>`).join('');
    el.innerHTML='<option value="all">كل المجموعات</option>'+opts;
    if([...el.options].some(o=>o.value===current)) el.value=current; else bitlyState.group='all';
  }

  function filteredLinks(data){
    const q=bitlyState.search.trim().toLowerCase();
    return (data.links||[]).filter(l=>{
      if(bitlyState.group!=='all'&&(l.group||l.groupGuid)!==bitlyState.group) return false;
      if(bitlyState.clickFilter==='clicked'&&!(Number(l.clicks)>0)) return false;
      if(bitlyState.clickFilter==='zero'&&Number(l.clicks)!==0) return false;
      if(bitlyState.clickFilter==='error'&&!l.clickError) return false;
      if(q){
        const hay=[l.title,l.shortUrl,l.longUrl,...(l.tags||[])].join(' ').toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function render(data){
    rawData=data;
    syncGroupOptions(data);
    const body=document.getElementById('bitlyBody');if(!body)return;
    const note=document.getElementById('bitlyNote');
    const rangeText=data.range?.all_time?'كل المدة':`${data.range?.start_date||'—'} — ${data.range?.end_date||'اليوم'}`;
    if(note) note.textContent=`${label()} · ${rangeText} · تحديث كل 5 دقائق`;

    const list=filteredLinks(data);
    const maxCity=Math.max(...(data.cities||[]).map(c=>c.clicks),1);
    const topLink=[...list].filter(l=>Number.isFinite(l.clicks)).sort((a,b)=>(b.clicks||0)-(a.clicks||0))[0]||null;
    const topCity=data.topCity;

    const metricWarning=data.metricErrorCount
      ? `<div class="bitly-warning"><b>تنبيه:</b> Bitly رفض بيانات النقرات لـ ${NF.format(data.metricErrorCount)} رابط. بدل إظهارها كـ 0، أصبحت الأخطاء ظاهرة الآن. ${esc(data.metricErrors?.[0]?.error||'')}</div>`
      :'';
    const cityWarning=data.cityMetricsAvailable||!data.totalClicks
      ? ''
      : `<div class="bitly-warning">النقرات وصلت، لكن تفاصيل المدن غير متاحة في خطة/صلاحيات Bitly الحالية.</div>`;
    const limitInfo=data.matchedLinks>data.returnedLinks
      ? `<div class="bitly-info">يوجد ${NF.format(data.matchedLinks)} رابط مطابق، ويتم تحميل ${NF.format(data.returnedLinks)} حاليًا. غيّر «عدد النتائج» إلى 100 عند الحاجة.</div>`
      :'';

    if(!data.matchedLinks){
      body.className='bitly-empty';
      body.innerHTML=`لم يتم العثور على روابط Bitly مطابقة لـ <b>${esc(label())}</b>.`;
      return;
    }

    const rows=list.map(l=>`<tr>
      <td><div class="bitly-title">${esc(l.title||l.id)}</div><a class="bitly-link" href="${esc(safeUrl(l.shortUrl))}" target="_blank" rel="noopener">${esc(l.shortUrl)}</a>${l.clickError?`<div class="metric-error">${esc(l.clickError)}</div>`:''}</td>
      <td class="b-num">${Number.isFinite(l.clicks)?NF.format(l.clicks):'خطأ'}</td>
      <td>${citiesHtml(l.cities)}</td>
      <td>${esc(l.group||'—')}</td>
    </tr>`).join('');

    const cityRows=(data.cities||[]).slice(0,10).map(c=>`<div class="city-row">
      <div class="city-name" title="${esc([c.city,c.region].filter(Boolean).join('، '))}">${esc(c.city||'Unknown')}</div>
      <div class="city-track"><div class="city-fill" style="width:${Math.max(2,(c.clicks/maxCity)*100)}%"></div></div>
      <div class="city-clicks">${NF.format(c.clicks)}</div>
    </div>`).join('')||'<div class="bitly-empty">لا توجد بيانات مدن متاحة.</div>';

    body.className='';
    body.innerHTML=`
      <div class="bitly-summary">
        <div class="bitly-stat"><div class="b-label">إجمالي نقرات Bitly</div><div class="b-value">${data.clickMetricsAvailable?NF.format(data.totalClicks||0):'—'}</div><div class="b-sub">${NF.format(data.matchedLinks)} روابط مطابقة</div></div>
        <div class="bitly-stat"><div class="b-label">أعلى مدينة</div><div class="b-value" style="font-family:Tajawal,sans-serif;font-size:20px">${esc(topCity?.city||'—')}</div><div class="b-sub">${topCity?NF.format(topCity.clicks)+' نقرة':'لا توجد بيانات'}</div></div>
        <div class="bitly-stat"><div class="b-label">أفضل رابط</div><div class="b-value">${topLink&&Number.isFinite(topLink.clicks)?NF.format(topLink.clicks):'—'}</div><div class="b-sub">${esc(topLink?.title||topLink?.shortUrl||'لا توجد بيانات')}</div></div>
        <div class="bitly-stat"><div class="b-label">الروابط المعروضة</div><div class="b-value">${NF.format(list.length)}</div><div class="b-sub">من ${NF.format(data.discoveredLinks||0)} رابط مكتشف</div></div>
      </div>
      ${metricWarning}${cityWarning}${limitInfo}
      <div class="bitly-grid">
        <div class="bitly-table-wrap"><table class="bitly-table"><thead><tr><th>الرابط</th><th>النقرات</th><th>أهم المدن</th><th>Bitly Group</th></tr></thead><tbody>${rows||'<tr><td colspan="4">لا توجد نتائج تطابق الفلاتر الحالية.</td></tr>'}</tbody></table></div>
        <div><div style="font-size:13px;font-weight:900;color:#101828">أعلى المدن</div><div class="note">مجمعة من روابط الحملة المطابقة</div><div class="city-list">${cityRows}</div></div>
      </div>`;
  }

  async function loadBitly(){
    panel();
    const body=document.getElementById('bitlyBody');
    if(body){body.className='bitly-loading';body.textContent='جاري تحميل بيانات Bitly…';}
    const qs=new URLSearchParams({campaign:bitlyState.campaign,limit:String(bitlyState.limit)});
    if(!bitlyState.allTime){
      qs.set('start_date',bitlyState.start);qs.set('end_date',bitlyState.end);
    }
    try{
      const res=await fetch(`/api/bitly?${qs}`,{cache:'no-store'});
      const data=await res.json();
      if(!res.ok||!data.ok) throw new Error(data.error||`HTTP ${res.status}`);
      render(data);
    }catch(e){
      if(body){body.className='bitly-error';body.textContent='تعذر تحميل بيانات Bitly: '+e.message;}
    }
  }

  function setRange(start,end,allTime=false){
    bitlyState.start=start||'';
    bitlyState.end=end||'';
    bitlyState.allTime=allTime;
    const from=document.getElementById('bitlyDateFrom');
    const to=document.getElementById('bitlyDateTo');
    if(from) from.value=start||'';
    if(to) to.value=end||'';
    document.querySelectorAll('.bf-preset').forEach(b=>b.classList.remove('active'));
  }

  function installFilters(){
    document.getElementById('bitlyCampaignTag')?.addEventListener('change',e=>{
      bitlyState.campaign=e.target.value;loadBitly();
    });
    document.getElementById('bitlyApplyDate')?.addEventListener('click',()=>{
      const start=document.getElementById('bitlyDateFrom')?.value;
      const end=document.getElementById('bitlyDateTo')?.value;
      if(!validDate(start)||!validDate(end)||start>end){
        const body=document.getElementById('bitlyBody');
        if(body){body.className='bitly-error';body.textContent='اختار فترة صحيحة للروابط: تاريخ البداية لازم يكون قبل أو مساوي لتاريخ النهاية.';}
        return;
      }
      bitlyState.start=start;bitlyState.end=end;bitlyState.allTime=false;loadBitly();
    });
    document.querySelectorAll('.bf-preset').forEach(btn=>btn.addEventListener('click',()=>{
      const days=Number(btn.dataset.days||0);
      const end=today();
      const start=days===0?end:daysAgo(days-1);
      setRange(start,end,false);
      btn.classList.add('active');
      loadBitly();
    }));
    document.getElementById('bitlyYtd')?.addEventListener('click',()=>{setRange(yearStart(),today(),false);loadBitly();});
    document.getElementById('bitlyAllTime')?.addEventListener('click',()=>{setRange('', '', true);loadBitly();});
    document.getElementById('bitlySearch')?.addEventListener('input',e=>{bitlyState.search=e.target.value;if(rawData)render(rawData);});
    document.getElementById('bitlyClickFilter')?.addEventListener('change',e=>{bitlyState.clickFilter=e.target.value;if(rawData)render(rawData);});
    document.getElementById('bitlyGroupFilter')?.addEventListener('change',e=>{bitlyState.group=e.target.value;if(rawData)render(rawData);});
    document.getElementById('bitlyLimit')?.addEventListener('change',e=>{bitlyState.limit=Number(e.target.value)||50;loadBitly();});
    document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(loadBitly,0));
  }

  panel();
  installFilters();
  loadBitly();
  setInterval(loadBitly,300000);
})();
