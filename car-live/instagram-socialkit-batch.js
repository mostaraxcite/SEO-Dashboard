(()=>{
  const nativeFetch=window.fetch.bind(window);
  const TARGETED=new Set(['Dc_CBNgoovN','Dcx_ep3NUJn']);
  const METRIC_KEYS=['views','likes','comments','shares','saves','reach','engagement','clicks'];

  const batchPromise=nativeFetch('/api/instagram-batch?v=5').then(async r=>{
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.ok) return {map:new Map(),meta:d||{},failed:true};
    const map=new Map();
    for(const item of Array.isArray(d.results)?d.results:[]){
      if(item?.shortcode) map.set(String(item.shortcode),item);
    }
    return {map,meta:d,failed:false};
  }).catch(()=>({map:new Map(),meta:{},failed:true}));

  const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const num=v=>finite(v)?Number(v):null;

  function shortcodeFromRequest(url){
    try{
      const u=new URL(url,location.origin);
      const direct=u.searchParams.get('shortcode');
      if(direct) return direct;
      const reel=u.searchParams.get('reel')||'';
      return reel.match(/\/(?:reel|p|tv)\/([^/?#]+)/i)?.[1]||'';
    }catch(_){return '';}
  }

  function shortcodeFromPost(post){
    return String(post?.url||'').match(/\/(?:reel|p|tv)\/([^/?#]+)/i)?.[1]||'';
  }

  function suspicious(obj){
    const views=num(obj?.views);
    const likes=num(obj?.likes);
    const comments=num(obj?.comments);
    const shares=num(obj?.shares);
    const saves=num(obj?.saves);
    return Number.isFinite(views)&&views<=5&&[likes,comments,shares,saves].every(v=>v===null||v===0);
  }

  function cleanNulls(post){
    let changed=false;
    for(const key of METRIC_KEYS){
      if(post[key]===null||post[key]===undefined){delete post[key];changed=true;}
    }
    return changed;
  }

  function responseWithJson(original,data){
    const headers=new Headers(original.headers);
    headers.set('Content-Type','application/json');
    headers.set('X-Instagram-Guard','1');
    return new Response(JSON.stringify(data),{status:original.status,statusText:original.statusText,headers});
  }

  function jsonResponse(body,source){
    return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json','X-Instagram-Source':source}});
  }

  window.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:(input&&typeof input.url==='string'?input.url:'');

    // Preserve every valid value returned by the existing data API.
    // Only remove nulls (so they render as —) and the known false 2/0/0 pattern.
    if(url.includes('/api/influencers')){
      const response=await nativeFetch(input,init);
      if(!response.ok) return response;
      const data=await response.clone().json().catch(()=>null);
      if(!data?.ok||!Array.isArray(data.influencers)) return response;

      let changed=false;
      for(const creator of data.influencers){
        for(const post of creator.posts||[]){
          if(cleanNulls(post)) changed=true;
          if(post?.platform!=='instagram') continue;
          const code=shortcodeFromPost(post);
          if(TARGETED.has(code)&&suspicious(post)){
            for(const key of METRIC_KEYS) delete post[key];
            post.available=false;
            post.source='awaiting-targeted-socialkit';
            changed=true;
          }
        }
      }
      return changed?responseWithJson(response,data):response;
    }

    if(!url.includes('/api/instagram-public')) return nativeFetch(input,init);

    const code=shortcodeFromRequest(url);
    if(TARGETED.has(code)){
      const batch=await batchPromise;
      const hit=batch?.map?.get(code);
      if(hit?.available){
        return jsonResponse({
          ok:true,available:true,shortcode:code,reelUrl:hit.url,
          views:finite(hit.views)?Number(hit.views):null,
          likes:finite(hit.likes)?Number(hit.likes):null,
          comments:finite(hit.comments)?Number(hit.comments):null,
          shares:finite(hit.shares)?Number(hit.shares):null,
          saves:finite(hit.saves)?Number(hit.saves):null,
          reach:null,
          engagement:finite(hit.engagement)?Number(hit.engagement):null,
          source:hit.source||'socialkit-targeted',
          batchUpdatedAt:batch.meta.updatedAt||null,
          cacheDays:batch.meta.cacheDays||14
        },hit.source||'socialkit-targeted');
      }
    }

    // For every non-targeted Reel, and for a targeted Reel if SocialKit could not
    // produce a trustworthy value, keep the original resolver. Reject only the
    // known false 2/0/0 response instead of blanking all Instagram data.
    const response=await nativeFetch(input,init);
    if(!response.ok) return response;
    const data=await response.clone().json().catch(()=>null);
    if(data?.ok&&data?.available&&suspicious(data)){
      return jsonResponse({
        ok:true,available:false,shortcode:code,
        views:null,likes:null,comments:null,shares:null,saves:null,reach:null,engagement:null,
        source:'instagram-suspicious-filter',
        note:'Rejected an implausible 2/0/0 Instagram fallback response.'
      },'instagram-suspicious-filter');
    }
    return response;
  };
})();
