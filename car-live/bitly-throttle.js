(()=>{
  const nativeFetch=window.fetch.bind(window);
  const TTL_MS=4.8*60*60*1000; // 4h 48m = max 5 upstream refreshes/day
  const CACHE_PREFIX='jp_bitly_cache_v1:';
  let lastMeta=null;

  function normalizedUrl(input){
    try{
      const raw=typeof input==='string'?input:(input&&typeof input.url==='string'?input.url:'');
      return new URL(raw,location.origin);
    }catch(_){return null;}
  }

  function cacheKey(url){
    const u=new URL(url.href);
    u.searchParams.sort();
    return CACHE_PREFIX+u.searchParams.toString();
  }

  function readEntry(key){
    try{
      const entry=JSON.parse(localStorage.getItem(key)||'null');
      if(!entry||!entry.savedAt||!entry.data?.ok) return null;
      return entry;
    }catch(_){return null;}
  }

  function isFresh(entry){
    return !!entry&&Date.now()-Number(entry.savedAt)<TTL_MS;
  }

  function writeCache(key,data){
    const savedAt=Date.now();
    try{localStorage.setItem(key,JSON.stringify({savedAt,data}));}catch(_){}
    setMeta(data,savedAt,'live');
  }

  function responseFromEntry(entry,source='browser-cache',stale=false){
    const data={...entry.data,_bitlyCache:{source,stale,lastSuccessfulAt:entry.data?.updatedAt||new Date(Number(entry.savedAt)).toISOString()}};
    setMeta(data,entry.savedAt,source,stale);
    return new Response(JSON.stringify(data),{
      status:200,
      headers:{'Content-Type':'application/json','X-Bitly-Cache':source,'X-Bitly-Stale':stale?'1':'0'}
    });
  }

  function setMeta(data,savedAt,source,stale=false){
    const at=data?.updatedAt||data?._bitlyCache?.lastSuccessfulAt||(savedAt?new Date(Number(savedAt)).toISOString():null);
    lastMeta={at,source,stale:!!stale};
    window.__bitlyLastUpdate=lastMeta;
    queueMicrotask(renderFreshness);
  }

  window.fetch=async(input,init)=>{
    const u=normalizedUrl(input);
    if(!u||u.origin!==location.origin||u.pathname!=='/api/bitly') return nativeFetch(input,init);

    const key=cacheKey(u);
    const entry=readEntry(key);
    if(isFresh(entry)) return responseFromEntry(entry,'browser-cache',false);

    // Try the long-lived Vercel cache only when the 4h48m browser window expires.
    u.pathname='/api/bitly-cached';
    const nextInit={...(init||{}),cache:'default'};
    let response;
    try{
      response=await nativeFetch(u.pathname+u.search,nextInit);
    }catch(error){
      // Network/provider failure: never throw away the last successful Bitly snapshot.
      if(entry) return responseFromEntry(entry,'last-known-good',true);
      throw error;
    }

    if(response.ok){
      try{
        const data=await response.clone().json();
        if(data?.ok){
          writeCache(key,data);
          return response;
        }
      }catch(_){}
    }

    // Bitly quota/429/5xx/etc: show the last successful snapshot indefinitely.
    if(entry) return responseFromEntry(entry,'last-known-good',true);
    return response;
  };

  function formatRiyadh(value){
    if(!value) return 'لا يوجد تحديث ناجح محفوظ بعد';
    const d=new Date(value);
    if(Number.isNaN(d.getTime())) return String(value);
    try{
      return new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Riyadh'}).format(d);
    }catch(_){return d.toLocaleString('ar-SA');}
  }

  function ensureFreshnessNode(){
    const panel=document.getElementById('bitlyPanel');
    if(!panel) return null;
    let node=document.getElementById('bitlyFreshness');
    if(node) return node;
    node=document.createElement('div');
    node.id='bitlyFreshness';
    node.style.cssText='margin-top:8px;font-size:11px;font-weight:700;color:#667085;display:flex;gap:6px;align-items:center;flex-wrap:wrap';
    const head=panel.querySelector('.bitly-head');
    if(head) head.insertAdjacentElement('afterend',node);
    else panel.prepend(node);
    return node;
  }

  function renderFreshness(){
    const note=document.getElementById('bitlyNote');
    if(note){
      const text=String(note.textContent||'');
      const base=text.replace('تحديث كل 5 دقائق','تحديث Bitly بحد أقصى 5 مرات يوميًا');
      if(base!==text) note.textContent=base;
    }

    const node=ensureFreshnessNode();
    if(!node) return;
    const meta=window.__bitlyLastUpdate||lastMeta;
    const stamp=formatRiyadh(meta?.at);
    const stale=meta?.stale;
    const desired=meta?.at
      ? `آخر تحديث ناجح لبيانات الروابط: ${stamp}${stale?' · يتم عرض آخر نسخة محفوظة لأن Bitly غير متاح حاليًا':''}`
      : 'آخر تحديث ناجح لبيانات الروابط: لا توجد نسخة ناجحة محفوظة في هذا المتصفح بعد';
    if(node.textContent!==desired) node.textContent=desired;
    node.style.color=stale?'#b54708':'#667085';
  }

  const observer=new MutationObserver(()=>renderFreshness());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',renderFreshness,{once:true});
  else renderFreshness();
})();
