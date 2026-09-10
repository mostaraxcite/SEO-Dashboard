(()=>{
  const CAMPAIGN='TT-Bmw-Raffle-Aug 2026 inf only';
  const SNAPSHOT_DATE='2026-09-10';
  const SNAPSHOT={
    '7676159077944216864':{spend:5451.56,impressions:2296723,views:2271489,likes:4824,comments:289,shares:50,clicks:8437},
    '7675770912607669524':{spend:1746.39,impressions:747793,views:736894,likes:1508,comments:57,shares:28,clicks:2796},
    '7672424197557161249':{spend:1147.35,impressions:507402,views:493764,likes:1115,comments:14,shares:9,clicks:608},
    '7675339705394810134':{spend:307.38,impressions:135075,views:132206,likes:919,comments:12,shares:6,clicks:177},
    '7676105239707077908':{spend:20.08,impressions:11340,views:11098,likes:77,comments:2,shares:1,clicks:29},
    '7676880419207286023':{spend:5.54,impressions:5515,views:5373,likes:36,comments:1,shares:2,clicks:10}
  };

  const NF=new Intl.NumberFormat('en-US');
  const SAR=new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:2});
  let activeMode='all';
  let applying=false;
  let paidMap={...SNAPSHOT};
  let paidSource=`Supermetrics snapshot · ${SNAPSHOT_DATE}`;

  const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0;};
  const money=v=>`${SAR.format(Number(v)||0)} ر.س`;
  const fmt=v=>NF.format(Math.round(Number(v)||0));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function videoId(url=''){
    const s=String(url);
    return s.match(/\/video\/(\d+)/i)?.[1]||s.match(/\/v\/(\d+)(?:\.html)?/i)?.[1]||'';
  }

  function add(a,b){
    return {
      spend:num(a?.spend)+num(b?.spend),impressions:num(a?.impressions)+num(b?.impressions),views:num(a?.views)+num(b?.views),
      likes:num(a?.likes)+num(b?.likes),comments:num(a?.comments)+num(b?.comments),shares:num(a?.shares)+num(b?.shares),clicks:num(a?.clicks)+num(b?.clicks)
    };
  }

  function headersMap(row=[]){
    const out={};
    row.forEach((v,i)=>{out[String(v||'').trim().toLowerCase()]=i;});
    return out;
  }

  function pickIndex(h,names){
    for(const name of names){
      const key=Object.keys(h).find(k=>k===name||k.includes(name));
      if(key!==undefined) return h[key];
    }
    return -1;
  }

  function findTable(payload){
    const candidates=[payload,payload?.data,payload?.data?.data,payload?.results,payload?.result?.data];
    return candidates.find(v=>Array.isArray(v)&&v.length>1&&Array.isArray(v[0]))||null;
  }

  function parseLive(data){
    const table=findTable(data?.sources?.TikTok?.data);
    if(!table) return null;
    const h=headersMap(table[0]);
    const ix={
      campaign:pickIndex(h,['campaign name','campaign_name']),post:pickIndex(h,['post id','post_id']),url:pickIndex(h,['post url','post_url']),
      spend:pickIndex(h,['cost','spend']),impressions:pickIndex(h,['impressions']),views:pickIndex(h,['video views','video_play_actions']),
      likes:pickIndex(h,['paid likes','likes']),comments:pickIndex(h,['paid comments','comments']),shares:pickIndex(h,['paid shares','shares']),clicks:pickIndex(h,['clicks'])
    };
    if(ix.campaign<0||ix.post<0||ix.views<0) return null;
    const map={};
    for(const row of table.slice(1)){
      if(!Array.isArray(row)) continue;
      if(!String(row[ix.campaign]||'').toLowerCase().includes('bmw-raffle-aug 2026 inf only')) continue;
      const id=String(row[ix.post]||videoId(row[ix.url])||'').trim();
      if(!id) continue;
      const m={spend:num(row[ix.spend]),impressions:num(row[ix.impressions]),views:num(row[ix.views]),likes:num(row[ix.likes]),comments:num(row[ix.comments]),shares:num(row[ix.shares]),clicks:num(row[ix.clicks])};
      map[id]=add(map[id],m);
    }
    return Object.keys(map).length?map:null;
  }

  async function loadLivePaid(){
    try{
      const today=new Date().toISOString().slice(0,10);
      const r=await fetch(`/api/data?start_date=2026-08-01&end_date=${today}`,{cache:'no-store'});
      const d=await r.json();
      const live=parseLive(d);
      if(live){paidMap=live;paidSource='Supermetrics Live · 30 min cache';}
    }catch(_){}
  }

  function injectCss(){
    if(document.getElementById('tiktokPaidFilterCss')) return;
    const style=document.createElement('style');
    style.id='tiktokPaidFilterCss';
    style.textContent=`
      .influencers-performance-modes{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:8px 0 14px;padding-top:8px;border-top:1px dashed #e4e7ec}
      .influencers-performance-modes .mode-label{font-size:10px;font-weight:900;color:#667085;margin-left:4px}
      .influencers-mode{border:1px solid #d0d5dd;background:#fff;border-radius:999px;padding:6px 12px;font:900 11px Tajawal,sans-serif;color:#475467;cursor:pointer}
      .influencers-mode:hover{border-color:#98a2b3}.influencers-mode.active{background:#7c3aed;color:#fff;border-color:#7c3aed}
      .paid-tiktok-block{margin:8px 0 14px;border:1px solid #e4e7ec;border-radius:14px;overflow:hidden;background:#fff}
      .paid-tiktok-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 14px;background:#faf9ff;border-bottom:1px solid #ede9fe}
      .paid-tiktok-title{font-size:12px;font-weight:900;color:#101828}.paid-tiktok-source{font-size:10px;color:#7c3aed;font-weight:800;direction:ltr}
      .paid-tiktok-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;padding:10px}
      .paid-tiktok-kpi{padding:10px;border:1px solid #edf0f4;border-radius:10px;background:#fcfcfd}.paid-tiktok-kpi small{display:block;color:#667085;font-size:9px;font-weight:800}.paid-tiktok-kpi b{display:block;margin-top:4px;font:800 16px/1.2 JetBrains Mono,Tajawal,sans-serif;color:#101828;direction:ltr;text-align:right}
      .paid-tiktok-table-wrap{overflow:auto;border-top:1px solid #edf0f4}.paid-tiktok-table{width:100%;min-width:1180px;border-collapse:collapse}.paid-tiktok-table th,.paid-tiktok-table td{padding:10px 9px;border-bottom:1px solid #edf0f4;font-size:10px;text-align:right}.paid-tiktok-table th{background:#fcfcfd;color:#667085;white-space:nowrap}.paid-tiktok-table .num{font-family:JetBrains Mono,Tajawal,sans-serif;direction:ltr;text-align:left;font-weight:800;white-space:nowrap}.paid-pill{display:inline-flex;border-radius:999px;padding:4px 8px;background:#f4ebff;color:#6941c6;font-weight:900;direction:ltr}.paid-post{color:#175cd3;text-decoration:none;font-weight:800}.paid-empty{padding:18px;text-align:center;color:#98a2b3;font-size:11px}
      @media(max-width:850px){.paid-tiktok-kpis{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.appendChild(style);
  }

  function visibleCreatorPaid(body){
    const table=body.querySelector('.influencers-table');
    if(!table) return [];
    const out=[];
    let current=null;
    for(const tr of table.querySelectorAll('tbody tr')){
      const name=tr.querySelector('.influencer-name')?.textContent?.trim();
      const cat=tr.querySelector('.influencer-category')?.textContent?.trim();
      if(name) current={name,category:cat||'',metrics:null,ids:[],links:[]};
      if(!current||!tr.querySelector('.platform-name.tiktok')) continue;
      let merged=null;
      const ids=[]; const links=[];
      for(const a of tr.querySelectorAll('a[href]')){
        const id=videoId(a.href);
        if(!id||!paidMap[id]) continue;
        ids.push(id); links.push(a.href); merged=add(merged,paidMap[id]);
      }
      if(merged){
        const existing=out.find(x=>x.name===current.name);
        if(existing){existing.metrics=add(existing.metrics,merged);existing.ids.push(...ids);existing.links.push(...links);}
        else out.push({...current,metrics:merged,ids,links});
      }
    }
    return out;
  }

  function paidHtml(rows){
    const total=rows.reduce((a,r)=>add(a,r.metrics),null)||add(null,null);
    const engagement=total.likes+total.comments+total.shares;
    const cpv=total.views>0?total.spend/total.views:null;
    const cpe=engagement>0?total.spend/engagement:null;
    const trs=rows.map(r=>{
      const m=r.metrics,eng=m.likes+m.comments+m.shares;
      const links=r.ids.map((id,i)=>`<a class="paid-post" href="https://m.tiktok.com/v/${esc(id)}.html" target="_blank" rel="noopener noreferrer">${i?' · ':''}${esc(id)}</a>`).join('');
      return `<tr><td><b>${esc(r.name)}</b><br><span class="paid-pill">${esc(r.category)}</span></td><td>${links||'—'}</td><td class="num">${money(m.spend)}</td><td class="num">${fmt(m.impressions)}</td><td class="num">${fmt(m.views)}</td><td class="num">${fmt(m.likes)}</td><td class="num">${fmt(m.comments)}</td><td class="num">${fmt(m.shares)}</td><td class="num">${fmt(eng)}</td><td class="num">${fmt(m.clicks)}</td><td class="num">${cpv!==null?money(m.spend/m.views):'—'}</td><td class="num">${eng>0?money(m.spend/eng):'—'}</td></tr>`;
    }).join('');
    return `<div class="paid-tiktok-block" id="paidTikTokBlock">
      <div class="paid-tiktok-head"><div class="paid-tiktok-title">الأداء المدفوع لفيديوهات المؤثرين على TikTok</div><div class="paid-tiktok-source">${esc(paidSource)} · ${esc(CAMPAIGN)}</div></div>
      <div class="paid-tiktok-kpis">
        <div class="paid-tiktok-kpi"><small>الإنفاق الإعلاني</small><b>${money(total.spend)}</b></div>
        <div class="paid-tiktok-kpi"><small>المشاهدات المدفوعة</small><b>${fmt(total.views)}</b></div>
        <div class="paid-tiktok-kpi"><small>الظهور</small><b>${fmt(total.impressions)}</b></div>
        <div class="paid-tiktok-kpi"><small>التفاعل المدفوع</small><b>${fmt(engagement)}</b></div>
        <div class="paid-tiktok-kpi"><small>النقرات</small><b>${fmt(total.clicks)}</b></div>
      </div>
      ${rows.length?`<div class="paid-tiktok-table-wrap"><table class="paid-tiktok-table"><thead><tr><th>المؤثر</th><th>Post ID</th><th class="num">Spend</th><th class="num">Impressions</th><th class="num">Paid Views</th><th class="num">Paid Likes</th><th class="num">Paid Comments</th><th class="num">Paid Shares</th><th class="num">Paid Engagement</th><th class="num">Clicks</th><th class="num">CPV</th><th class="num">CPE</th></tr></thead><tbody>${trs}</tbody></table></div>`:`<div class="paid-empty">لا توجد منشورات TikTok مدفوعة مطابقة للمؤثرين الظاهرين في هذا التصنيف.</div>`}
    </div>`;
  }

  function applyMode(body){
    const organicWrap=body.querySelector('.influencers-table-wrap');
    const organicSummary=body.querySelector('.influencers-summary');
    const toolbar=body.querySelector('.influencers-toolbar');
    const paidBlock=body.querySelector('#paidTikTokBlock');
    if(organicWrap) organicWrap.style.display=activeMode==='paid'?'none':'';
    if(organicSummary) organicSummary.style.display=activeMode==='paid'?'none':'';
    if(toolbar) toolbar.style.display=activeMode==='paid'?'none':'';
    if(paidBlock) paidBlock.style.display=activeMode==='organic'?'none':'';
    body.querySelectorAll('.influencers-mode').forEach(b=>b.classList.toggle('active',b.dataset.mode===activeMode));
  }

  function enhance(){
    if(applying) return;
    const body=document.getElementById('influencersBody');
    if(!body||!body.querySelector('.influencers-filters')||body.querySelector('.influencers-performance-modes')) return;
    applying=true;
    try{
      injectCss();
      const filters=body.querySelector('.influencers-filters');
      const modes=document.createElement('div');
      modes.className='influencers-performance-modes';
      modes.innerHTML=`<span class="mode-label">نوع الأداء:</span><button class="influencers-mode" data-mode="all">All</button><button class="influencers-mode" data-mode="paid">Paid</button><button class="influencers-mode" data-mode="organic">Organic</button><span class="mode-label">Paid = TikTok Ads عبر Supermetrics · Organic = بيانات المنشورات العامة</span>`;
      filters.insertAdjacentElement('afterend',modes);
      const rows=visibleCreatorPaid(body);
      const toolbar=body.querySelector('.influencers-toolbar');
      if(toolbar) toolbar.insertAdjacentHTML('afterend',paidHtml(rows));
      else modes.insertAdjacentHTML('afterend',paidHtml(rows));
      modes.querySelectorAll('.influencers-mode').forEach(btn=>btn.addEventListener('click',()=>{activeMode=btn.dataset.mode||'all';applyMode(body);}));
      applyMode(body);
    }finally{applying=false;}
  }

  loadLivePaid().finally(()=>setTimeout(enhance,0));
  const observer=new MutationObserver(()=>setTimeout(enhance,0));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(enhance,0),{once:true}); else setTimeout(enhance,0);
})();