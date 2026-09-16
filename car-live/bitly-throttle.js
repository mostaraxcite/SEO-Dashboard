(()=>{
  const nativeFetch=window.fetch.bind(window);
  const TTL_MS=4.8*60*60*1000; // 4h 48m = 5 refreshes/day
  const CACHE_PREFIX='jp_bitly_cache_v1:';

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

  function readCache(key){
    try{
      const entry=JSON.parse(localStorage.getItem(key)||'null');
      if(!entry||!entry.savedAt||!entry.data) return null;
      if(Date.now()-Number(entry.savedAt)>=TTL_MS) return null;
      return entry.data;
    }catch(_){return null;}
  }

  function writeCache(key,data){
    try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),data}));}catch(_){}
  }

  function cachedResponse(data){
    return new Response(JSON.stringify(data),{
      status:200,
      headers:{'Content-Type':'application/json','X-Bitly-Cache':'browser-4h48m'}
    });
  }

  window.fetch=async(input,init)=>{
    const u=normalizedUrl(input);
    if(!u||u.origin!==location.origin||u.pathname!=='/api/bitly') return nativeFetch(input,init);

    const key=cacheKey(u);
    const cached=readCache(key);
    if(cached) return cachedResponse(cached);

    // Route all Bitly reads through the long-lived CDN cache and explicitly
    // remove the old browser no-store behavior from bitly.js.
    u.pathname='/api/bitly-cached';
    const nextInit={...(init||{}),cache:'default'};
    const response=await nativeFetch(u.pathname+u.search,nextInit);

    if(response.ok){
      try{
        const data=await response.clone().json();
        if(data?.ok) writeCache(key,data);
      }catch(_){}
    }
    return response;
  };

  function fixNote(){
    const note=document.getElementById('bitlyNote');
    if(!note) return;
    const text=String(note.textContent||'');
    if(text.includes('تحديث كل 5 دقائق')){
      note.textContent=text.replace('تحديث كل 5 دقائق','تحديث Bitly بحد أقصى 5 مرات يوميًا');
    }
  }

  const observer=new MutationObserver(()=>fixNote());
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fixNote,{once:true});
  else fixNote();
})();
