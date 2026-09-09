(()=>{
  const nativeFetch=window.fetch.bind(window);
  const KNOWN=new Set([
    'Dcv2p1SoN-U','Dc_PxlJOsbs','Dc_CBNgoovN','Dc_2QK-RZJm','DczGDbasz9-','Dcx_ep3NUJn','Dc_sS2cOn3C'
  ]);

  const batchPromise=nativeFetch('/api/instagram-batch?v=3').then(async r=>{
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.ok) return {map:new Map(),meta:d||{},failed:true};
    const map=new Map();
    for(const item of Array.isArray(d.results)?d.results:[]){
      if(item?.shortcode) map.set(String(item.shortcode),item);
    }
    return {map,meta:d,failed:false};
  }).catch(()=>({map:new Map(),meta:{},failed:true}));

  function shortcodeFromRequest(url){
    try{
      const u=new URL(url,location.origin);
      const direct=u.searchParams.get('shortcode');
      if(direct) return direct;
      const reel=u.searchParams.get('reel')||'';
      return reel.match(/\/(?:reel|p|tv)\/([^/?#]+)/i)?.[1]||'';
    }catch(_){return '';}
  }

  function responseWithJson(original,data){
    const headers=new Headers(original.headers);
    headers.set('Content-Type','application/json');
    headers.set('X-Instagram-Batch-Guard','1');
    return new Response(JSON.stringify(data),{
      status:original.status,
      statusText:original.statusText,
      headers
    });
  }

  function jsonResponse(body,source){
    return new Response(JSON.stringify(body),{
      status:200,
      headers:{'Content-Type':'application/json','X-Instagram-Source':source}
    });
  }

  window.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:(input&&typeof input.url==='string'?input.url:'');

    if(url.includes('/api/influencers')){
      const response=await nativeFetch(input,init);
      if(!response.ok) return response;
      const data=await response.clone().json().catch(()=>null);
      if(!data?.ok||!Array.isArray(data.influencers)) return response;

      let changed=false;
      for(const creator of data.influencers){
        for(const post of creator.posts||[]){
          if(post?.platform!=='instagram') continue;
          const code=String(post.url||'').match(/\/(?:reel|p|tv)\/([^/?#]+)/i)?.[1]||'';
          if(!KNOWN.has(code)) continue;
          // Delete unavailable values instead of assigning null. The dashboard's
          // old numeric helper treats Number(null) as 0, which created fake zeroes.
          for(const key of ['views','likes','comments','shares','saves','reach','engagement','clicks']) delete post[key];
          post.available=false;
          post.source='awaiting-socialkit-channel-reels';
          changed=true;
        }
      }
      if(changed) return responseWithJson(response,data);
      return response;
    }

    if(!url.includes('/api/instagram-public')) return nativeFetch(input,init);

    const code=shortcodeFromRequest(url);
    if(!code||!KNOWN.has(code)) return nativeFetch(input,init);

    const batch=await batchPromise;
    const hit=batch?.map?.get(code);
    if(hit?.available){
      return jsonResponse({
        ok:true,available:true,shortcode:code,reelUrl:hit.url,
        views:Number.isFinite(hit.views)?hit.views:null,
        likes:Number.isFinite(hit.likes)?hit.likes:null,
        comments:Number.isFinite(hit.comments)?hit.comments:null,
        shares:Number.isFinite(hit.shares)?hit.shares:null,
        saves:Number.isFinite(hit.saves)?hit.saves:null,
        reach:null,
        engagement:Number.isFinite(hit.engagement)?hit.engagement:null,
        source:hit.source||'socialkit-channel-reels',
        batchUpdatedAt:batch.meta.updatedAt||null,
        cacheDays:batch.meta.cacheDays||14
      },'socialkit-channel-reels');
    }

    return jsonResponse({
      ok:true,available:false,shortcode:code,
      views:null,likes:null,comments:null,shares:null,saves:null,reach:null,engagement:null,
      source:'socialkit-channel-reels-unavailable',
      note:hit?.error||batch?.meta?.reason||'Exact campaign Reel was not returned by the public profile Reels feed.'
    },'socialkit-channel-reels-unavailable');
  };
})();
