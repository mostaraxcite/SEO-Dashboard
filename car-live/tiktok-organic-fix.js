(()=>{
  const NF=new Intl.NumberFormat('en-US');
  const RATE=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const PCT=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  let applying=false;

  function parseNumber(text){
    const s=String(text??'').replace(/,/g,'').trim();
    if(!s||s==='—') return null;
    const m=s.match(/-?\d+(?:\.\d+)?/);
    if(!m) return null;
    const n=Number(m[0]);
    return Number.isFinite(n)?n:null;
  }

  function fmt(v){return Number.isFinite(v)?NF.format(Math.round(v)):'—';}
  function pct(v){return Number.isFinite(v)?`${PCT.format(v*100)}%`:'—';}
  function clamp(v){return Number.isFinite(v)?Math.max(0,v):null;}

  function remember(el){
    if(el&&!Object.prototype.hasOwnProperty.call(el.dataset,'organicAllText')){
      el.dataset.organicAllText=String(el.textContent||'').trim();
    }
  }

  function restore(body){
    body.querySelectorAll('[data-organic-all-text]').forEach(el=>{
      el.textContent=el.dataset.organicAllText;
    });
  }

  function metricCells(tr){
    const marker=tr.querySelector('.platform-name');
    const platformCell=marker?.closest('td');
    if(!platformCell) return null;
    let cell=platformCell.nextElementSibling;
    if(cell&&!cell.classList.contains('i-num')) cell=cell.nextElementSibling;
    const names=['views','reach','likes','comments','shares','saves','engagement'];
    const out={};
    for(const name of names){
      out[name]=cell||null;
      if(cell) remember(cell);
      cell=cell?.nextElementSibling||null;
    }
    return out;
  }

  function metricValue(cell){
    if(!cell) return null;
    remember(cell);
    return parseNumber(cell.dataset.organicAllText);
  }

  function paidByCreator(body){
    const map=new Map();
    const table=body.querySelector('#paidTikTokBlock .paid-tiktok-table');
    if(!table) return map;
    for(const tr of table.querySelectorAll('tbody tr')){
      const cells=[...tr.children];
      if(cells.length<9) continue;
      const name=String(cells[0].querySelector('b')?.textContent||cells[0].textContent||'').trim();
      if(!name) continue;
      const current=map.get(name)||{views:0,likes:0,comments:0,shares:0,engagement:0};
      current.views+=parseNumber(cells[4].textContent)||0;
      current.likes+=parseNumber(cells[5].textContent)||0;
      current.comments+=parseNumber(cells[6].textContent)||0;
      current.shares+=parseNumber(cells[7].textContent)||0;
      current.engagement+=parseNumber(cells[8].textContent)||0;
      map.set(name,current);
    }
    return map;
  }

  function applyOrganicRows(body){
    const paid=paidByCreator(body);
    const table=body.querySelector('.influencers-table');
    if(!table) return;

    let creator='';
    for(const tr of table.querySelectorAll('tbody tr')){
      const name=tr.querySelector('.influencer-name')?.textContent?.trim();
      if(name) creator=name;
      if(!creator||!tr.querySelector('.platform-name.tiktok')) continue;
      const p=paid.get(creator);
      if(!p) continue;

      const cells=metricCells(tr);
      if(!cells) continue;
      const all={
        views:metricValue(cells.views),reach:metricValue(cells.reach),likes:metricValue(cells.likes),comments:metricValue(cells.comments),
        shares:metricValue(cells.shares),saves:metricValue(cells.saves),engagement:metricValue(cells.engagement)
      };
      const organic={
        views:Number.isFinite(all.views)?clamp(all.views-p.views):null,
        reach:all.reach,
        likes:Number.isFinite(all.likes)?clamp(all.likes-p.likes):null,
        comments:Number.isFinite(all.comments)?clamp(all.comments-p.comments):null,
        shares:Number.isFinite(all.shares)?clamp(all.shares-p.shares):null,
        saves:all.saves,
        engagement:null
      };
      const parts=[organic.likes,organic.comments,organic.shares,organic.saves].filter(Number.isFinite);
      organic.engagement=parts.length?parts.reduce((a,b)=>a+b,0):(Number.isFinite(all.engagement)?clamp(all.engagement-p.engagement):null);

      for(const key of ['views','reach','likes','comments','shares','saves','engagement']){
        if(cells[key]) cells[key].textContent=fmt(organic[key]);
      }
    }
  }

  function zeroOrganicCosts(body){
    const table=body.querySelector('.influencers-table');
    if(!table) return;
    for(const tr of table.querySelectorAll('tbody tr')){
      const nameCell=tr.querySelector('.influencer-name')?.closest('td');
      if(!nameCell) continue;
      const rowspanNums=[...tr.querySelectorAll('td[rowspan].i-num')];
      if(rowspanNums.length<3) continue;
      const costCell=rowspanNums[0];
      const cpvCell=rowspanNums[rowspanNums.length-2];
      const cpeCell=rowspanNums[rowspanNums.length-1];
      remember(costCell);remember(cpvCell);remember(cpeCell);
      costCell.textContent='0 ر.س';
      cpvCell.textContent='—';
      cpeCell.textContent='—';
    }
  }

  function card(body,label){
    return [...body.querySelectorAll('.influencers-stat')].find(x=>String(x.querySelector('.i-label')?.textContent||'').trim()===label)||null;
  }

  function recomputeSummary(body){
    const table=body.querySelector('.influencers-table');
    if(!table) return;
    let views=0,reach=0,engagement=0,hasViews=false,hasReach=false,hasEngagement=false;
    for(const tr of table.querySelectorAll('tbody tr')){
      const cells=metricCells(tr);
      if(!cells) continue;
      const v=parseNumber(cells.views?.textContent),r=parseNumber(cells.reach?.textContent),e=parseNumber(cells.engagement?.textContent);
      if(Number.isFinite(v)){views+=v;hasViews=true;}
      if(Number.isFinite(r)){reach+=r;hasReach=true;}
      if(Number.isFinite(e)){engagement+=e;hasEngagement=true;}
    }

    const updates={
      'إجمالي التكلفة':'0 ر.س',
      'إجمالي المشاهدات':hasViews?fmt(views):'—',
      'إجمالي الوصول':hasReach?fmt(reach):'—',
      'إجمالي التفاعل':hasEngagement?fmt(engagement):'—',
      'معدل التفاعل':hasViews&&views>0&&hasEngagement?pct(engagement/views):'—',
      'CPV':'—',
      'CPE':'—'
    };
    for(const [label,text] of Object.entries(updates)){
      const value=card(body,label)?.querySelector('.i-value');
      if(value){remember(value);value.textContent=text;}
    }
  }

  function updateModeNote(body){
    const modes=body.querySelector('.influencers-performance-modes');
    if(!modes) return;
    const labels=[...modes.querySelectorAll('.mode-label')];
    if(labels.length>1) labels[1].textContent='Paid = TikTok Ads عبر Supermetrics · Organic = إجمالي TikTok العام − المدفوع · بدون إنفاق إعلاني';
  }

  function sync(){
    if(applying) return;
    const body=document.getElementById('influencersBody');
    if(!body||!body.querySelector('.influencers-performance-modes')) return;
    applying=true;
    try{
      updateModeNote(body);
      body.querySelectorAll('.influencers-table tbody tr').forEach(tr=>metricCells(tr));
      body.querySelectorAll('.influencers-stat .i-value, .influencers-table td[rowspan].i-num').forEach(remember);
      restore(body);
      const mode=body.querySelector('.influencers-mode.active')?.dataset.mode||'all';
      if(mode==='organic'){
        applyOrganicRows(body);
        zeroOrganicCosts(body);
        recomputeSummary(body);
      }
    }finally{applying=false;}
  }

  document.addEventListener('click',e=>{
    if(e.target?.closest?.('.influencers-mode')) setTimeout(sync,0);
  });
  const observer=new MutationObserver(mutations=>{
    const structural=mutations.some(m=>m.type==='attributes'||[...m.addedNodes,...m.removedNodes].some(n=>n.nodeType===1));
    if(structural) setTimeout(sync,0);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(sync,0),{once:true});
  else setTimeout(sync,0);
})();