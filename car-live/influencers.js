(()=>{
  const NF=new Intl.NumberFormat('en-US');
  const money=new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
  const moneyRate=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const pct=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const safeUrl=v=>{try{const u=new URL(String(v));return /^https?:$/.test(u.protocol)?u.href:'#';}catch(_){return '#';}};
  const val=(v,fmt=NF)=>Number.isFinite(v)?fmt.format(v):'—';
  const sar=v=>Number.isFinite(v)?`${money.format(v)} ر.س`:'—';
  const rate=v=>Number.isFinite(v)?`${moneyRate.format(v)} ر.س`:'—';
  const percent=v=>Number.isFinite(v)?`${pct.format(v*100)}%`:'—';

  function platformLabel(p){
    return ({tiktok:'TikTok',instagram:'Instagram',snapchat:'Snapchat'})[p]||p||'—';
  }

  function injectCss(){
    if(document.getElementById('influencersCss')) return;
    const css=document.createElement('style');
    css.id='influencersCss';
    css.textContent=`
      .influencers-panel{margin-top:22px}
      .influencers-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .influencers-source{font-size:11px;font-weight:800;color:#7c3aed;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:999px;padding:6px 10px;direction:ltr}
      .influencers-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0}
      .influencers-stat{border:1px solid #e5eaf1;border-radius:13px;padding:13px;background:#fbfcfe}
      .influencers-stat .i-label{font-size:11px;color:#667085;font-weight:700}
      .influencers-stat .i-value{font:800 21px/1.25 JetBrains Mono,Tajawal,sans-serif;margin-top:5px;color:#101828}
      .influencers-stat .i-sub{font-size:10px;color:#98a2b3;margin-top:4px}
      .influencers-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:12px 0}
      .influencers-toolbar .i-note{font-size:11px;color:#667085;line-height:1.7}
      .influencers-refresh{border:1px solid #d0d5dd;background:#fff;border-radius:9px;height:36px;padding:0 12px;font-family:Tajawal,sans-serif;font-weight:800;color:#344054;cursor:pointer}
      .influencers-refresh:disabled{opacity:.55;cursor:wait}
      .influencers-table-wrap{overflow:auto;border-top:1px solid #edf0f4}
      .influencers-table{width:100%;min-width:1180px;border-collapse:collapse}
      .influencers-table th,.influencers-table td{padding:11px 9px;border-bottom:1px solid #edf0f4;font-size:11px;text-align:right;vertical-align:top}
      .influencers-table th{font-size:10px;color:#667085;white-space:nowrap;background:#fcfcfd;position:sticky;top:0;z-index:1}
      .influencers-table .i-num{font-family:JetBrains Mono,Tajawal,sans-serif;text-align:left;direction:ltr;font-weight:800;white-space:nowrap}
      .influencer-name{font-weight:900;color:#101828;white-space:nowrap}
      .platform-chips{display:flex;gap:5px;flex-wrap:wrap}
      .platform-chip{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;background:#f2f4f7;color:#344054;font-size:10px;font-weight:800;text-decoration:none;border:1px solid transparent}
      .platform-link{cursor:pointer;transition:.15s ease}
      .platform-link:hover{background:#e8f5fb;color:#078dcc;border-color:#b9e3f5;transform:translateY(-1px)}
      .platform-link:after{content:' ↗';font-size:9px;margin-right:3px}
      .metric-unavailable{color:#98a2b3;font-weight:600}
      .influencers-loading,.influencers-error{padding:18px;border-radius:11px;background:#f8fafc;color:#667085;font-size:12px;line-height:1.8}
      .influencers-error{background:#fff5f5;color:#b42318}
      @media(max-width:900px){.influencers-summary{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:520px){.influencers-summary{grid-template-columns:1fr 1fr}.influencers-stat .i-value{font-size:18px}}
    `;
    document.head.appendChild(css);
  }

  function panel(){
    let root=document.getElementById('influencersPanel');
    if(root) return root;
    injectCss();
    root=document.createElement('section');
    root.id='influencersPanel';
    root.className='panel influencers-panel';
    root.innerHTML=`
      <div class="influencers-head">
        <div class="panel-head" style="margin:0">
          <div>
            <h2>المؤثرين</h2>
            <div class="note" id="influencersNote">أداء محتوى UGC وتكلفة كل مؤثر</div>
          </div>
        </div>
        <div class="influencers-source">UGC PERFORMANCE</div>
      </div>
      <div id="influencersBody" class="influencers-loading">جاري تحميل بيانات المؤثرين…</div>
    `;

    const bitly=document.getElementById('bitlyPanel');
    if(bitly?.parentElement) bitly.parentElement.insertBefore(root,bitly.nextSibling);
    else {
      const footer=document.querySelector('footer');
      if(footer) footer.parentElement.insertBefore(root,footer);
      else document.querySelector('.wrap')?.appendChild(root);
    }
    return root;
  }

  function platformsHtml(item){
    const posts=(item.posts||[]).filter(p=>p?.platform&&p?.url);
    if(!posts.length) return `<span class="platform-chip">${esc(item.platform||'—')}</span>`;

    const unique=[];
    const seen=new Set();
    for(const post of posts){
      const key=String(post.platform).toLowerCase();
      if(seen.has(key)) continue;
      seen.add(key);
      unique.push(post);
    }

    return `<div class="platform-chips">${unique.map(post=>{
      const href=safeUrl(post.url);
      const label=platformLabel(post.platform);
      return `<a class="platform-chip platform-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="فتح فيديو ${esc(label)}">${esc(label)}</a>`;
    }).join('')}</div>`;
  }

  function numCell(v){
    return Number.isFinite(v)?NF.format(v):'<span class="metric-unavailable">—</span>';
  }

  function render(data){
    const body=document.getElementById('influencersBody');
    const note=document.getElementById('influencersNote');
    if(!body) return;
    if(note) note.textContent=`${NF.format(data.creatorCount||0)} مؤثر · آخر تحديث ${new Date(data.updatedAt).toLocaleString('ar-SA')}`;

    const t=data.totals||{};
    const summary=`
      <div class="influencers-summary">
        <div class="influencers-stat"><div class="i-label">إجمالي تكلفة المؤثرين</div><div class="i-value">${sar(t.cost)}</div><div class="i-sub">${NF.format(data.creatorCount||0)} مؤثر</div></div>
        <div class="influencers-stat"><div class="i-label">إجمالي المشاهدات</div><div class="i-value">${val(t.views)}</div><div class="i-sub">TikTok + Instagram المتاح</div></div>
        <div class="influencers-stat"><div class="i-label">إجمالي التفاعل</div><div class="i-value">${val(t.engagement)}</div><div class="i-sub">إعجاب + تعليق + مشاركة + حفظ</div></div>
        <div class="influencers-stat"><div class="i-label">معدل التفاعل</div><div class="i-value">${percent(t.engagementRate)}</div><div class="i-sub">التفاعل ÷ المشاهدات</div></div>
        <div class="influencers-stat"><div class="i-label">CPV تكلفة المشاهدة</div><div class="i-value">${rate(t.cpv)}</div><div class="i-sub">التكلفة ÷ المشاهدات</div></div>
        <div class="influencers-stat"><div class="i-label">CPE تكلفة التفاعل</div><div class="i-value">${rate(t.cpe)}</div><div class="i-sub">التكلفة ÷ إجمالي التفاعل</div></div>
      </div>`;

    const rows=(data.influencers||[]).map(i=>{
      const m=i.metrics||{};
      return `<tr>
        <td><div class="influencer-name">${esc(i.name)}</div></td>
        <td>${platformsHtml(i)}</td>
        <td class="i-num">${sar(i.cost)}</td>
        <td class="i-num">${numCell(m.views)}</td>
        <td class="i-num">${numCell(m.likes)}</td>
        <td class="i-num">${numCell(m.comments)}</td>
        <td class="i-num">${numCell(m.shares)}</td>
        <td class="i-num">${numCell(m.saves)}</td>
        <td class="i-num">${numCell(m.engagement)}</td>
        <td class="i-num">${rate(i.cpv)}</td>
        <td class="i-num">${rate(i.cpe)}</td>
      </tr>`;
    }).join('');

    body.className='';
    body.innerHTML=`
      ${summary}
      <div class="influencers-toolbar">
        <div class="i-note">التكلفة حسب ملف المؤثرين المرفق. اضغط على المنصة لفتح فيديو المؤثر عند توفر الرابط.</div>
        <button type="button" class="influencers-refresh" id="influencersRefresh">تحديث المؤثرين</button>
      </div>
      <div class="influencers-table-wrap">
        <table class="influencers-table">
          <thead><tr>
            <th>المؤثر</th><th>المنصة</th>
            <th class="i-num">التكلفة</th><th class="i-num">المشاهدات</th><th class="i-num">الإعجابات</th>
            <th class="i-num">التعليقات</th><th class="i-num">المشاركات</th><th class="i-num">الحفظ</th>
            <th class="i-num">إجمالي التفاعل</th><th class="i-num">CPV</th><th class="i-num">CPE</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    document.getElementById('influencersRefresh')?.addEventListener('click',()=>load(true));
  }

  async function load(force=false){
    panel();
    const body=document.getElementById('influencersBody');
    const btn=document.getElementById('influencersRefresh');
    if(btn) btn.disabled=true;
    if(force&&body) body.innerHTML='<div class="influencers-loading">جاري تحديث بيانات المؤثرين…</div>';
    try{
      const r=await fetch(`/api/influencers${force?`?t=${Date.now()}`:''}`,{cache:'no-store'});
      const data=await r.json().catch(()=>({}));
      if(!r.ok||!data.ok) throw new Error(data.error||`HTTP ${r.status}`);
      render(data);
    }catch(e){
      if(body){
        body.className='influencers-error';
        body.innerHTML=`تعذر تحميل بيانات المؤثرين: ${esc(e?.message||e)}`;
      }
    }finally{if(btn)btn.disabled=false;}
  }

  function start(){
    panel();
    load(false);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
