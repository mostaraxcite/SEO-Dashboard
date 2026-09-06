(()=>{
  const CAMPAIGNS={
    bmw:{label:'BMW',start:'2026-08-09',end:'2026-10-08'}
  };
  const DAY=86400000;

  function dateOnly(value){
    const [y,m,d]=String(value).split('-').map(Number);
    return new Date(y,m-1,d);
  }

  function dayDiff(a,b){
    const ua=Date.UTC(a.getFullYear(),a.getMonth(),a.getDate());
    const ub=Date.UTC(b.getFullYear(),b.getMonth(),b.getDate());
    return Math.round((ub-ua)/DAY);
  }

  function today(){
    const d=new Date();
    return new Date(d.getFullYear(),d.getMonth(),d.getDate());
  }

  function formatDate(d){
    return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(d);
  }

  function campaignKey(){
    return (new URLSearchParams(location.search).get('campaign')||'').trim().toLowerCase();
  }

  function injectCss(){
    if(document.getElementById('campaignTimelineCss')) return;
    const style=document.createElement('style');
    style.id='campaignTimelineCss';
    style.textContent=`
      .campaign-timeline{margin:18px 0 20px;background:#fff;border:1px solid #d8dee8;border-radius:22px;padding:16px 22px;box-shadow:0 1px 2px rgba(16,24,40,.03)}
      .campaign-timeline-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
      .campaign-timeline-stats{display:flex;align-items:center;gap:12px;flex-wrap:wrap;color:#667085;font-size:14px}
      .campaign-timeline-stats strong{font-size:17px;color:#111827;font-weight:900}
      .campaign-timeline-range{display:flex;align-items:center;gap:10px;color:#667085;font:700 15px/1.4 JetBrains Mono,Tajawal,sans-serif;direction:ltr}
      .campaign-timeline-icon{font-size:25px;line-height:1;color:#078dcc;font-family:Tajawal,sans-serif}
      .campaign-progress-track{height:11px;background:#edf1f5;border-radius:999px;overflow:hidden;margin-top:14px;direction:ltr}
      .campaign-progress-fill{height:100%;background:#078dcc;border-radius:999px;transition:width .35s ease}
      @media(max-width:760px){
        .campaign-timeline{padding:14px 16px;border-radius:18px}
        .campaign-timeline-head{align-items:flex-start}
        .campaign-timeline-stats strong{font-size:15px}
        .campaign-timeline-range{font-size:13px}
      }
    `;
    document.head.appendChild(style);
  }

  function stats(config){
    const start=dateOnly(config.start);
    const end=dateOnly(config.end);
    const now=today();
    const totalInclusive=dayDiff(start,end)+1;
    const duration=Math.max(dayDiff(start,end),1);

    if(now<start){
      return {start,end,total:totalInclusive,elapsed:0,remaining:totalInclusive,pct:0,status:'upcoming'};
    }
    if(now>end){
      return {start,end,total:totalInclusive,elapsed:totalInclusive,remaining:0,pct:100,status:'complete'};
    }

    const elapsed=Math.max(0,dayDiff(start,now));
    const remaining=Math.max(0,totalInclusive-elapsed);
    const pct=Math.max(0,Math.min(100,Math.round((elapsed/duration)*100)));
    return {start,end,total:totalInclusive,elapsed,remaining,pct,status:'active'};
  }

  function root(){
    let el=document.getElementById('campaignTimeline');
    if(el) return el;
    injectCss();
    el=document.createElement('section');
    el.id='campaignTimeline';
    el.className='campaign-timeline';
    const notice=document.getElementById('notice');
    if(notice?.parentElement) notice.parentElement.insertBefore(el,notice);
    else document.querySelector('.wrap')?.appendChild(el);
    return el;
  }

  function render(){
    const key=campaignKey();
    const config=CAMPAIGNS[key];
    const existing=document.getElementById('campaignTimeline');
    if(!config){
      existing?.remove();
      return;
    }

    const s=stats(config);
    const el=root();
    const message=s.status==='complete'
      ? '<strong>انتهت الحملة</strong>'
      : s.status==='upcoming'
        ? `<strong>متبقي ${s.remaining} يوم على بداية الحملة</strong>`
        : `<strong>مضى ${s.elapsed} يوم · متبقي ${s.remaining} يوم</strong>`;

    el.innerHTML=`
      <div class="campaign-timeline-head">
        <div class="campaign-timeline-stats">
          <span>${s.pct}% · ${s.total} يوم</span>
          ${message}
        </div>
        <div class="campaign-timeline-range">
          <span>${formatDate(s.start)} → ${formatDate(s.end)}</span>
          <span class="campaign-timeline-icon" aria-hidden="true">◷</span>
        </div>
      </div>
      <div class="campaign-progress-track" aria-label="نسبة تقدم حملة BMW">
        <div class="campaign-progress-fill" style="width:${s.pct}%"></div>
      </div>`;
  }

  function boot(){
    render();
    let last=location.href;
    const check=()=>{
      if(location.href!==last){last=location.href;render();}
    };
    const push=history.pushState;
    const replace=history.replaceState;
    history.pushState=function(){push.apply(this,arguments);check();};
    history.replaceState=function(){replace.apply(this,arguments);check();};
    addEventListener('popstate',()=>{last=location.href;render();});
    document.addEventListener('change',()=>setTimeout(check,0));
    new MutationObserver(check).observe(document.body,{subtree:true,childList:true,attributes:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
