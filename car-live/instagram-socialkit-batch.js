(()=>{
  const nativeFetch=window.fetch.bind(window);
  const batchPromise=nativeFetch('/api/instagram-batch').then(async r=>{
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.ok||!Array.isArray(d.results)) return null;
    const map=new Map();
    for(const item of d.results){
      if(item?.shortcode) map.set(String(item.shortcode),item);
    }
    return {map,meta:d};
  }).catch(()=>null);

  function shortcodeFromRequest(url){
    try{
      const u=new URL(url,location.origin);
      const direct=u.searchParams.get('shortcode');
      if(direct) return direct;
      const reel=u.searchParams.get('reel')||'';
      return reel.match(/\/(?:reel|p|tv)\/([^/?#]+)/i)?.[1]||'';
    }catch(_){return '';}
  }

  window.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:(input&&typeof input.url==='string'?input.url:'');
    if(!url.includes('/api/instagram-public')) return nativeFetch(input,init);

    const code=shortcodeFromRequest(url);
    if(code){
      const batch=await batchPromise;
      const hit=batch?.map?.get(code);
      if(hit?.available){
        const body={
          ok:true,available:true,shortcode:code,reelUrl:hit.url,
          views:Number.isFinite(hit.views)?hit.views:null,
          likes:Number.isFinite(hit.likes)?hit.likes:null,
          comments:Number.isFinite(hit.comments)?hit.comments:null,
          shares:Number.isFinite(hit.shares)?hit.shares:null,
          saves:Number.isFinite(hit.saves)?hit.saves:null,
          reach:null,
          engagement:Number.isFinite(hit.engagement)?hit.engagement:null,
          source:'socialkit-batch',
          batchUpdatedAt:batch.meta.updatedAt||null,
          cacheDays:batch.meta.cacheDays||14
        };
        return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json','X-Instagram-Source':'socialkit-batch'}});
      }
    }
    return nativeFetch(input,init);
  };
})();
