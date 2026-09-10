(()=>{
  const nativeFetch=window.fetch.bind(window);
  const STORAGE_KEY='jp_instagram_last_good_v1';
  const METRIC_KEYS=['views','likes','comments','shares','saves','reach','engagement'];
  const ALL_CODES=new Set([
    'Dcv2p1SoN-U','Dc_PxlJOsbs','Dc_CBNgoovN','Dc_2QK-RZJm','DczGDbasz9-','Dcx_ep3NUJn','Dc_sS2cOn3C'
  ]);

  const SEED={
    'Dc_sS2cOn3C':{
      views:5112,likes:58,comments:14,shares:0,saves:0,reach:null,engagement:72,
      source:'last-known-good-socialkit',updatedAt:'2026-09-09T00:00:00.000Z'
    }
  };

  const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const num=v=>finite(v)?Number(v):null;

  function suspicious(obj){
    const views=num(obj?.views);
    const likes=num(obj?.likes);
    const comments=num(obj?.comments);
    const shares=num(obj?.shares);
    const saves=num(obj?.saves);
    return Number.isFinite(views)&&views<=5&&[likes,comments,shares,saves].every(v=>v===null||v===0);
  }

  function trustworthy(obj){
    if(!obj||suspicious(obj)) return false;
    return [obj.views,obj.likes,obj.comments,obj.shares,obj.saves].some(finite);
  }

  function readStore(){
    let parsed={};
    try{parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')||{};}catch(_){}
    for(const [code,value] of Object.entries(SEED)){
      if(!trustworthy(parsed[code])) parsed[code]=value;
    }
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(parsed));}catch(_){}
    return parsed;
  }

  const store=readStore();

  function saveGood(code,obj){
    if(!code||!trustworthy(obj)) return;
    const saved={source:obj.source||'instagram-provider',updatedAt:obj.updatedAt||new Date().toISOString()};
    for(const key of METRIC_KEYS) saved[key]=finite(obj[key])?Number(obj[key]):null;
    store[code]=saved;
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(store));}catch(_){}
  }

  function applyGood(target,source){
    if(!trustworthy(source)) return false;
    for(const key of METRIC_KEYS){
      if(finite(source[key])) target[key]=Number(source[key]);
      else delete target[key];
    }
    target.available=true;
    target.source=source.source||'instagram-last-known-good';
    return true;
  }

  function shortcodeFromPost(post){
    return String(post?.url||'').match(/\/(?:reel|p|tv)\/([^/?#]+)/i)?.[1]||'';
  }

  function shortcodeFromRequest(url){
    try{
      const u=new URL(url,location.origin);
      const direct=u.searchParams.get('shortcode');
      if(direct) return direct;
      const reel=u.searchParams.get('reel')||'';
      return reel.match(/\/(?:reel|p|tv)\/([^/?#]+)/i)?.[1]||'';
    }catch(_){return '';}
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
    headers.set('X-Instagram-Last-Good','1');
    return new Response(JSON.stringify(data),{status:original.status,statusText:original.statusText,headers});
  }

  function jsonResponse(body,source){
    return new Response(JSON.stringify(body),{
      status:200,
      headers:{'Content-Type':'application/json','X-Instagram-Source':source}
    });
  }

  const batchPromise=nativeFetch('/api/instagram-batch?v=11').then(async r=>{
    const d=await r.json().catch(()=>({}));
    const map=new Map();
    if(r.ok&&d?.ok&&Array.isArray(d.results)){
      for(const item of d.results){
        if(item?.shortcode&&trustworthy(item)){
          saveGood(String(item.shortcode),{...item,updatedAt:d.updatedAt});
          map.set(String(item.shortcode),item);
        }
      }
    }
    return {map,meta:d||{}};
  }).catch(()=>({map:new Map(),meta:{}}));

  window.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:(input&&typeof input.url==='string'?input.url:'');

    if(url.includes('/api/influencers')){
      const [response,batch]=await Promise.all([nativeFetch(input,init),batchPromise]);
      if(!response.ok) return response;
      const data=await response.clone().json().catch(()=>null);
      if(!data?.ok||!Array.isArray(data.influencers)) return response;

      let changed=false;
      for(const creator of data.influencers){
        for(const post of creator.posts||[]){
          if(cleanNulls(post)) changed=true;
          if(post?.platform!=='instagram') continue;
          const code=shortcodeFromPost(post);
          if(!ALL_CODES.has(code)) continue;

          const fresh=batch?.map?.get(code);
          if(trustworthy(fresh)){
            applyGood(post,fresh);changed=true;continue;
          }

          const saved=store[code];
          if(trustworthy(saved)){
            applyGood(post,saved);changed=true;continue;
          }

          if(suspicious(post)){
            for(const key of METRIC_KEYS) delete post[key];
            post.available=false;
            post.source='instagram-suspicious-filter';
            changed=true;
          }
        }
      }
      return changed?responseWithJson(response,data):response;
    }

    if(!url.includes('/api/instagram-public')) return nativeFetch(input,init);

    const code=shortcodeFromRequest(url);
    if(code&&ALL_CODES.has(code)){
      const batch=await batchPromise;
      const fresh=batch?.map?.get(code);
      const best=trustworthy(fresh)?fresh:store[code];
      if(trustworthy(best)){
        return jsonResponse({
          ok:true,available:true,shortcode:code,
          views:finite(best.views)?Number(best.views):null,
          likes:finite(best.likes)?Number(best.likes):null,
          comments:finite(best.comments)?Number(best.comments):null,
          shares:finite(best.shares)?Number(best.shares):null,
          saves:finite(best.saves)?Number(best.saves):null,
          reach:finite(best.reach)?Number(best.reach):null,
          engagement:finite(best.engagement)?Number(best.engagement):null,
          source:best.source||'instagram-last-known-good',
          lastKnownGood:true
        },best.source||'instagram-last-known-good');
      }
    }

    const response=await nativeFetch(input,init);
    if(!response.ok) return response;
    const data=await response.clone().json().catch(()=>null);
    if(data?.ok&&data?.available&&suspicious(data)){
      return jsonResponse({
        ok:true,available:false,shortcode:code,
        views:null,likes:null,comments:null,shares:null,saves:null,reach:null,engagement:null,
        source:'instagram-suspicious-filter',
        note:'Rejected an implausible Instagram fallback counter.'
      },'instagram-suspicious-filter');
    }
    if(data?.ok&&data?.available&&trustworthy(data)) saveGood(code,data);
    return response;
  };
})();
