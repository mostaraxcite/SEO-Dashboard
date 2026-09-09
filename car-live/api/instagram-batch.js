const SOCIALKIT_API='https://api.socialkit.dev';
const TIMEOUT_MS=9000;
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
    if(!r.ok||body?.success===false){
      const msg=body?.error||body?.message||`SocialKit HTTP ${r.status}`;
      const e=new Error(typeof msg==='string'?msg:JSON.stringify(msg));
      e.status=r.status;
      throw e;
    }
    return body?.data??body;
  }finally{clearTimeout(timer);}
}

async function credits(key){
  const d=await api('/credits',key);
  const m=d?.monthly||{};
  const p=d?.purchased||{};
  const monthlyRemaining=asNum(m.remaining);
  const purchasedRemaining=asNum(p.remaining);
  return {
    totalRemaining:asNum(d?.totalRemaining) ?? ((monthlyRemaining||0)+(purchasedRemaining||0)),
    monthly:{used:asNum(m.used),remaining:monthlyRemaining,limit:asNum(m.limit),resetAt:m.resetAt||null},
    purchased:{remaining:purchasedRemaining}
  };
}

function normalize(d,meta,source){
  const views=asNum(d?.views??d?.plays??d?.playCount??d?.viewCount);
  const likes=asNum(d?.likes??d?.likeCount);
  const comments=asNum(d?.comments??d?.commentCount);
  const shares=asNum(d?.shares??d?.shareCount);
  const saves=asNum(d?.saves??d?.collects??d?.saveCount);
  const parts=[likes,comments,shares,saves].filter(Number.isFinite);
  const engagement=asNum(d?.engagement??d?.engagements) ?? (parts.length?parts.reduce((a,b)=>a+b,0):null);
  const suspicious=Number.isFinite(views)&&views<=5&&[likes,comments,shares,saves].every(v=>v===null||v===0);
  return {
    ...meta,views,likes,comments,shares,saves,reach:null,engagement,
    available:!suspicious&&[views,likes,comments,shares,saves].some(Number.isFinite),
    suspicious,source
  };
}

async function getStats(meta,key){
  const d=await api('/instagram/stats',key,{
    url:meta.url,
    cache:'true',
    cache_ttl:String(CACHE_SECONDS)
  });
  return normalize(d,meta,'socialkit-instagram-stats');
}

async function mapLimit(items,limit,worker){
  const out=new Array(items.length);let next=0;
  async function run(){
    for(;;){
      const i=next++;if(i>=items.length)return;
      try{out[i]=await worker(items[i]);}
      catch(e){out[i]={...items[i],available:false,error:String(e?.message||e),source:'socialkit-unavailable'};}
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
  if(requested&&!selected.length){res.status(404).json({ok:false,error:'Unknown Instagram shortcode'});return;}

  try{
    const c=await credits(key);
    const monthlyUsed=Number.isFinite(c.monthly.used)?c.monthly.used:0;
    const monthlyRemaining=Number.isFinite(c.monthly.remaining)?c.monthly.remaining:0;
    const freeBudget=Math.max(0,Math.min(monthlyRemaining,MAX_MONTHLY_CREDITS-monthlyUsed));

    let attempt=selected;
    let mode='live-or-cache';

    // When the free allowance is exhausted, still try the exact cached Stats calls.
    // A cache hit can restore the previous result; a cache miss simply fails because
    // there is no balance, so it cannot consume an extra free credit.
    if(freeBudget<=0){
      mode='cache-recovery';
    }else if(freeBudget<selected.length){
      attempt=selected.slice(0,freeBudget);
      mode='limited-budget';
    }

    const attemptedResults=await mapLimit(attempt,2,meta=>getStats(meta,key));
    const byCode=new Map(attemptedResults.map(x=>[x.shortcode,x]));
    const results=selected.map(meta=>byCode.get(meta.shortcode)||{
      ...meta,available:false,error:'not_attempted_credit_guard',source:'socialkit-credit-guard'
    });

    const successful=results.filter(x=>x.available).length;
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=21600, stale-while-revalidate=3600');
    res.status(200).json({
      ok:true,mode,successful,total:selected.length,credits:c,cacheDays:14,
      results,updatedAt:new Date().toISOString()
    });
  }catch(e){
    res.setHeader('Cache-Control','private, no-store');
    res.status(200).json({ok:false,error:String(e?.message||e),results:[]});
  }
}
