const SOCIALKIT_API='https://api.socialkit.dev';
const TIMEOUT_MS=7000;
const CACHE_SECONDS=14*24*60*60;
const MAX_MONTHLY_CREDITS=20;

const REELS=[
  {shortcode:'Dcv2p1SoN-U',url:'https://www.instagram.com/raidalreda/reel/Dcv2p1SoN-U/'},
  {shortcode:'Dc_PxlJOsbs',url:'https://www.instagram.com/haneen_jeddah8_/reel/Dc_PxlJOsbs/'},
  {shortcode:'Dc_CBNgoovN',url:'https://www.instagram.com/r.5i9/reel/Dc_CBNgoovN/'},
  {shortcode:'Dc_2QK-RZJm',url:'https://www.instagram.com/jeddah_for_all2/reel/Dc_2QK-RZJm/'},
  {shortcode:'DczGDbasz9-',url:'https://www.instagram.com/wo555_/reel/DczGDbasz9-/'},
  {shortcode:'Dcx_ep3NUJn',url:'https://www.instagram.com/omarrating/reel/Dcx_ep3NUJn/'},
  {shortcode:'Dc_sS2cOn3C',url:'https://www.instagram.com/jeddah_briefly/reel/Dc_sS2cOn3C/'}
];

function asNum(v){
  if(v===null||v===undefined||v==='') return null;
  const n=Number(String(v).replace(/,/g,''));
  return Number.isFinite(n)?n:null;
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
    if(!r.ok||body?.success===false) throw new Error(body?.error||body?.message||`SocialKit HTTP ${r.status}`);
    return body?.data??body;
  }finally{clearTimeout(timer);}
}

async function credits(key){
  const d=await api('/credits',key);
  const m=d?.monthly||{};
  return {used:asNum(m.used),remaining:asNum(m.remaining),limit:asNum(m.limit),resetAt:m.resetAt||null};
}

function normalize(d,meta){
  const views=asNum(d?.views??d?.plays??d?.playCount??d?.viewCount);
  const likes=asNum(d?.likes??d?.likeCount);
  const comments=asNum(d?.comments??d?.commentCount);
  const shares=asNum(d?.shares??d?.shareCount);
  const saves=asNum(d?.saves??d?.collects??d?.saveCount);
  const parts=[likes,comments,shares,saves].filter(Number.isFinite);
  const engagement=asNum(d?.engagement??d?.engagements) ?? (parts.length?parts.reduce((a,b)=>a+b,0):null);
  return {...meta,views,likes,comments,shares,saves,reach:null,engagement,available:[views,likes,comments,shares,saves].some(Number.isFinite),source:'socialkit'};
}

async function mapLimit(items,limit,worker){
  const out=new Array(items.length);let next=0;
  async function run(){
    for(;;){const i=next++;if(i>=items.length)return;try{out[i]=await worker(items[i]);}catch(e){out[i]={...items[i],available:false,error:String(e?.message||e),source:'socialkit'};}}
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},run));
  return out;
}

export default async function handler(req,res){
  if(req.method&&req.method!=='GET'){
    res.setHeader('Allow','GET');
    res.status(405).json({ok:false,error:'Method not allowed'});return;
  }
  const key=String(process.env.SOCIALKIT_INSTAGRAM_ACCESS_KEY||'').trim();
  if(!key){res.status(503).json({ok:false,error:'SocialKit Instagram key is not configured'});return;}

  try{
    const c=await credits(key);
    const used=Number.isFinite(c.used)?c.used:0;
    const remaining=Number.isFinite(c.remaining)?c.remaining:null;
    const needed=REELS.length;
    if(used>=MAX_MONTHLY_CREDITS||(remaining!==null&&remaining<needed)){
      res.setHeader('Cache-Control','private, no-store');
      res.status(200).json({ok:true,skipped:true,reason:'credit_guard',credits:c,needed,results:[]});return;
    }

    const results=await mapLimit(REELS,2,async meta=>{
      const d=await api('/instagram/stats',key,{url:meta.url,cache:'true',cache_ttl:String(CACHE_SECONDS)});
      return normalize(d,meta);
    });
    const successful=results.filter(x=>x.available).length;
    res.setHeader('Cache-Control',`public, max-age=0, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400`);
    res.status(200).json({ok:true,successful,total:REELS.length,creditsBefore:c,cacheDays:14,results,updatedAt:new Date().toISOString()});
  }catch(e){
    res.setHeader('Cache-Control','private, no-store');
    res.status(200).json({ok:false,error:String(e?.message||e)});
  }
}
