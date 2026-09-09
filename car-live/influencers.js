(()=>{
  const NF=new Intl.NumberFormat('en-US');
  const money=new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
  const moneyRate=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const pct=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  let activeFilter='all';
  let latestData=null;

  const esc=v=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
  const safeUrl=v=>{try{const u=new URL(String(v));return /^https?:$/.test(u.protocol)?u.href:'#';}catch(_){return '#';}};
  const val=v=>Number.isFinite(v)?NF.format(v):'—';
  const sar=v=>Number.isFinite(v)?`${money.format(v)} ر.س`:'—';
  const rate=v=>Number.isFinite(v)?`${moneyRate.format(v)} ر.س`:'—';
  const percent=v=>Number.isFinite(v)?`${pct.format(v*100)}%`:'—';
  const n=v=>Number.isFinite(Number(v))?Number(v):null;

  function platformLabel(p){
    return ({tiktok:'TikTok',instagram:'Instagram',snapchat:'Snapchat',manual:'Manual'})[p]||p||'—';
  }

  function categoryOf(item){
    const v=String(item?.category||'UGC').trim().toLowerCase();
    if(v==='mega') return 'Mega';
    if(v==='micro') return 'Micro';
    return 'UGC';
  }

  function filterItems(items){
    if(activeFilter==='mega') return items.filter(i=>categoryOf(i)==='Mega');
    if(activeFilter==='micro') return items.filter(i=>categoryOf(i)==='Micro');
    if(activeFilter==='ugc') return items.filter(i=>categoryOf(i)==='UGC');
    return items;
  }

  function addKnown(arr,key){
    const vals=arr.map(x=>n(x?.[key])).filter(Number.isFinite);
    return vals.length?vals.reduce((a,b)=>a+b,0):null;
  }

  function aggregate(posts=[]){
    const views=addKnown(posts,'views');
    const reach=addKnown(posts,'reach');
    const likes=addKnown(posts,'likes');
    const comments=addKnown(posts,'comments');
    const shares=addKnown(posts,'shares');
    const saves=addKnown(posts,'saves');
    const directEngagement=addKnown(posts,'engagement');
    const parts=[likes,comments,shares,saves].filter(Number.isFinite);
    const engagement=directEngagement!==null?directEngagement:(parts.length?parts.reduce((a,b)=>a+b,0):null);
    return {views,reach,likes,comments,shares,saves,engagement};
  }

  function refreshInfluencerMetrics(item){
    const metrics=aggregate(item.posts||[]);
    item.metrics=metrics;
    item.cpv=Number.isFinite(metrics.views)&&metrics.views>0?item.cost/metrics.views:null;
    item.cpe=Number.isFinite(metrics.engagement)&&metrics.engagement>0?item.cost/metrics.engagement:null;
  }

  function totalsFor(items){
    const cost=items.reduce((sum,i)=>sum+(Number.isFinite(i.cost)?i.cost:0),0);
    const metrics=aggregate(items.map(i=>i.metrics||{}));
    return {
      cost,...metrics,
      engagementRate:Number.isFinite(metrics.engagement)&&Number.isFinite(metrics.views)&&metrics.views>0?metrics.engagement/metrics.views:null,
      cpv:Number.isFinite(metrics.views)&&metrics.views>0?cost/metrics.views:null,
      cpe:Number.isFinite(metrics.engagement)&&metrics.engagement>0?cost/metrics.engagement:null
    };
  }

  function reelShortcode(url=''){
    return String(url).match(/\/(?:reel|p|tv)\/([^/?#]+)/i)?.[1]||'';
  }

  async function mapLimit(items,limit,worker){
    const out=new Array(items.length); let next=0;
    async function run(){
      for(;;){
        const idx=next++; if(idx>=items.length) return;
        try{out[idx]=await worker(items[idx],idx);}catch(_){out[idx]=null;}
      }
    }
    await Promise.all(Array.from({length:Math.min(limit,items.length||1)},run));
    return out;
  }

  async function enrichInstagram(data){
    const jobs=[];
    for(const item of data.influencers||[]){
      for(const post of item.posts||[]){
        if(post?.platform!=='instagram'||!post.url) continue;
        if(Number.isFinite(post.views)&&Number.isFinite(post.likes)&&Number.isFinite(post.comments)) continue;
        jobs.push({item,post});
      }
    }
    if(!jobs.length) return 0;

    let changed=0;
    await mapLimit(jobs,3,async ({item,post})=>{
      const q=new URLSearchParams();
      if(item.instagramProfile) q.set('profile',item.instagramProfile);
      q.set('reel',post.url);
      const code=reelShortcode(post.url); if(code) q.set('shortcode',code);
      const r=await fetch(`/api/instagram-public?${q}`,{cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.ok||!d.available) return;
      for(const key of ['views','likes','comments','shares','saves','reach','engagement']){
        if(Number.isFinite(d[key])) post[key]=d[key];
      }
      post.available=true;
      post.source=d.source||post.source||'instagram-public';
      changed++;
    });

    for(const item of data.influencers||[]) refreshInfluencerMetrics(item);
    return changed;
  }

  function injectCss(){
    if(document.getElementById('influencersCss')) return;
    const css=document.createElement('style');
    css.id='influencersCss';
    css.textContent=`
      .influencers-panel{margin-top:22px}
      .influencers-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .influencers-source{font-size:11px;font-weight:800;color:#7c3aed;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:999px;padding:6px 10px;direction:ltr}
      .influencers-filters{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:15px 0 4px}
      .influencers-filter{border:1px solid #d0d5dd;background:#fff;border-radius:999px;padding:7px 12px;font-family:Tajawal,sans-serif;font-size:11px;font-weight:900;color:#475467;cursor:pointer;transition:.15s ease}
      .influencers-filter:hover{border-color:#98a2b3;transform:translateY(-1px)}
      .influencers-filter.active{background:#101828;color:#fff;border-color:#101828}
      .influencers-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0}
      .influencers-stat{border:1px solid #e5eaf1;border-radius:13px;padding:13px;background:#fbfcfe}
      .influencers-stat .i-label{font-size:11px;color:#667085;font-weight:700}
      .influencers-stat .i-value{font:800 21px/1.25 JetBrains Mono,Tajawal,sans-serif;margin-top:5px;color:#101828}
      .influencers-stat .i-sub{font-size:10px;color:#98a2b3;margin-top:4px}
      .influencers-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:12px 0}
      .influencers-toolbar .i-note{font-size:11px;color:#667085;line-height:1.7}
      .influencers-refresh{border:1px solid #d0d5dd;background:#fff;border-radius:9px;height:36px;padding:0 12px;font-family:Tajawal,sans-serif;font-weight:800;color:#344054;cursor:pointer}
      .influencers-refresh:disabled{opacity:.55;cursor:wait}
      .influencers-table-wrap{overflow:auto;border-top:1px solid #edf0f4}
      .influencers-table{width:100%;min-width:1420px;border-collapse:collapse}
      .influencers-table th,.influencers-table td{padding:11px 9px;border-bottom:1px solid #edf0f4;font-size:11px;text-align:right;vertical-align:middle}
      .influencers-table th{font-size:10px;color:#667085;white-space:nowrap;background:#fcfcfd;position:sticky;top:0;z-index:1}
      .influencers-table .i-num{font-family:JetBrains Mono,Tajawal,sans-serif;text-align:left;direction:ltr;font-weight:800;white-space:nowrap}
      .influencer-name{font-weight:900;color:#101828;white-space:nowrap}
      .influencer-category{display:inline-flex;margin-top:5px;border-radius:999px;padding:3px 7px;font-size:9px;font-weight:900;direction:ltr}
      .influencer-category.mega{background:#fff1f3;color:#c01048;border:1px solid #fecdd6}
      .influencer-category.micro{background:#eff8ff;color:#175cd3;border:1px solid #b2ddff}
      .influencer-category.ugc{background:#ecfdf3;color:#027a48;border:1px solid #abefc6}
      .platform-name{display:inline-flex;border-radius:999px;padding:5px 9px;font-weight:900;direction:ltr;background:#f2f4f7;color:#344054}
      .platform-name.instagram{background:#fff1f3;color:#c01048}
      .platform-name.tiktok{background:#f2f4f7;color:#101828}
      .platform-name.snapchat{background:#fffaeb;color:#7a5d00}
      .platform-chips{display:flex;gap:5px;flex-wrap:wrap}
      .platform-chip{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;background:#f2f4f7;color:#344054;font-size:10px;font-weight:800;text-decoration:none;border:1px solid transparent}
      .platform-link{cursor:pointer;transition:.15s ease}.platform-link:hover{background:#e8f5fb;color:#078dcc;border-color:#b9e3f5;transform:translateY(-1px)}
      .platform-link:after{content:' ↗';font-size:9px;margin-right:3px}.profile-link{background:#fff7ed;color:#c2410c;border-color:#fed7aa}
      .platform-row.instagram td:not([rowspan]){background:#fffdfd}.platform-row.secondary td:not([rowspan]){border-top:1px dashed #e4e7ec}
      .metric-unavailable{color:#98a2b3;font-weight:600}
      .influencers-loading,.influencers-error{padding:18px;border-radius:11px;background:#f8fafc;color:#667085;font-size:12px;line-height:1.8}
      .influencers-error{background:#fff5f5;color:#b42318}
      @media(max-width:1100px){.influencers-summary{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:800px){.influencers-summary{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:520px){.influencers-summary{grid-template-columns:1fr 1fr}.influencers-stat .i-value{font-size:18px}}
    `;
    document.head.appendChild(css);
  }

  function panel(){
    let root=document.getElementById('influencersPanel');
    if(root) return root;
    injectCss();
    root=document.createElement('section');
    root.id='influencersPanel'; root.className='panel influencers-panel';
    root.innerHTML=`<div class="influencers-head"><div class="panel-head" style="margin:0"><div><h2>المؤثرين</h2><div class="note" id="influencersNote">Mega / Micro / UGC · كل منصة في صف مستقل</div></div></div><div class="influencers-source">INFLUENCERS PERFORMANCE</div></div><div id="influencersBody" class="influencers-loading">جاري تحميل بيانات المؤثرين…</div>`;
    const bitly=document.getElementById('bitlyPanel');
    if(bitly?.parentElement) bitly.parentElement.insertBefore(root,bitly.nextSibling);
    else document.querySelector('.wrap')?.appendChild(root);
    return root;
  }

  function linksHtml(item,platform,posts){
    const links=[];
    posts.filter(p=>p?.url).forEach((p,idx)=>{
      links.push(`<a class="platform-chip platform-link" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener noreferrer">${esc(posts.length>1?`${platformLabel(platform)} ${idx+1}`:platformLabel(platform))}</a>`);
    });
    if(platform==='instagram'&&item.instagramProfile){
      links.push(`<a class="platform-chip platform-link profile-link" href="${esc(safeUrl(item.instagramProfile))}" target="_blank" rel="noopener noreferrer">Instagram Profile</a>`);
    }
    return links.length?`<div class="platform-chips">${links.join('')}</div>`:'<span class="metric-unavailable">—</span>';
  }

  function platformGroups(item){
    const social=(item.posts||[]).filter(p=>['tiktok','instagram','snapchat'].includes(p?.platform));
    const order=['tiktok','instagram','snapchat'];
    const groups=[];
    for(const platform of order){
      const posts=social.filter(p=>p.platform===platform);
      if(posts.length) groups.push({platform,posts,metrics:aggregate(posts)});
    }
    if(!groups.length){
      const manual=(item.posts||[]).filter(p=>p?.platform==='manual'||p?.platform==='manual-fallback');
      if(manual.length) groups.push({platform:'manual',posts:manual,metrics:aggregate(manual)});
      else groups.push({platform:String(item.platform||'—'),posts:[],metrics:item.metrics||{}});
    }
    return groups;
  }

  function rowHtml(item){
    const groups=platformGroups(item);
    const category=categoryOf(item), catClass=category.toLowerCase();
    return groups.map((g,idx)=>{
      const m=g.metrics||{};
      const shared=idx===0?`
        <td rowspan="${groups.length}"><div class="influencer-name">${esc(item.name)}</div><span class="influencer-category ${catClass}">${esc(category)}</span></td>
        <td rowspan="${groups.length}" class="i-num">${sar(item.cost)}</td>`:'';
      const efficiency=idx===0?`
        <td rowspan="${groups.length}" class="i-num">${rate(item.cpv)}</td>
        <td rowspan="${groups.length}" class="i-num">${rate(item.cpe)}</td>`:'';
      const pkey=String(g.platform).toLowerCase();
      return `<tr class="platform-row ${pkey} ${idx?'secondary':''}">
        ${shared}
        <td><span class="platform-name ${esc(pkey)}">${esc(platformLabel(g.platform))}</span></td>
        <td>${linksHtml(item,g.platform,g.posts)}</td>
        <td class="i-num">${val(m.views)}</td><td class="i-num">${val(m.reach)}</td><td class="i-num">${val(m.likes)}</td>
        <td class="i-num">${val(m.comments)}</td><td class="i-num">${val(m.shares)}</td><td class="i-num">${val(m.saves)}</td><td class="i-num">${val(m.engagement)}</td>
        ${efficiency}
      </tr>`;
    }).join('');
  }

  function render(data){
    latestData=data;
    const body=document.getElementById('influencersBody');
    const note=document.getElementById('influencersNote');
    if(!body) return;
    const allItems=data.influencers||[];
    const items=filterItems(allItems);
    const counts={Mega:allItems.filter(i=>categoryOf(i)==='Mega').length,Micro:allItems.filter(i=>categoryOf(i)==='Micro').length,UGC:allItems.filter(i=>categoryOf(i)==='UGC').length};
    const filterLabel=activeFilter==='mega'?'Mega':activeFilter==='micro'?'Micro':activeFilter==='ugc'?'UGC':'الكل';
    if(note) note.textContent=`${NF.format(items.length)} ظاهر من ${NF.format(allItems.length)} · ${filterLabel} · كل منصة في صف مستقل · آخر تحديث ${new Date(data.updatedAt).toLocaleString('ar-SA')}`;
    const t=totalsFor(items);

    const filters=`<div class="influencers-filters" aria-label="فلترة تصنيف المؤثرين">
      <button type="button" class="influencers-filter ${activeFilter==='all'?'active':''}" data-filter="all">الكل (${NF.format(allItems.length)})</button>
      <button type="button" class="influencers-filter ${activeFilter==='mega'?'active':''}" data-filter="mega">Mega (${NF.format(counts.Mega)})</button>
      <button type="button" class="influencers-filter ${activeFilter==='micro'?'active':''}" data-filter="micro">Micro (${NF.format(counts.Micro)})</button>
      <button type="button" class="influencers-filter ${activeFilter==='ugc'?'active':''}" data-filter="ugc">UGC (${NF.format(counts.UGC)})</button></div>`;

    const summary=`<div class="influencers-summary">
      <div class="influencers-stat"><div class="i-label">إجمالي التكلفة</div><div class="i-value">${sar(t.cost)}</div><div class="i-sub">${NF.format(items.length)} اسم</div></div>
      <div class="influencers-stat"><div class="i-label">إجمالي المشاهدات</div><div class="i-value">${val(t.views)}</div><div class="i-sub">TikTok + Instagram المتاح</div></div>
      <div class="influencers-stat"><div class="i-label">إجمالي الوصول</div><div class="i-value">${val(t.reach)}</div><div class="i-sub">عند توفر Reach</div></div>
      <div class="influencers-stat"><div class="i-label">إجمالي التفاعل</div><div class="i-value">${val(t.engagement)}</div><div class="i-sub">إعجاب + تعليق + مشاركة + حفظ</div></div>
      <div class="influencers-stat"><div class="i-label">معدل التفاعل</div><div class="i-value">${percent(t.engagementRate)}</div><div class="i-sub">التفاعل ÷ المشاهدات</div></div>
      <div class="influencers-stat"><div class="i-label">CPV</div><div class="i-value">${rate(t.cpv)}</div><div class="i-sub">التكلفة ÷ المشاهدات</div></div>
      <div class="influencers-stat"><div class="i-label">CPE</div><div class="i-value">${rate(t.cpe)}</div><div class="i-sub">التكلفة ÷ التفاعل</div></div></div>`;

    const rows=items.map(rowHtml).join('');
    body.className='';
    body.innerHTML=`${filters}${summary}
      <div class="influencers-toolbar"><div class="i-note">TikTok وInstagram يظهران في صفوف منفصلة لنفس المؤثر. Instagram يستخدم بيانات عامة منظّمة أولًا ثم صفحة الريل وصفحة Reels كـfallback.</div><button type="button" class="influencers-refresh" id="influencersRefresh">تحديث المؤثرين</button></div>
      <div class="influencers-table-wrap"><table class="influencers-table"><thead><tr>
        <th>المؤثر / التصنيف</th><th class="i-num">التكلفة</th><th>المنصة</th><th>الروابط</th>
        <th class="i-num">المشاهدات</th><th class="i-num">Reach</th><th class="i-num">الإعجابات</th><th class="i-num">التعليقات</th><th class="i-num">المشاركات</th><th class="i-num">الحفظ</th><th class="i-num">إجمالي التفاعل</th><th class="i-num">CPV</th><th class="i-num">CPE</th>
      </tr></thead><tbody>${rows||'<tr><td colspan="13" style="text-align:center;color:#98a2b3;padding:20px">لا توجد بيانات في هذا التصنيف حاليًا</td></tr>'}</tbody></table></div>`;

    body.querySelectorAll('.influencers-filter').forEach(btn=>btn.addEventListener('click',()=>{activeFilter=btn.dataset.filter||'all';render(latestData);}));
    document.getElementById('influencersRefresh')?.addEventListener('click',()=>load(true));
  }

  async function load(force=false){
    panel();
    const body=document.getElementById('influencersBody');
    const btn=document.getElementById('influencersRefresh');
    if(btn) btn.disabled=true;
    if(force&&body) body.innerHTML='<div class="influencers-loading">جاري تحديث بيانات المؤثرين وInstagram…</div>';
    try{
      const r=await fetch(`/api/influencers${force?`?t=${Date.now()}`:''}`,{cache:'no-store'});
      const data=await r.json().catch(()=>({}));
      if(!r.ok||!data.ok) throw new Error(data.error||`HTTP ${r.status}`);
      render(data);
      const changed=await enrichInstagram(data);
      if(changed) render(data);
    }catch(e){
      if(body){body.className='influencers-error';body.innerHTML=`تعذر تحميل بيانات المؤثرين: ${esc(e?.message||e)}`;}
    }finally{const current=document.getElementById('influencersRefresh');if(current)current.disabled=false;}
  }

  function start(){panel();load(false);}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
