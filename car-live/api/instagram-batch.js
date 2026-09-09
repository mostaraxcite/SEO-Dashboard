const SOCIALKIT_API='https://api.socialkit.dev';
const TIMEOUT_MS=9000;
const CACHE_SECONDS=14*24*60*60;
const MAX_MONTHLY_CREDITS=20;

const REELS=[
  {shortcode:'Dcv2p1SoN-U',profile:'https://www.instagram.com/raidalreda/',url:'https://www.instagram.com/raidalreda/reel/Dcv2p1SoN-U/'},
  {shortcode:'Dc_PxlJOsbs',profile:'https://www.instagram.com/haneen_jeddah8_/',url:'https://www.instagram.com/haneen_jeddah8_/reel/Dc_PxlJOsbs/'},
  {shortcode:'Dc_CBNgoovN',profile:'https://www.instagram.com/r.5i9/',url:'https://www.instagram.com/r.5i9/reel/Dc_CBNgoovN/'},
  {shortcode:'Dc_2QK-RZJm',profile:'https://www.instagram.com/jeddah_for_all2/',url:'https://www.instagram.com/jeddah_for_all2/reel/Dc_2QK-RZJm/'},
  {shortcode:'DczGDbasz9-',profile:'https://www.instagram.com/wo555_/',url:'https://www.instagram.com/wo555_/reel/DczGDbasz9-/'},
  {shortcode:'Dcx_ep3NUJn',profile:'https://www.instagram.com/omarrating/',url:'https://www.instagram.com/omarrating/reel/Dcx_ep3NUJn/'},
  {shortcode:'Dc_sS2cOn3C',profile:'https://www.instagram.com/jeddah_briefly/',url:'https://www.instagram.com/jeddah_briefly/reel/Dc_sS2cOn3C/'}
];

function asNum(v){
  if(v===null||v===undefined||v==='') return null;
  const n=Number(String(v).replace(/,/g,''));
  return Number.isFinite(n)?n:null;
}

function shortcodeFrom(v=''){
  const s=String(v||'');
  const m=s.match(/\/(?:reel|p|tv)\/([^/?#]+)/i);
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
  for(const key of ['shortcode','code','mediaCode']){
    if(node[key]) return String(node[key]);
  }
  for(const key of ['url','permalink','link','reelUrl','postUrl']){
    const code=shortcodeFrom(node[key]);
    if(code) return code;
  }
  return '';
}

function normalizeNode(node,meta){
  const views=asNum(node?.views??node?.viewCount??node?.videoViewCount??node?.video_view_count??node?.playCount??node?.plays??node?.play_count);
  const plays=asNum(node?.plays??node?.playCount??node?.play_count);
  const likes=asNum(node?.likes??node?.likeCount??node?.like_count);
  const comments=asNum(node?.comments??node?.commentCount??node?.comment_count);
  const shares=asNum(node?.shares??node?.shareCount??node?.share_count);
  const saves=asNum(node?.saves??node?.saveCount??node?.save_count??node?.collects);
  const finalViews=views??plays;
  const parts=[likes,comments,shares,saves].filter(Number.isFinite);
  const engagement=asNum(node?.engagement??node?.engagements) ?? (parts.length?parts.reduce((a,b)=>a+b,0):null);
  return {
    ...meta,
    views:finalViews,plays,likes,comments,shares,saves,reach:null,engagement,
    available:[finalViews,likes,comments,shares,saves].some(Number.isFinite),
    source:'socialkit-channel-reels'
  };
}

function findTarget(root,shortcode){
  const seen=new Set();
  let found=null;
  function walk(node){
    if(found||!node||typeof node!=='object'||seen.has(node)) return;
    seen.add(node);
    if(!Array.isArray(node)&&nodeShortcode(node)===shortcode){found=node;return;}
    if(Array.isArray(node)){
      for(const value of node){walk(value);if(found)return;}
    }else{
      for(const value of Object.values(node)){
        if(value&&typeof value==='object'){walk(value);if(found)return;}
      }
    }
  }
  walk(root);
  return found;
}

async function mapLimit(items,limit,worker){
  const out=new Array(items.length);let next=0;
  async function run(){
    for(;;){
      const i=next++;if(i>=items.length)return;
      try{out[i]=await worker(items[i]);}
      catch(e){out[i]={...items[i],views:null,likes:null,comments:null,shares:null,saves:null,reach:null,engagement:null,available:false,error:String(e?.message||e),source:'socialkit-channel-reels'};}
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length||1)},run));
  return out;
}

export default async function handler(req,res){
  if(req.method&&req.method!=='GET'){
    res.setHeader('Allow','GET');
    res.status(405).json({ok:false,error:'Method not allowed'});return;
  }

  const key=String(process.env.SOCIALKIT_INSTAGRAM_ACCESS_KEY||'').trim();
  if(!key){res.status(503).json({ok:false,error:'SocialKit Instagram key is not configured'});return;}

  const requested=String(req.query?.shortcode||'').trim();
  const selected=requested?REELS.filter(x=>x.shortcode===requested):REELS;
  if(requested&&!selected.length){res.status(404).json({ok:false,error:'Unknown campaign shortcode'});return;}

  try{
    const c=await credits(key);
    const used=Number.isFinite(c.used)?c.used:0;
    const remaining=Number.isFinite(c.remaining)?c.remaining:null;
    const needed=selected.length;
    if(used>=MAX_MONTHLY_CREDITS||(remaining!==null&&remaining<needed)){
      res.setHeader('Cache-Control','private, no-store');
      res.status(200).json({ok:true,skipped:true,reason:'credit_guard',credits:c,needed,targets:selected.map(x=>x.shortcode),results:[]});return;
    }

    const results=await mapLimit(selected,2,async meta=>{
      const feed=await api('/instagram/channel-reels',key,{
        url:meta.profile,
        limit:'100',
        cache:'true',
        cache_ttl:String(CACHE_SECONDS)
      });
      const node=findTarget(feed,meta.shortcode);
      if(!node){
        return {...meta,views:null,likes:null,comments:null,shares:null,saves:null,reach:null,engagement:null,available:false,error:'Target reel not found in public profile reels feed',source:'socialkit-channel-reels'};
      }
      return normalizeNode(node,meta);
    });

    const successful=results.filter(x=>x.available).length;
    res.setHeader('Cache-Control',`public, max-age=0, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400`);
    res.status(200).json({
      ok:true,successful,total:selected.length,creditsBefore:c,cacheDays:14,
      targets:selected.map(x=>x.shortcode),results,updatedAt:new Date().toISOString()
    });
  }catch(e){
    res.setHeader('Cache-Control','private, no-store');
    res.status(200).json({ok:false,error:String(e?.message||e),targets:selected.map(x=>x.shortcode),results:[]});
  }
}
