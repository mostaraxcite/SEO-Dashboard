const order=['Meta','Snapchat','TikTok','Google','Pinterest','X'];
const CUR={Meta:'USD',Snapchat:'USD',TikTok:'SAR',Google:'USD',Pinterest:'USD',X:'USD'};
const CAMP={Meta:'CAR-R',Snapchat:'CAR-R(1)',TikTok:'bmw',Google:'Yt-BMW Car Raffle',Pinterest:'bmw-car-raffle',X:'X-Bmw-Car-2026'};
const ACTION={Meta:'Link clicks',Snapchat:'Swipes',TikTok:'Clicks',Google:'Clicks',Pinterest:'Pin clicks',X:'Link clicks'};
const COL={Meta:'#1877F2',Snapchat:'#f4d817',TikTok:'#111',Google:'#4285F4',Pinterest:'#E60023',X:'#000'};
const CPM_BENCHMARK=5.00;
const CAMPAIGN_START='2026-08-09';

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
  const c=[p?.data,p?.data?.data,p?.results,p?.result?.data,p];
  for(const x of c) if(Array.isArray(x)&&x.length&&Array.isArray(x[0])) return x;
  return null;
}

function parse(platform,p){
  const t=table(p);
  if(!t||t.length<2) throw Error('No data rows');
  const h=t[0].map(String),rs=t.slice(1);
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
    ['Clicks','Link clicks','Actions']
  );

  let spend=0,ims=0,reach=0,acts=0,hasR=false;
  const camps=new Set();
  for(const r of rs){
    if(ci>=0&&r[ci]) camps.add(String(r[ci]));
    const cur=cu>=0&&r[cu]?String(r[cu]).toUpperCase():CUR[platform];
    let u=ui>=0?n(r[ui]):NaN;
    const costLocal=co>=0?n(r[co]):NaN;
    const imv=im>=0?n(r[im]):NaN;
    const cpmLocal=cpmi>=0?n(r[cpmi]):NaN;
    if(!Number.isFinite(u)&&Number.isFinite(costLocal)) u=cur.includes('SAR')?costLocal/3.75:costLocal;
    if(!Number.isFinite(u)&&Number.isFinite(imv)&&Number.isFinite(cpmLocal)){
      const calc=imv*cpmLocal/1000;
      u=cur.includes('SAR')?calc/3.75:calc;
    }
    if(Number.isFinite(u)) spend+=u;
    if(Number.isFinite(imv)) ims+=imv;
    let v=re>=0?n(r[re]):NaN;
    if(Number.isFinite(v)&&v>0){reach+=v;hasR=true;}
    v=ac>=0?n(r[ac]):NaN;
    if(Number.isFinite(v)) acts+=v;
  }

  return {
    platform,
    campaign:platform==='Google'?CAMP.Google:([...camps].join(' + ')||CAMP[platform]),
    spend,
    ims,
    reach:hasR?reach:NaN,
    acts,
    action:ACTION[platform],
    ctr:ims?acts/ims*100:NaN,
    cpm:ims?spend/ims*1000:NaN,
    cpa:acts?spend/acts:NaN
  };
}

function gauge(label,value,sub,pct,color){
  pct=Math.max(0,Math.min(1,pct||0));
  const dash=(pct*251).toFixed(1);
  return `<div class="gauge"><div class="gname">${label}</div><svg class="gsvg" viewBox="0 0 200 120"><path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#e5eaf1" stroke-width="16" stroke-linecap="round"/><path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${dash} 251"/></svg><div class="gvalue num">${value}</div><div class="gsub">${sub}</div></div>`;
}

function cpmStatus(cpm){
  if(!Number.isFinite(cpm)) return `<span style="color:#667085">Global Home Improvement Benchmark $${CPM_BENCHMARK.toFixed(2)}</span>`;
  if(cpm<=CPM_BENCHMARK) return `<span style="color:#12b76a;font-weight:700">● Global Home Improvement Benchmark $${CPM_BENCHMARK.toFixed(2)} · ممتاز</span>`;
  return `<span style="color:#f59e0b;font-weight:700">● Global Home Improvement Benchmark $${CPM_BENCHMARK.toFixed(2)} · أعلى من البنشمارك</span>`;
}

function paidRow(d){
  return `<tr><td><div class="platform"><i class="pdot" style="background:${COL[d.platform]}"></i>${d.platform}</div></td><td class="n">$${f(d.spend,2)}</td><td class="n">${f(d.ims)}</td><td class="n">${f(d.acts)}</td><td class="n">${f(d.ctr,2)}%</td><td class="n">$${f(d.cpa,2)}</td></tr>`;
}

function detailRow(d){
  return `<tr><td><b>${d.platform}</b></td><td>${d.campaign}</td><td class="n">$${f(d.spend,2)}</td><td class="n">${f(d.spend*3.75,2)}</td><td class="n">${f(d.ims)}</td><td class="n">${f(d.reach)}</td><td>${d.action}</td><td class="n">${f(d.acts)}</td><td class="n">${f(d.ctr,3)}%</td><td class="n">$${f(d.cpm,3)}</td><td class="n">$${f(d.cpa,3)}</td></tr>`;
}

function bar(d,max){
  const pct=max?d.spend/max*100:0;
  return `<div class="bar"><div class="bar-top"><div class="bar-name"><i class="pdot" style="background:${COL[d.platform]}"></i>${d.platform}</div><div class="num">$${f(d.spend,2)}</div></div><div class="track"><div class="fill" style="width:${pct}%"></div></div></div>`;
}

function localISODate(date=new Date()){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(v);}

function arabicDate(v){
  if(!validDate(v)) return v;
  const [y,m,d]=v.split('-').map(Number);
  return new Date(y,m-1,d).toLocaleDateString('ar-SA',{day:'2-digit',month:'short',year:'numeric'});
}

let selectedRange={start:CAMPAIGN_START,end:localISODate()};
let customDateActive=false;

function updatePeriodText(){
  const period=document.querySelector('.period');
  if(!period) return;
  if(customDateActive){
    period.textContent=`الفترة: ${arabicDate(selectedRange.start)} — ${arabicDate(selectedRange.end)} · تحديث تلقائي كل 30 دقيقة`;
  }else{
    period.textContent='الفترة: 09 أغسطس 2026 — حتى اليوم · تحديث تلقائي كل 30 دقيقة';
  }
}

function installDateFilter(){
  const period=document.querySelector('.period');
  if(!period||document.getElementById('dateFilter')) return;

  const css=document.createElement('style');
  css.textContent=`
    .date-filter{width:100%;display:flex;justify-content:flex-start;align-items:flex-end;gap:8px;flex-wrap:wrap;direction:rtl;margin:0 0 14px 0}
    .date-filter .df-group{display:flex;flex-direction:column;gap:4px;text-align:right}
    .date-filter label{font-family:Tajawal,sans-serif;font-size:11px;color:#667085;font-weight:700}
    .date-filter input{height:36px;border:1px solid #d7dee8;border-radius:9px;background:#fff;padding:0 10px;font-family:JetBrains Mono,Tajawal,sans-serif;font-size:12px;color:#101828;outline:none;direction:ltr}
    .date-filter input:focus{border-color:#0794d2;box-shadow:0 0 0 3px rgba(7,148,210,.10)}
    .date-filter button{height:36px;border-radius:9px;padding:0 14px;border:1px solid #d7dee8;background:#fff;color:#344054;font-family:Tajawal,sans-serif;font-weight:700;cursor:pointer}
    .date-filter .df-apply{background:#078dcc;color:#fff;border-color:#078dcc}
    .date-filter .df-title{height:36px;display:flex;align-items:center;font-size:12px;font-weight:800;color:#0f1728;margin-left:4px}
    @media(max-width:700px){.date-filter{gap:6px}.date-filter .df-title{width:100%;height:auto}.date-filter input{max-width:145px}.date-filter button{padding:0 10px}}
  `;
  document.head.appendChild(css);

  const params=new URLSearchParams(location.search);
  const from=params.get('from');
  const to=params.get('to');
  if(validDate(from)&&validDate(to)&&from<=to){
    selectedRange={start:from,end:to};
    customDateActive=true;
  }

  const box=document.createElement('div');
  box.id='dateFilter';
  box.className='date-filter';
  box.innerHTML=`
    <div class="df-title">فلترة بالتاريخ</div>
    <div class="df-group"><label for="dateFrom">من</label><input id="dateFrom" type="date" min="${CAMPAIGN_START}" max="${localISODate()}" value="${selectedRange.start}"></div>
    <div class="df-group"><label for="dateTo">إلى</label><input id="dateTo" type="date" min="${CAMPAIGN_START}" max="${localISODate()}" value="${selectedRange.end}"></div>
    <button id="applyDate" class="df-apply" type="button">تطبيق</button>
    <button id="resetDate" type="button">حتى اليوم</button>
  `;

  const host=period.parentElement;
  host.insertBefore(box,host.firstChild);

  document.getElementById('applyDate').addEventListener('click',()=>{
    const start=document.getElementById('dateFrom').value;
    const end=document.getElementById('dateTo').value;
    if(!validDate(start)||!validDate(end)||start>end){
      const notice=document.getElementById('notice');
      notice.style.display='block';
      notice.textContent='اختار فترة صحيحة: تاريخ البداية لازم يكون قبل أو مساوي لتاريخ النهاية.';
      return;
    }
    selectedRange={start,end};
    customDateActive=true;
    const u=new URL(location.href);
    u.searchParams.set('from',start);
    u.searchParams.set('to',end);
    history.replaceState({},'',u);
    updatePeriodText();
    loadAll();
  });

  document.getElementById('resetDate').addEventListener('click',()=>{
    selectedRange={start:CAMPAIGN_START,end:localISODate()};
    customDateActive=false;
    document.getElementById('dateFrom').value=selectedRange.start;
    document.getElementById('dateTo').value=selectedRange.end;
    const u=new URL(location.href);
    u.searchParams.delete('from');
    u.searchParams.delete('to');
    history.replaceState({},'',u.pathname+u.search+u.hash);
    updatePeriodText();
    loadAll();
  });

  updatePeriodText();
}

function apiUrl(){
  if(!customDateActive) return '/api/data';
  return `/api/data?start_date=${encodeURIComponent(selectedRange.start)}&end_date=${encodeURIComponent(selectedRange.end)}`;
}

async function loadAll(){
  const btn=document.getElementById('refresh');
  if(btn){btn.disabled=true;btn.textContent='جاري التحديث…';}
  const notice=document.getElementById('notice');
  notice.style.display='none';

  try{
    const r=await fetch(apiUrl());
    if(!r.ok) throw Error('HTTP '+r.status);
    const p=await r.json();
    const good=[],bad=[],stale=[];

    for(const name of order){
      const s=p.sources?.[name];
      if(s?.ok){
        try{
          good.push(parse(name,s.data));
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

    document.getElementById('badgeSpend').textContent='$'+f(spend,2);
    document.getElementById('kSpend').textContent='$'+f(spend,2);
    document.getElementById('kImp').textContent=f(imp);
    document.getElementById('kClicks').textContent=f(clicks);
    document.getElementById('kCpm').textContent='$'+f(cpm,3);
    document.getElementById('kPlatforms').textContent=f(good.length);
    document.getElementById('kCpc').textContent='$'+f(cpc,3);
    document.getElementById('kReach').textContent=f(reach);

    const stamp=new Date(p.updatedAt||Date.now()).toLocaleString('ar-SA',{dateStyle:'medium',timeStyle:'short'});
    document.getElementById('kUpdated').textContent=stamp;

    document.getElementById('gauges').innerHTML=[
      gauge('إجمالي الإنفاق','$'+f(spend,0),'USD',spend/8000,'#078dcc'),
      gauge('مرات الظهور',f(imp),'Impressions',imp/16000000,'#12b76a'),
      gauge('النقرات / الإجراءات',f(clicks),'Actions',clicks/20000,'#f59e0b'),
      gauge('Blended CPM','$'+f(cpm,2),cpmStatus(cpm),(cpm||0)/2,'#0f1728')
    ].join('');

    document.getElementById('paidRows').innerHTML=good.map(paidRow).join('')+bad.map(([name,e])=>`<tr><td><b>${name}</b></td><td colspan="5" class="err">${e}</td></tr>`).join('');
    const max=Math.max(...good.map(d=>d.spend),1);
    document.getElementById('bars').innerHTML=[...good].sort((a,b)=>b.spend-a.spend).map(d=>bar(d,max)).join('');
    document.getElementById('rows').innerHTML=good.map(detailRow).join('')+bad.map(([name,e])=>`<tr><td><b>${name}</b></td><td colspan="10" class="err">${e}</td></tr>`).join('');

    const messages=[];
    if(bad.length) messages.push('تعذر تحديث '+bad.map(x=>x[0]).join('، ')+' لهذه الفترة. باقي المنصات تم تحديثها.');
    if(stale.length) messages.push(stale.join('، ')+' تعرض آخر بيانات محفوظة بسبب حد الاستعلام اليومي.');
    if(messages.length){notice.style.display='block';notice.textContent=messages.join(' ');}
  }catch(e){
    notice.style.display='block';
    notice.textContent='تعذر الاتصال ببيانات Supermetrics: '+e.message;
  }finally{
    if(btn){btn.disabled=false;btn.textContent='تحديث الآن';}
  }
}

installDateFilter();
loadAll();
setInterval(loadAll,1800000);
document.getElementById('refresh')?.addEventListener('click',loadAll);
