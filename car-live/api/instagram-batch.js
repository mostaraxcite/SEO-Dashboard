const SOCIALKIT_API='https://api.socialkit.dev';
const TIMEOUT_MS=9000;
const CACHE_SECONDS=14*24*60*60;
const MAX_MONTHLY_CREDITS=20;

// Only these two Reels returned the false 2/0/0 counters from the generic stats path.
// Keep the rest of Instagram on the existing working/public data and spend credits only here.
const TARGETS=[
  {shortcode:'Dc_CBNgoovN',profile:'https://www.instagram.com/r.5i9/',url:'https://www.instagram.com/r.5i9/reel/Dc_CBNgoovN/'},
  {shortcode:'Dcx_ep3NUJn',profile:'https://www.instagram.com/omarrating/',url:'https://www.instagram.com/omarrating/reel/Dcx_ep3NUJn/'}
];

function asNum(v){
  if(v===null||v===undefined||v==='') return null;
  const n=Number(String(v).replace(/,/g,''));
  return Number.isFinite(n)?n:null;
}

function shortcodeFrom(v=''){
  const m=String(v||'').match(/\/(?:reel|p|tv)\/([^/?#]+)/i);
  return m?m[1]:'';
}

async function api(path,key,params={}){
  const q=new URLSearchParams(params);
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),TIMEOUT_MS);
  try{
    const r=await fetch(`${SOCIALKIT_API}${path}${q.size?`?${q}`:''}`,{
      signal:ctrl.signal,
      headers:{Accept:'application/json','x-access-key':key}
    });
    const text=await r.text();
    let body={};
    try{body=text?JSON.parse(text):{};}catch(_){}
    if(!r.ok||body?.success===false){
      const msg=body?.error||body?.message||`SocialKit HTTP ${r.status}`;
      throw new Error(typeof msg==='string'?msg:JSON.stringify(msg));
    }
    return body?.data??body;
  }finally{clearTimeout(timer);}
}

async function credits(key){
  const d=await api('/credits',key);
  const m=d?.monthly||{};
  return {used:asNum(m.used),remaining:asNum(m.remaining),limit:asNum(m.limit),resetAt:m.resetAt||null};
}

function nodeShortcode(node){
  if(!node||typeof node!=='object') return '';
  for(const key of ['shortcode','code','mediaCode']) if(node[key]) return String(node[key]);
  for(const key of ['url','permalink','link','reelUrl','postUrl']){
    const code=shortcodeFrom(node[key]);
    if(code) return code;
  }
  return '';
}

function nodeUrl(node,fallback){
  if(node&&typeof node==='object'){
    for(const key of ['url','permalink','link','reelUrl','postUrl']){
      if(/^https?:\/\//i.test(String(node[key]||''))) return String(node[key]);
    }
  }
  return fallback;
}

function normalize(node,meta,source){
  const views=asNum(node?.views??node?.viewCount??node?.videoViewCount??node?.video_view_count??node?.playCount??node?.plays??node?.play_count);
  const likes=asNum(node?.likes??node?.likeCount??node?.like_count);
  const comments=asNum(node?.comments??node?.commentCount??node?.comment_count);
  const shares=asNum(node?.shares??node?.shareCount??node?.share_count);
  const saves=asNum(node?.saves??node?.saveCount??node?.save_count??node?.collects);
  const parts=[likes,comments,shares,saves].filter(Number.isFinite);
  const engagement=asNum(node?.engagement??node?.engagements) ?? (parts.length?parts.reduce((a,b)=>a+b,0):null);
  const suspicious=Number.isFinite(views)&&views<=5&&[likes,comments,shares,saves].every(v=>v===null||v===0);
  return {
    ...meta,views,likes,comments,shares,saves,reach:null,engagement,
    available:!suspicious&&[views,likes,comments,shares,saves].some(Number.isFinite),
    suspicious,source
  };
}

function findTarget(root,shortcode){
  const seen=new Set();
  let found=null;
  function walk(node){
    if(found||!node||typeof node!=='object'||seen.has(node)) return;
    seen.add(node);
    if(!Array.isArray(node)&&nodeShortcode(node)===shortcode){found=node;return;}
    const values=Array.isArray(node)?node:Object.values(node);
    for(const value of values){
      if(value&&typeof value==='object'){walk(value);if(found)return;}
    }
  }
  walk(root);
  return found;
}

export default async function handler(req,res){
  if(req.method&&req.method!=='GET'){
    res.setHeader('Allow','GET');
    res.status(405).json({ok:false,error:'Method not allowed'});return;
  }

  const key=String(process.env.SOCIALKIT_INSTAGRAM_ACCESS_KEY||'').trim();
  if(!key){res.status(503).json({ok:false,error:'SocialKit Instagram key is not configured'});return;}

  const requested=String(req.query?.shortcode||'').trim();
  const selected=requested?TARGETS.filter(x=>x.shortcode===requested):TARGETS;
  if(requested&&!selected.length){
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=3600');
    res.status(200).json({ok:true,successful:0,total:0,results:[],note:'This Reel uses the normal Instagram data path.'});return;
  }

  try{
    const c=await credits(key);
    let budget=Math.max(0,MAX_MONTHLY_CREDITS-(Number.isFinite(c.used)?c.used:0));
    if(Number.isFinite(c.remaining)) budget=Math.min(budget,c.remaining);
    const results=[];

    for(const meta of selected){
      if(budget<1){
        results.push({...meta,available:false,error:'credit_guard',source:'socialkit-credit-guard'});
        continue;
      }

      let best=null;
      try{
        const feed=await api('/instagram/channel-reels',key,{url:meta.profile,limit:'50',cache:'true',cache_ttl:String(CACHE_SECONDS)});
        budget--;
        const node=findTarget(feed,meta.shortcode);
        if(node){
          const candidate=normalize(node,meta,'socialkit-channel-reels');
          if(candidate.available) best=candidate;

          // If the listing found the exact Reel but did not expose useful counters,
          // ask the official per-Reel stats endpoint using the exact returned/public URL.
          if(!best&&budget>=1){
            const stats=await api('/instagram/stats',key,{url:nodeUrl(node,meta.url),cache:'true',cache_ttl:String(CACHE_SECONDS)});
            budget--;
            const candidate2=normalize(stats,meta,'socialkit-instagram-stats');
            if(candidate2.available) best=candidate2;
          }
        }else if(budget>=1){
          const stats=await api('/instagram/stats',key,{url:meta.url,cache:'true',cache_ttl:String(CACHE_SECONDS)});
          budget--;
          const candidate=normalize(stats,meta,'socialkit-instagram-stats');
          if(candidate.available) best=candidate;
        }
      }catch(e){
        if(!best) best={...meta,available:false,error:String(e?.message||e),source:'socialkit'};
      }

      results.push(best||{...meta,available:false,error:'No trustworthy counters returned',source:'socialkit-unavailable'});
    }

    const successful=results.filter(x=>x.available).length;
    res.setHeader('Cache-Control',`public, max-age=0, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400`);
    res.status(200).json({ok:true,successful,total:selected.length,creditsBefore:c,creditsBudgetLeft:budget,cacheDays:14,results,updatedAt:new Date().toISOString()});
  }catch(e){
    res.setHeader('Cache-Control','private, no-store');
    res.status(200).json({ok:false,error:String(e?.message||e),results:[]});
  }
}
