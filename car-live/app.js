const order=['Meta','Snapchat','TikTok','Google','Pinterest','X'];
const CUR={Meta:'USD',Snapchat:'USD',TikTok:'SAR',Google:'USD',Pinterest:'USD',X:'USD'};
const CAMP={Meta:'CAR-R',Snapchat:'CAR-R(1)',TikTok:'bmw',Google:'Yt-BMW Car Raffle',Pinterest:'bmw-car-raffle',X:'X-Bmw-Car-2026'};
const ACTION={Meta:'Link clicks',Snapchat:'Swipes',TikTok:'Clicks',Google:'Clicks',Pinterest:'Pin clicks',X:'Link clicks'};
const COL={Meta:'#1877F2',Snapchat:'#f4d817',TikTok:'#111',Google:'#4285F4',Pinterest:'#E60023',X:'#000'};
const CPM_BENCHMARK=5.00;
const CAMPAIGN_START='2020-01-01';
const TAG_STORAGE_KEY='jazeeraCampaignTagsV1';

const CAMPAIGN_TAGS={
  all:{label:'كل الحملات',patterns:{},system:true},
  bmw:{label:'BMW',patterns:{Meta:['car-r'],Snapchat:['car-r'],TikTok:['bmw'],Google:['bmw'],Pinterest:['bmw'],X:['bmw']},system:true},
  sealtec:{label:'Sealtec',patterns:{Meta:['sealtec'],Snapchat:['sealtec'],TikTok:['sealtec'],Google:['sealtec'],Pinterest:['sealtec'],X:['sealtec']},system:true}
};

function loadCustomTags(){try{const saved=JSON.parse(localStorage.getItem(TAG_STORAGE_KEY)||'{}');for(const [key,cfg] of Object.entries(saved)){if(cfg?.label&&cfg?.patterns)CAMPAIGN_TAGS[key]={label:String(cfg.label),patterns:cfg.patterns,system:false}}}catch(_){}}
function saveCustomTags(){const out={};for(const [key,cfg] of Object.entries(CAMPAIGN_TAGS))if(!cfg.system)out[key]={label:cfg.label,patterns:cfg.patterns};localStorage.setItem(TAG_STORAGE_KEY,JSON.stringify(out))}
loadCustomTags();

const f=(x,d=0)=>Number.isFinite(x)?x.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const n=v=>{if(v===null||v===undefined||v==='')return NaN;const x=Number(String(v).replace(/[$,%\s,]/g,''));return Number.isFinite(x)?x:NaN};
const norm=s=>String(s??'').toLowerCase().replace(/[_-]/g,' ').replace(/\s+/g,' ').trim();
function ix(h,a){const z=h.map(norm);for(const q of a){const i=z.indexOf(norm(q));if(i>=0)return i}for(const q of a){const i=z.findIndex(v=>v.includes(norm(q)));if(i>=0)return i}return-1}
function table(p){for(const x of [p?.data,p?.data?.data,p?.results,p?.result?.data,p])if(Array.isArray(x)&&x.length&&Array.isArray(x[0]))return x;return null}
function campaignMatches(platform,name,tag){if(tag==='all')return true;const cfg=CAMPAIGN_TAGS[tag];if(!cfg)return true;const patterns=cfg.patterns?.[platform]||[];const value=norm(name);return patterns.some(p=>value.includes(norm(p)))}
function campaignFallback(platform,tag){if(tag==='bmw')return CAMP[platform];if(tag==='sealtec')return 'sealtec-jazeera-launch';return CAMPAIGN_TAGS[tag]?.label||CAMP[platform]}

function localISODate(date=new Date()){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return`${y}-${m}-${d}`}
function validDate(v){return/^\d{4}-\d{2}-\d{2}$/.test(v)}
function arabicDate(v){if(!validDate(v))return v;const[y,m,d]=v.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('ar-SA',{day:'2-digit',month:'short',year:'numeric'})}

let selectedRange={start:CAMPAIGN_START,end:localISODate()};
let customDateActive=true;
let selectedTag='bmw';
let lastPayload=null;

function parse(platform,p,tag=selectedTag){
  const t=table(p);if(!t||t.length<2)throw Error('No data rows');
  const h=t[0].map(String);let rs=t.slice(1);
  const ci=ix(h,['Campaign name','Campaign']),ui=ix(h,['Cost (USD)','Spend (USD)']),co=ix(h,['Cost','Spend','Amount spent']),cu=ix(h,['Currency','Advertiser currency','Account currency','Campaign currency']),im=ix(h,['Impressions','Impressions paid','Paid impressions']),re=ix(h,['Reach','Unique users','Total reach']),cpmi=ix(h,['CPM','eCPM','CPM (cost per 1000 impressions)']);
  const ac=ix(h,platform==='Snapchat'?['Swipes','Clicks']:platform==='Pinterest'?['Pin clicks','Clicks','Clicks paid','Outbound clicks']:platform==='X'?['Link clicks','Clicks']:platform==='Meta'?['Link clicks','Clicks (all)','Clicks','Actions']:['Clicks','Link clicks','Actions']);
  if(tag!=='all'){
    if(ci>=0){rs=rs.filter(r=>campaignMatches(platform,r[ci],tag));if(!rs.length)throw Error(`لا توجد بيانات لحملة ${CAMPAIGN_TAGS[tag]?.label||tag}`)}
    else if(tag!=='bmw')throw Error('أضف Campaign name إلى Saved Query في Supermetrics');
  }
  let spend=0,ims=0,reach=0,acts=0,hasR=false;const camps=new Set();
  for(const r of rs){
    if(ci>=0&&r[ci])camps.add(String(r[ci]));
    const cur=cu>=0&&r[cu]?String(r[cu]).toUpperCase():CUR[platform];let u=ui>=0?n(r[ui]):NaN;const costLocal=co>=0?n(r[co]):NaN,imv=im>=0?n(r[im]):NaN,cpmLocal=cpmi>=0?n(r[cpmi]):NaN;
    if(!Number.isFinite(u)&&Number.isFinite(costLocal))u=cur.includes('SAR')?costLocal/3.75:costLocal;
    if(!Number.isFinite(u)&&Number.isFinite(imv)&&Number.isFinite(cpmLocal)){const calc=imv*cpmLocal/1000;u=cur.includes('SAR')?calc/3.75:calc}
    if(Number.isFinite(u))spend+=u;if(Number.isFinite(imv))ims+=imv;let v=re>=0?n(r[re]):NaN;if(Number.isFinite(v)&&v>0){reach+=v;hasR=true}v=ac>=0?n(r[ac]):NaN;if(Number.isFinite(v))acts+=v;
  }
  return{platform,campaign:[...camps].join(' + ')||campaignFallback(platform,tag),spend,ims,reach:hasR?reach:NaN,acts,action:ACTION[platform],ctr:ims?acts/ims*100:NaN,cpm:ims?spend/ims*1000:NaN,cpa:acts?spend/acts:NaN};
}

function gauge(label,value,sub,pct,color){pct=Math.max(0,Math.min(1,pct||0));const dash=(pct*251).toFixed(1);return`<div class="gauge"><div class="gname">${label}</div><svg class="gsvg" viewBox="0 0 200 120"><path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#e5eaf1" stroke-width="16" stroke-linecap="round"/><path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${dash} 251"/></svg><div class="gvalue num">${value}</div><div class="gsub">${sub}</div></div>`}
function cpmStatus(cpm){if(!Number.isFinite(cpm))return`<span style="color:#667085">Global Home Improvement Benchmark $${CPM_BENCHMARK.toFixed(2)}</span>`;if(cpm<=CPM_BENCHMARK)return`<span style="color:#12b76a;font-weight:700">● Global Home Improvement Benchmark $${CPM_BENCHMARK.toFixed(2)} · ممتاز</span>`;return`<span style="color:#f59e0b;font-weight:700">● Global Home Improvement Benchmark $${CPM_BENCHMARK.toFixed(2)} · أعلى من البنشمارك</span>`}
function paidRow(d){return`<tr><td><div class="platform"><i class="pdot" style="background:${COL[d.platform]}"></i>${d.platform}</div></td><td class="n">$${f(d.spend,2)}</td><td class="n">${f(d.ims)}</td><td class="n">${f(d.acts)}</td><td class="n">${f(d.ctr,2)}%</td><td class="n">$${f(d.cpa,2)}</td></tr>`}
function detailRow(d){return`<tr><td><b>${d.platform}</b></td><td>${d.campaign}</td><td class="n">$${f(d.spend,2)}</td><td class="n">${f(d.spend*3.75,2)}</td><td class="n">${f(d.ims)}</td><td class="n">${f(d.reach)}</td><td>${d.action}</td><td class="n">${f(d.acts)}</td><td class="n">${f(d.ctr,3)}%</td><td class="n">$${f(d.cpm,3)}</td><td class="n">$${f(d.cpa,3)}</td></tr>`}
function bar(d,max){const pct=max?d.spend/max*100:0;return`<div class="bar"><div class="bar-top"><div class="bar-name"><i class="pdot" style="background:${COL[d.platform]}"></i>${d.platform}</div><div class="num">$${f(d.spend,2)}</div></div><div class="track"><div class="fill" style="width:${pct}%"></div></div></div>`}

function updatePeriodText(){const period=document.querySelector('.period');if(!period)return;const range=`${arabicDate(selectedRange.start)} — ${arabicDate(selectedRange.end)}`;period.textContent=`الفترة: ${range} · الحملة: ${CAMPAIGN_TAGS[selectedTag]?.label||selectedTag} · تحديث تلقائي كل 30 دقيقة`}
function tagOptions(){return Object.entries(CAMPAIGN_TAGS).map(([key,c])=>`<option value="${key}" ${key===selectedTag?'selected':''}>${c.label}</option>`).join('')}
function refreshTagControls(){const select=document.getElementById('campaignTag');if(select){select.innerHTML=tagOptions();select.value=selectedTag}const del=document.getElementById('deleteCampaignTag');if(del)del.style.display=CAMPAIGN_TAGS[selectedTag]?.system===false?'inline-flex':'none'}
function splitPatterns(value,fallback){const a=String(value||'').split(',').map(v=>v.trim()).filter(Boolean);return a.length?a:[fallback]}
function openTagModal(){const modal=document.getElementById('tagModal');if(modal)modal.style.display='flex'}
function closeTagModal(){const modal=document.getElementById('tagModal');if(modal)modal.style.display='none'}
function createTagFromModal(){const label=document.getElementById('tagName').value.trim();if(!label){alert('اكتب اسم التاج');return}const key='custom_'+Date.now(),patterns={};for(const p of order)patterns[p]=splitPatterns(document.getElementById('tag_'+p).value,label);CAMPAIGN_TAGS[key]={label,patterns,system:false};saveCustomTags();selectedTag=key;refreshTagControls();const u=new URL(location.href);u.searchParams.set('campaign',key);history.replaceState({},'',u);updatePeriodText();closeTagModal();document.querySelectorAll('#tagModal input').forEach(i=>i.value='');if(lastPayload)renderPayload(lastPayload)}
function deleteSelectedTag(){const cfg=CAMPAIGN_TAGS[selectedTag];if(!cfg||cfg.system!==false)return;if(!confirm(`حذف تاج ${cfg.label}؟`))return;delete CAMPAIGN_TAGS[selectedTag];saveCustomTags();selectedTag='bmw';refreshTagControls();const u=new URL(location.href);u.searchParams.delete('campaign');history.replaceState({},'',u);updatePeriodText();if(lastPayload)renderPayload(lastPayload)}

function installFilters(){
  const period=document.querySelector('.period');if(!period||document.getElementById('dateFilter'))return;
  const css=document.createElement('style');css.textContent=`
    .date-filter{width:100%;display:flex;justify-content:flex-start;align-items:flex-end;gap:8px;flex-wrap:wrap;direction:rtl;margin:0 0 14px 0}.date-filter .df-group{display:flex;flex-direction:column;gap:4px;text-align:right}.date-filter label{font-family:Tajawal,sans-serif;font-size:11px;color:#667085;font-weight:700}.date-filter input,.date-filter select{height:36px;border:1px solid #d7dee8;border-radius:9px;background:#fff;padding:0 10px;font-family:Tajawal,Arial,sans-serif;font-size:12px;color:#101828;outline:none}.date-filter input{font-family:JetBrains Mono,Tajawal,sans-serif;direction:ltr}.date-filter select{min-width:150px;font-weight:700;cursor:pointer}.date-filter input:focus,.date-filter select:focus{border-color:#0794d2;box-shadow:0 0 0 3px rgba(7,148,210,.10)}.date-filter button{height:36px;border-radius:9px;padding:0 14px;border:1px solid #d7dee8;background:#fff;color:#344054;font-family:Tajawal,sans-serif;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}.date-filter .df-apply{background:#078dcc;color:#fff;border-color:#078dcc}.date-filter .df-add{background:#101828;color:#fff;border-color:#101828}.date-filter .df-delete{color:#b42318;border-color:#f3c4c4;background:#fff}.date-filter .df-title{height:36px;display:flex;align-items:center;font-size:12px;font-weight:800;color:#0f1728;margin-left:4px}
    .tag-modal{position:fixed;inset:0;z-index:100000;background:rgba(16,24,40,.55);display:none;align-items:center;justify-content:center;padding:18px}.tag-card{width:min(720px,96vw);max-height:90vh;overflow:auto;background:#fff;border-radius:18px;padding:22px;box-shadow:0 24px 70px rgba(16,24,40,.25);direction:rtl}.tag-card h3{font-size:20px;margin-bottom:5px}.tag-help{font-size:12px;color:#667085;margin-bottom:16px;line-height:1.7}.tag-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.tag-field{display:flex;flex-direction:column;gap:5px}.tag-field.full{grid-column:1/-1}.tag-field label{font-size:12px;font-weight:700;color:#344054}.tag-field input{height:39px;border:1px solid #d7dee8;border-radius:9px;padding:0 10px;font-family:Tajawal,Arial,sans-serif;outline:none}.tag-field input:focus{border-color:#078dcc;box-shadow:0 0 0 3px rgba(7,141,204,.10)}.tag-actions{display:flex;gap:8px;justify-content:flex-start;margin-top:18px}.tag-actions button{height:38px;border-radius:9px;padding:0 16px;border:1px solid #d7dee8;background:#fff;font-family:Tajawal,sans-serif;font-weight:800;cursor:pointer}.tag-actions .save-tag{background:#078dcc;border-color:#078dcc;color:#fff}
    @media(max-width:700px){.date-filter{gap:6px}.date-filter .df-title{width:100%;height:auto}.date-filter input{max-width:145px}.date-filter select{min-width:130px}.date-filter button{padding:0 10px}.tag-grid{grid-template-columns:1fr}}
  `;document.head.appendChild(css);
  const params=new URLSearchParams(location.search),from=params.get('from'),to=params.get('to'),campaign=params.get('campaign');
  if(validDate(from)&&validDate(to)&&from<=to){selectedRange={start:from,end:to}}if(campaign&&CAMPAIGN_TAGS[campaign])selectedTag=campaign;
  const box=document.createElement('div');box.id='dateFilter';box.className='date-filter';box.innerHTML=`
    <div class="df-title">فلاتر التقرير</div>
    <div class="df-group"><label for="campaignTag">Campaign Tag</label><select id="campaignTag">${tagOptions()}</select></div>
    <button id="addCampaignTag" class="df-add" type="button">+ إضافة تاج</button><button id="deleteCampaignTag" class="df-delete" type="button" style="display:none">حذف التاج</button>
    <div class="df-group"><label for="dateFrom">من</label><input id="dateFrom" type="date" min="${CAMPAIGN_START}" max="${localISODate()}" value="${selectedRange.start}"></div>
    <div class="df-group"><label for="dateTo">إلى</label><input id="dateTo" type="date" min="${CAMPAIGN_START}" max="${localISODate()}" value="${selectedRange.end}"></div>
    <button id="applyDate" class="df-apply" type="button">تطبيق التاريخ</button><button id="resetDate" type="button">من 2020 حتى اليوم</button>`;
  period.parentElement.insertBefore(box,period.parentElement.firstChild);
  const modal=document.createElement('div');modal.id='tagModal';modal.className='tag-modal';modal.innerHTML=`<div class="tag-card"><h3>إضافة Campaign Tag</h3><div class="tag-help">اكتب اسم التاج، ثم الكلمة أو جزء اسم الحملة المطابق لكل منصة. يمكن كتابة أكثر من قيمة مفصولة بفاصلة.</div><div class="tag-grid"><div class="tag-field full"><label>اسم التاج</label><input id="tagName" placeholder="مثال: National Day"></div>${order.map(p=>`<div class="tag-field"><label>${p}</label><input id="tag_${p}" placeholder="اسم أو جزء اسم الحملة"></div>`).join('')}</div><div class="tag-actions"><button id="saveTag" class="save-tag">حفظ التاج</button><button id="cancelTag">إلغاء</button></div></div>`;document.body.appendChild(modal);
  document.getElementById('campaignTag').addEventListener('change',e=>{selectedTag=e.target.value;const u=new URL(location.href);if(selectedTag==='bmw')u.searchParams.delete('campaign');else u.searchParams.set('campaign',selectedTag);history.replaceState({},'',u);refreshTagControls();updatePeriodText();if(lastPayload)renderPayload(lastPayload);else loadAll()});
  document.getElementById('addCampaignTag').addEventListener('click',openTagModal);document.getElementById('deleteCampaignTag').addEventListener('click',deleteSelectedTag);document.getElementById('saveTag').addEventListener('click',createTagFromModal);document.getElementById('cancelTag').addEventListener('click',closeTagModal);modal.addEventListener('click',e=>{if(e.target===modal)closeTagModal()});
  document.getElementById('applyDate').addEventListener('click',()=>{const start=document.getElementById('dateFrom').value,end=document.getElementById('dateTo').value;if(!validDate(start)||!validDate(end)||start>end){const notice=document.getElementById('notice');notice.style.display='block';notice.textContent='اختار فترة صحيحة: تاريخ البداية لازم يكون قبل أو مساوي لتاريخ النهاية.';return}selectedRange={start,end};customDateActive=true;const u=new URL(location.href);u.searchParams.set('from',start);u.searchParams.set('to',end);history.replaceState({},'',u);updatePeriodText();loadAll()});
  document.getElementById('resetDate').addEventListener('click',()=>{selectedRange={start:CAMPAIGN_START,end:localISODate()};customDateActive=true;document.getElementById('dateFrom').value=selectedRange.start;document.getElementById('dateTo').value=selectedRange.end;const u=new URL(location.href);u.searchParams.delete('from');u.searchParams.delete('to');history.replaceState({},'',u.pathname+u.search+u.hash);updatePeriodText();loadAll()});
  refreshTagControls();updatePeriodText();
}

function apiUrl(){return`/api/data?start_date=${encodeURIComponent(selectedRange.start)}&end_date=${encodeURIComponent(selectedRange.end)}`}
function renderPayload(p){
  const notice=document.getElementById('notice');notice.style.display='none';const good=[],bad=[],stale=[];
  for(const name of order){const s=p.sources?.[name];if(s?.ok){try{good.push(parse(name,s.data,selectedTag));if(s.stale)stale.push(name)}catch(e){bad.push([name,e.message])}}else bad.push([name,s?.error||'No data'])}
  const spend=good.reduce((a,d)=>a+d.spend,0),imp=good.reduce((a,d)=>a+d.ims,0),clicks=good.reduce((a,d)=>a+d.acts,0),reach=good.reduce((a,d)=>a+(Number.isFinite(d.reach)?d.reach:0),0),cpm=imp?spend/imp*1000:NaN,cpc=clicks?spend/clicks:NaN;
  document.getElementById('badgeSpend').textContent='$'+f(spend,2);document.getElementById('kSpend').textContent='$'+f(spend,2);document.getElementById('kImp').textContent=f(imp);document.getElementById('kClicks').textContent=f(clicks);document.getElementById('kCpm').textContent='$'+f(cpm,3);document.getElementById('kPlatforms').textContent=f(good.length);document.getElementById('kCpc').textContent='$'+f(cpc,3);document.getElementById('kReach').textContent=f(reach);document.getElementById('kUpdated').textContent=new Date(p.updatedAt||Date.now()).toLocaleString('ar-SA',{dateStyle:'medium',timeStyle:'short'});
  document.getElementById('gauges').innerHTML=[gauge('إجمالي الإنفاق','$'+f(spend,0),'USD',spend/8000,'#078dcc'),gauge('مرات الظهور',f(imp),'Impressions',imp/16000000,'#12b76a'),gauge('النقرات / الإجراءات',f(clicks),'Actions',clicks/20000,'#f59e0b'),gauge('Blended CPM','$'+f(cpm,2),cpmStatus(cpm),(cpm||0)/2,'#0f1728')].join('');
  document.getElementById('paidRows').innerHTML=good.map(paidRow).join('')+bad.map(([name,e])=>`<tr><td><b>${name}</b></td><td colspan="5" class="err">${e}</td></tr>`).join('');const max=Math.max(...good.map(d=>d.spend),1);document.getElementById('bars').innerHTML=[...good].sort((a,b)=>b.spend-a.spend).map(d=>bar(d,max)).join('');document.getElementById('rows').innerHTML=good.map(detailRow).join('')+bad.map(([name,e])=>`<tr><td><b>${name}</b></td><td colspan="10" class="err">${e}</td></tr>`).join('');
  const messages=[];if(bad.length)messages.push('بعض المنصات لا تحتوي بيانات مطابقة لـ '+(CAMPAIGN_TAGS[selectedTag]?.label||selectedTag)+': '+bad.map(x=>x[0]).join('، ')+'.');if(stale.length)messages.push(stale.join('، ')+' تعرض آخر بيانات محفوظة بسبب حد الاستعلام اليومي.');if(messages.length){notice.style.display='block';notice.textContent=messages.join(' ')}
}
async function loadAll(){const btn=document.getElementById('refresh');if(btn){btn.disabled=true;btn.textContent='جاري التحديث…'}const notice=document.getElementById('notice');notice.style.display='none';try{const r=await fetch(apiUrl());if(!r.ok)throw Error('HTTP '+r.status);lastPayload=await r.json();renderPayload(lastPayload)}catch(e){notice.style.display='block';notice.textContent='تعذر الاتصال ببيانات Supermetrics: '+e.message}finally{if(btn){btn.disabled=false;btn.textContent='تحديث الآن'}}}

installFilters();loadAll();setInterval(loadAll,1800000);document.getElementById('refresh')?.addEventListener('click',loadAll);
