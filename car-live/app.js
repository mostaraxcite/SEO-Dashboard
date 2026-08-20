const order=['Meta','Snapchat','TikTok','Google','LinkedIn','Pinterest','X'];
const CUR={Meta:'USD',Snapchat:'USD',TikTok:'SAR',Google:'USD',LinkedIn:'SAR',Pinterest:'USD',X:'USD'};
const ACTION={Meta:'Link clicks',Snapchat:'Swipes',TikTok:'Clicks',Google:'Clicks',LinkedIn:'Clicks',Pinterest:'Pin clicks',X:'Link clicks'};
const COL={Meta:'#1877F2',Snapchat:'#f4d817',TikTok:'#111',Google:'#4285F4',LinkedIn:'#0A66C2',Pinterest:'#E60023',X:'#000'};
const CPM_BENCHMARK=5.00;
const TAG_STORAGE_KEY='jazeeraCampaignTagsV1';
const currentYear=new Date().getFullYear();
const DEFAULT_START=`${currentYear}-01-01`;

const CAMPAIGN_TAGS={
  all:{label:'كل الحملات',patterns:{},system:true},
  bmw:{label:'BMW',patterns:{Meta:['car-r','bmw'],Snapchat:['car-r','bmw'],TikTok:['bmw'],Google:['bmw'],LinkedIn:['bmw','car-r','car raffle'],Pinterest:['bmw'],X:['bmw']},system:true},
  sealtec:{label:'Sealtec',patterns:{Meta:['sealtec'],Snapchat:['sealtec'],TikTok:['sealtec'],Google:['sealtec'],LinkedIn:['sealtec'],Pinterest:['sealtec'],X:['sealtec']},system:true}
};

function loadCustomTags(){
  try{
    const saved=JSON.parse(localStorage.getItem(TAG_STORAGE_KEY)||'{}');
    for(const [key,cfg] of Object.entries(saved)){
      if(cfg?.label&&cfg?.patterns) CAMPAIGN_TAGS[key]={label:String(cfg.label),patterns:cfg.patterns,system:false};
    }
  }catch(_){/* ignore malformed local storage */}
}
function saveCustomTags(){
  const out={};
  for(const [key,cfg] of Object.entries(CAMPAIGN_TAGS)) if(!cfg.system) out[key]={label:cfg.label,patterns:cfg.patterns};
  localStorage.setItem(TAG_STORAGE_KEY,JSON.stringify(out));
}
loadCustomTags();

const f=(x,d=0)=>Number.isFinite(x)?x.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const n=v=>{
  if(v===null||v===undefined||v==='') return NaN;
  const x=Number(String(v).replace(/[$,%\s,]/g,''));
  return Number.isFinite(x)?x:NaN;
};
const norm=s=>String(s??'').toLowerCase().replace(/[_-]/g,' ').replace(/\s+/g,' ').trim();

function ix(h,a){
  const z=h.map(norm);
  for(const q of a){const i=z.indexOf(norm(q));if(i>=0)return i;}
  for(const q of a){const i=z.findIndex(v=>v.includes(norm(q)));if(i>=0)return i;}
  return -1;
}
function table(p){
  for(const x of [p?.data,p?.data?.data,p?.results,p?.result?.data,p]){
    if(Array.isArray(x)&&x.length&&Array.isArray(x[0])) return x;
  }
  return null;
}
function campaignMatches(platform,name,tag){
  if(tag==='all') return true;
  const cfg=CAMPAIGN_TAGS[tag];
  if(!cfg) return true;
  const patterns=cfg.patterns?.[platform]||[];
  const value=norm(name);
  return patterns.some(p=>value.includes(norm(p)));
}
function localISODate(date=new Date()){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(v);}
function displayDate(v){
  if(!validDate(v)) return v;
  const [y,m,d]=v.split('-').map(Number);
  return new Date(y,m-1,d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
}

let selectedRange={start:DEFAULT_START,end:localISODate()};
let selectedTag='all';
let lastPayload=null;

function parse(platform,p,tag=selectedTag){
  const t=table(p);
  if(!t||t.length<2) throw Error('No data rows');
  const h=t[0].map(String);
  let rs=t.slice(1);

  const ci=ix(h,['Campaign name','Campaign']);
  const ui=ix(h,['Cost (USD)','Spend (USD)']);
  const co=ix(h,['Cost','Spend','Amount spent']);
  const cu=ix(h,['Currency','Advertiser currency','Account currency','Campaign currency']);
  const im=ix(h,['Impressions','Impressions paid','Paid impressions']);
  const re=ix(h,['Reach','Unique users','Total reach']);
  const cpmi=ix(h,['CPM','eCPM','CPM (cost per 1000 impressions)']);
  const ac=ix(h,
    platform==='Snapchat'?['Swipes','Clicks']:
    platform==='Pinterest'?['Pin clicks','Clicks','Clicks paid','Outbound clicks']:
    platform==='X'?['Link clicks','Clicks']:
    platform==='Meta'?['Link clicks','Clicks (all)','Clicks','Actions']:
    platform==='LinkedIn'?['Clicks','Link clicks','Total clicks']:
    ['Clicks','Link clicks','Actions']
  );

  if(tag!=='all'){
    if(ci<0) throw Error('Campaign name is required in the Supermetrics Saved Query');
    rs=rs.filter(r=>campaignMatches(platform,r[ci],tag));
    if(!rs.length) throw Error(`لا توجد بيانات مطابقة لـ ${CAMPAIGN_TAGS[tag]?.label||tag}`);
  }

  let spend=0,ims=0,reach=0,acts=0,hasR=false;
  const camps=new Set();
  for(const r of rs){
    if(ci>=0&&r[ci]) camps.add(String(r[ci]).trim());
    const cur=cu>=0&&r[cu]?String(r[cu]).toUpperCase():CUR[platform];
    let usd=ui>=0?n(r[ui]):NaN;
    const localCost=co>=0?n(r[co]):NaN;
    const imv=im>=0?n(r[im]):NaN;
    const cpmLocal=cpmi>=0?n(r[cpmi]):NaN;

    if(!Number.isFinite(usd)&&Number.isFinite(localCost)) usd=cur.includes('SAR')?localCost/3.75:localCost;
    if(!Number.isFinite(usd)&&Number.isFinite(imv)&&Number.isFinite(cpmLocal)){
      const calc=imv*cpmLocal/1000;
      usd=cur.includes('SAR')?calc/3.75:calc;
    }

    if(Number.isFinite(usd)) spend+=usd;
    if(Number.isFinite(imv)) ims+=imv;
    let v=re>=0?n(r[re]):NaN;
    if(Number.isFinite(v)&&v>0){reach+=v;hasR=true;}
    v=ac>=0?n(r[ac]):NaN;
    if(Number.isFinite(v)) acts+=v;
  }

  const campaigns=[...camps];
  return {
    platform,
    campaigns,
    campaignField:ci>=0,
    campaign:campaigns.length?campaigns.join(' + '):'Campaign name unavailable',
    spend,ims,reach:hasR?reach:NaN,acts,
    action:ACTION[platform],
    ctr:ims?acts/ims*100:NaN,
    cpm:ims?spend/ims*1000:NaN,
    cpa:acts?spend/acts:NaN
  };
}

function insightCard(label,value,sub,color='#078dcc'){
  return `<div class="gauge"><div class="gname">${label}</div><div class="gvalue num" style="margin-top:26px">${value}</div><div class="gsub" style="margin-top:9px;line-height:1.6">${sub}</div><div style="position:absolute;top:0;right:0;left:0;height:4px;background:${color}"></div></div>`;
}
function paidRow(d){
  return `<tr><td><div class="platform"><i class="pdot" style="background:${COL[d.platform]}"></i>${d.platform}</div></td><td class="n">$${f(d.spend,2)}</td><td class="n">${f(d.ims)}</td><td class="n">${f(d.acts)}</td><td class="n">${f(d.ctr,2)}%</td><td class="n">$${f(d.cpa,2)}</td></tr>`;
}
function detailRow(d){
  const names=d.campaigns.length?d.campaigns.join(' · '):'—';
  return `<tr><td><b>${d.platform}</b></td><td style="max-width:420px;white-space:normal;line-height:1.6">${names}</td><td class="n">${f(d.campaigns.length)}</td><td class="n">${f(d.spend*3.75,2)}</td><td class="n">${f(d.reach)}</td><td>${d.action}</td><td class="n">$${f(d.cpm,3)}</td></tr>`;
}
function bar(d,max){
  const pct=max?d.spend/max*100:0;
  return `<div class="bar"><div class="bar-top"><div class="bar-name"><i class="pdot" style="background:${COL[d.platform]}"></i>${d.platform}</div><div class="num">$${f(d.spend,2)}</div></div><div class="track"><div class="fill" style="width:${pct}%"></div></div></div>`;
}

function updatePeriodText(){
  const period=document.querySelector('.period');
  if(!period) return;
  const tagLabel=CAMPAIGN_TAGS[selectedTag]?.label||selectedTag;
  period.textContent=`الفترة: ${displayDate(selectedRange.start)} — ${displayDate(selectedRange.end)} · العرض: ${tagLabel} · تحديث تلقائي كل 30 دقيقة`;
}
function tagOptions(){
  return Object.entries(CAMPAIGN_TAGS).map(([key,c])=>`<option value="${key}" ${key===selectedTag?'selected':''}>${c.label}</option>`).join('');
}
function refreshTagControls(){
  const select=document.getElementById('campaignTag');
  if(select){select.innerHTML=tagOptions();select.value=selectedTag;}
  const del=document.getElementById('deleteCampaignTag');
  if(del) del.style.display=CAMPAIGN_TAGS[selectedTag]?.system===false?'inline-flex':'none';
}
function splitPatterns(value,fallback){
  const a=String(value||'').split(',').map(v=>v.trim()).filter(Boolean);
  return a.length?a:[fallback];
}
function openTagModal(){const m=document.getElementById('tagModal');if(m)m.style.display='flex';}
function closeTagModal(){const m=document.getElementById('tagModal');if(m)m.style.display='none';}
function createTagFromModal(){
  const label=document.getElementById('tagName').value.trim();
  if(!label){alert('اكتب اسم التاج');return;}
  const key='custom_'+Date.now();
  const patterns={};
  for(const p of order) patterns[p]=splitPatterns(document.getElementById('tag_'+p).value,label);
  CAMPAIGN_TAGS[key]={label,patterns,system:false};
  saveCustomTags();
  selectedTag=key;
  refreshTagControls();
  const u=new URL(location.href);u.searchParams.set('campaign',key);history.replaceState({},'',u);
  updatePeriodText();closeTagModal();
  document.querySelectorAll('#tagModal input').forEach(i=>i.value='');
  if(lastPayload) renderPayload(lastPayload);
}
function deleteSelectedTag(){
  const cfg=CAMPAIGN_TAGS[selectedTag];
  if(!cfg||cfg.system!==false) return;
  if(!confirm(`حذف تاج ${cfg.label}؟`)) return;
  delete CAMPAIGN_TAGS[selectedTag];
  saveCustomTags();
  selectedTag='all';
  refreshTagControls();
  const u=new URL(location.href);u.searchParams.delete('campaign');history.replaceState({},'',u);
  updatePeriodText();
  if(lastPayload) renderPayload(lastPayload);
}

function installFilters(){
  const period=document.querySelector('.period');
  if(!period||document.getElementById('dateFilter')) return;

  const css=document.createElement('style');
  css.textContent=`
    .date-filter{width:100%;display:flex;justify-content:flex-start;align-items:flex-end;gap:8px;flex-wrap:wrap;direction:rtl;margin:0 0 14px 0}.date-filter .df-group{display:flex;flex-direction:column;gap:4px;text-align:right}.date-filter label{font-family:Tajawal,sans-serif;font-size:11px;color:#667085;font-weight:700}.date-filter input,.date-filter select{height:36px;border:1px solid #d7dee8;border-radius:9px;background:#fff;padding:0 10px;font-family:Tajawal,Arial,sans-serif;font-size:12px;color:#101828;outline:none}.date-filter input{font-family:JetBrains Mono,Tajawal,sans-serif;direction:ltr}.date-filter select{min-width:150px;font-weight:700;cursor:pointer}.date-filter input:focus,.date-filter select:focus{border-color:#0794d2;box-shadow:0 0 0 3px rgba(7,148,210,.10)}.date-filter button{height:36px;border-radius:9px;padding:0 14px;border:1px solid #d7dee8;background:#fff;color:#344054;font-family:Tajawal,sans-serif;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}.date-filter .df-apply{background:#078dcc;color:#fff;border-color:#078dcc}.date-filter .df-add{background:#101828;color:#fff;border-color:#101828}.date-filter .df-delete{color:#b42318;border-color:#f3c4c4;background:#fff}.date-filter .df-title{height:36px;display:flex;align-items:center;font-size:12px;font-weight:800;color:#0f1728;margin-left:4px}
    .tag-modal{position:fixed;inset:0;z-index:100000;background:rgba(16,24,40,.55);display:none;align-items:center;justify-content:center;padding:18px}.tag-card{width:min(720px,96vw);max-height:90vh;overflow:auto;background:#fff;border-radius:18px;padding:22px;box-shadow:0 24px 70px rgba(16,24,40,.25);direction:rtl}.tag-card h3{font-size:20px;margin-bottom:5px}.tag-help{font-size:12px;color:#667085;margin-bottom:16px;line-height:1.7}.tag-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.tag-field{display:flex;flex-direction:column;gap:5px}.tag-field.full{grid-column:1/-1}.tag-field label{font-size:12px;font-weight:700;color:#344054}.tag-field input{height:39px;border:1px solid #d7dee8;border-radius:9px;padding:0 10px;font-family:Tajawal,Arial,sans-serif;outline:none}.tag-field input:focus{border-color:#078dcc;box-shadow:0 0 0 3px rgba(7,141,204,.10)}.tag-actions{display:flex;gap:8px;justify-content:flex-start;margin-top:18px}.tag-actions button{height:38px;border-radius:9px;padding:0 16px;border:1px solid #d7dee8;background:#fff;font-family:Tajawal,sans-serif;font-weight:800;cursor:pointer}.tag-actions .save-tag{background:#078dcc;border-color:#078dcc;color:#fff}@media(max-width:700px){.date-filter{gap:6px}.date-filter .df-title{width:100%;height:auto}.date-filter input{max-width:145px}.date-filter select{min-width:130px}.date-filter button{padding:0 10px}.tag-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  const params=new URLSearchParams(location.search);
  const from=params.get('from'),to=params.get('to'),campaign=params.get('campaign');
  if(validDate(from)&&validDate(to)&&from<=to) selectedRange={start:from,end:to};
  if(campaign&&CAMPAIGN_TAGS[campaign]) selectedTag=campaign;

  const box=document.createElement('div');
  box.id='dateFilter';box.className='date-filter';
  box.innerHTML=`
    <div class="df-title">فلاتر التقرير</div>
    <div class="df-group"><label for="campaignTag">Campaign View</label><select id="campaignTag">${tagOptions()}</select></div>
    <button id="addCampaignTag" class="df-add" type="button">+ إضافة تاج</button>
    <button id="deleteCampaignTag" class="df-delete" type="button" style="display:none">حذف التاج</button>
    <div class="df-group"><label for="dateFrom">من</label><input id="dateFrom" type="date" value="${selectedRange.start}"></div>
    <div class="df-group"><label for="dateTo">إلى</label><input id="dateTo" type="date" max="${localISODate()}" value="${selectedRange.end}"></div>
    <button id="applyDate" class="df-apply" type="button">تطبيق</button>
    <button id="resetDate" type="button">من بداية السنة</button>`;
  period.parentElement.insertBefore(box,period.parentElement.firstChild);

  const modal=document.createElement('div');
  modal.id='tagModal';modal.className='tag-modal';
  modal.innerHTML=`<div class="tag-card"><h3>إضافة Campaign Tag</h3><div class="tag-help">اكتب اسم التاج ثم الكلمة أو جزء اسم الحملة المطابق لكل منصة. يمكن كتابة أكثر من قيمة مفصولة بفاصلة.</div><div class="tag-grid"><div class="tag-field full"><label>اسم التاج</label><input id="tagName" placeholder="مثال: National Day"></div>${order.map(p=>`<div class="tag-field"><label>${p}</label><input id="tag_${p}" placeholder="اسم أو جزء اسم الحملة"></div>`).join('')}</div><div class="tag-actions"><button id="saveTag" class="save-tag">حفظ التاج</button><button id="cancelTag">إلغاء</button></div></div>`;
  document.body.appendChild(modal);

  document.getElementById('campaignTag').addEventListener('change',e=>{
    selectedTag=e.target.value;
    const u=new URL(location.href);
    if(selectedTag==='all') u.searchParams.delete('campaign'); else u.searchParams.set('campaign',selectedTag);
    history.replaceState({},'',u);
    refreshTagControls();updatePeriodText();
    if(lastPayload) renderPayload(lastPayload); else loadAll();
  });
  document.getElementById('addCampaignTag').addEventListener('click',openTagModal);
  document.getElementById('deleteCampaignTag').addEventListener('click',deleteSelectedTag);
  document.getElementById('saveTag').addEventListener('click',createTagFromModal);
  document.getElementById('cancelTag').addEventListener('click',closeTagModal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeTagModal();});

  document.getElementById('applyDate').addEventListener('click',()=>{
    const start=document.getElementById('dateFrom').value;
    const end=document.getElementById('dateTo').value;
    if(!validDate(start)||!validDate(end)||start>end){
      const notice=document.getElementById('notice');notice.style.display='block';notice.textContent='اختار فترة صحيحة: تاريخ البداية لازم يكون قبل أو مساوي لتاريخ النهاية.';return;
    }
    selectedRange={start,end};
    const u=new URL(location.href);u.searchParams.set('from',start);u.searchParams.set('to',end);history.replaceState({},'',u);
    updatePeriodText();loadAll();
  });
  document.getElementById('resetDate').addEventListener('click',()=>{
    selectedRange={start:DEFAULT_START,end:localISODate()};
    document.getElementById('dateFrom').value=selectedRange.start;
    document.getElementById('dateTo').value=selectedRange.end;
    const u=new URL(location.href);u.searchParams.delete('from');u.searchParams.delete('to');history.replaceState({},'',u.pathname+u.search+u.hash);
    updatePeriodText();loadAll();
  });

  refreshTagControls();updatePeriodText();
}

function apiUrl(){
  return `/api/data?start_date=${encodeURIComponent(selectedRange.start)}&end_date=${encodeURIComponent(selectedRange.end)}`;
}

function renderPayload(p){
  const notice=document.getElementById('notice');
  notice.style.display='none';
  const good=[],bad=[],stale=[],legacy=[],missingCampaignField=[];

  for(const name of order){
    const s=p.sources?.[name];
    if(s?.queryScope==='legacy-query') legacy.push(name);
    if(s?.ok){
      try{
        const parsed=parse(name,s.data,selectedTag);
        good.push(parsed);
        if(!parsed.campaignField) missingCampaignField.push(name);
        if(s.stale) stale.push(name);
      }catch(e){bad.push([name,e.message]);}
    }else{
      bad.push([name,s?.error||'No data']);
    }
  }

  const spend=good.reduce((a,d)=>a+d.spend,0);
  const imp=good.reduce((a,d)=>a+d.ims,0);
  const clicks=good.reduce((a,d)=>a+d.acts,0);
  const reach=good.reduce((a,d)=>a+(Number.isFinite(d.reach)?d.reach:0),0);
  const cpm=imp?spend/imp*1000:NaN;
  const cpc=clicks?spend/clicks:NaN;
  const ctr=imp?clicks/imp*100:NaN;
  const campaignNames=new Set(good.flatMap(d=>d.campaigns.map(norm)).filter(Boolean));
  const campaignCount=campaignNames.size;
  const bestCpa=[...good].filter(d=>Number.isFinite(d.cpa)&&d.acts>0).sort((a,b)=>a.cpa-b.cpa)[0];
  const bestCtr=[...good].filter(d=>Number.isFinite(d.ctr)&&d.ims>0).sort((a,b)=>b.ctr-a.ctr)[0];

  document.getElementById('badgeSpend').textContent=bad.length?'PARTIAL':'LIVE';
  document.getElementById('kSpend').textContent='$'+f(spend,2);
  document.getElementById('kImp').textContent=f(imp);
  document.getElementById('kClicks').textContent=f(clicks);
  document.getElementById('kCpm').textContent=f(campaignCount);
  document.getElementById('kPlatforms').textContent=f(good.length);
  document.getElementById('kCpc').textContent='$'+f(cpc,3);
  document.getElementById('kReach').textContent=f(reach);
  document.getElementById('kUpdated').textContent=new Date(p.updatedAt||Date.now()).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'});

  document.getElementById('gauges').innerHTML=[
    insightCard('Blended CTR',`${f(ctr,2)}%`,'Clicks / Impressions','#078dcc'),
    insightCard('Blended CPM',`$${f(cpm,2)}`,`Benchmark: $${CPM_BENCHMARK.toFixed(2)}`,'#0f1728'),
    insightCard('أفضل Cost / Action',bestCpa?`$${f(bestCpa.cpa,2)}`:'—',bestCpa?bestCpa.platform:'No action data','#12b76a'),
    insightCard('أفضل CTR',bestCtr?`${f(bestCtr.ctr,2)}%`:'—',bestCtr?bestCtr.platform:'No impression data','#f59e0b')
  ].join('');

  document.getElementById('paidRows').innerHTML=good.map(paidRow).join('')+bad.map(([name,e])=>`<tr><td><b>${name}</b></td><td colspan="5" class="err">${e}</td></tr>`).join('');
  const max=Math.max(...good.map(d=>d.spend),1);
  document.getElementById('bars').innerHTML=[...good].sort((a,b)=>b.spend-a.spend).map(d=>bar(d,max)).join('');
  document.getElementById('rows').innerHTML=good.map(detailRow).join('')+bad.map(([name,e])=>`<tr><td><b>${name}</b></td><td colspan="6" class="err">${e}</td></tr>`).join('');

  const messages=[];
  if(bad.length) messages.push('مصادر غير متاحة أو بدون بيانات مطابقة: '+bad.map(x=>x[0]).join('، ')+'.');
  if(stale.length) messages.push(stale.join('، ')+' تعرض بيانات محفوظة وليست Live.');
  if(selectedTag==='all'&&missingCampaignField.length) messages.push('لا يمكن التحقق من أسماء كل الحملات في '+missingCampaignField.join('، ')+' لأن Saved Query لا يحتوي Campaign name.');
  if(selectedTag==='all'&&legacy.length) messages.push('هذه المنصات تستخدم Saved Query القديم: '+legacy.join('، ')+'.');

  if(selectedTag==='all'&&campaignCount>0){
    const names=[...campaignNames];
    const bmwLike=names.filter(x=>/\bbmw\b|car r|car raffle/.test(x));
    if(bmwLike.length===names.length) messages.push('تنبيه: أسماء الحملات المكتشفة حاليًا تبدو كلها مرتبطة بـ BMW؛ مصدر Supermetrics نفسه قد يكون ما زال مفلترًا على حملة السيارات.');
  }

  if(messages.length){notice.style.display='block';notice.textContent=messages.join(' ');}
}

async function loadAll(){
  const btn=document.getElementById('refresh');
  if(btn){btn.disabled=true;btn.textContent='جاري التحديث…';}
  const notice=document.getElementById('notice');notice.style.display='none';
  try{
    const r=await fetch(apiUrl());
    if(!r.ok) throw Error('HTTP '+r.status);
    lastPayload=await r.json();
    renderPayload(lastPayload);
  }catch(e){
    notice.style.display='block';
    notice.textContent='تعذر الاتصال ببيانات Supermetrics: '+e.message;
  }finally{
    if(btn){btn.disabled=false;btn.textContent='تحديث الآن';}
  }
}

installFilters();
loadAll();
setInterval(loadAll,1800000);
document.getElementById('refresh')?.addEventListener('click',loadAll);
