const SOCIALCRAWL_API='https://www.socialcrawl.dev/v1';
const CACHE_SECONDS=43200; // 12 hours
const TIMEOUT_MS=9000;

const TARGETS={
  ohoud:{id:'ohoud',name:'Ohoud',category:'Micro',url:'https://www.tiktok.com/@oudii.mm/video/7685725638376066325?_r=1&_t=ZS-99kkYmbMbtF'},
  wejdan:{id:'wejdan',name:'Wejdan',category:'Micro',url:'https://www.tiktok.com/@wjdan19955/video/7685663591214615828?_r=1&_t=ZS-99kQFVoaSyz'},
  'taghtiyat-abha':{id:'taghtiyat-abha',name:'Taghtiyat Abha',category:'Micro',url:'https://vt.tiktok.com/ZSqbrAuCc/'}
};

function asNum(v){
  if(v===null||v===undefined||v==='') return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

async function fetchWithTimeout(url,options={}){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),TIMEOUT_MS);
  try{return await fetch(url,{...options,signal:ctrl.signal});}
  finally{clearTimeout(timer);}
}

async function resolveTikTokUrl(url){
  try{
    const r=await fetchWithTimeout(url,{
      redirect:'follow',
      headers:{
        'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        'Accept-Language':'en-US,en;q=0.9'
      }
    });
    return r?.url&&r.url.includes('tiktok.com')?r.url:url;
  }catch(_){return url;}
}

async function socialCrawlPost(target,key){
  const resolvedUrl=await resolveTikTokUrl(target.url);
  const q=new URLSearchParams({url:resolvedUrl,region:'SA'});
  const r=await fetchWithTimeout(`${SOCIALCRAWL_API}/tiktok/post?${q}`,{
    headers:{Accept:'application/json','x-api-key':key}
  });
  const text=await r.text();
  let body={};
  try{body=text?JSON.parse(text):{};}catch(_){}
  if(!r.ok||body?.success===false){
    const msg=body?.message||body?.error||body?.detail||`SocialCrawl HTTP ${r.status}`;
    throw new Error(typeof msg==='string'?msg:JSON.stringify(msg));
  }
  const post=body?.data?.post||body?.data||{};
  const engagement=post?.engagement||body?.data?.engagement||{};
  const computed=body?.data?.computed||{};
  const views=asNum(engagement.views??post.views);
  const likes=asNum(engagement.likes??post.likes);
  const comments=asNum(engagement.comments??post.comments);
  const shares=asNum(engagement.shares??post.shares);
  const saves=asNum(engagement.saves??post.saves);
  const reach=asNum(computed.estimated_reach);
  const parts=[likes,comments,shares,saves].filter(Number.isFinite);
  const engagementTotal=parts.length?parts.reduce((a,b)=>a+b,0):null;
  const available=[views,likes,comments,shares,saves].some(Number.isFinite);
  return {
    ...target,
    url:resolvedUrl,
    originalUrl:target.url,
    views,likes,comments,shares,saves,reach,
    engagement:engagementTotal,
    available,
    source:'socialcrawl-tiktok-post',
    creditsUsed:asNum(body?.credits_used),
    creditsRemaining:asNum(body?.credits_remaining),
    cached:body?.cached===true
  };
}

async function mapLimit(items,limit,worker){
  const out=new Array(items.length);let next=0;
  async function run(){
    for(;;){
      const i=next++;if(i>=items.length)return;
      try{out[i]=await worker(items[i]);}
      catch(e){out[i]={...items[i],available:false,error:String(e?.message||e),source:'socialcrawl-tiktok-unavailable'};}
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
  const key=String(process.env.SOCIALCRAWL_API_KEY||'').trim();
  if(!key){res.status(503).json({ok:false,error:'Missing SOCIALCRAWL_API_KEY'});return;}

  const requested=String(req.query?.ids||'')
    .split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
  const ids=requested.length?requested:Object.keys(TARGETS);
  const selected=ids.map(id=>TARGETS[id]).filter(Boolean);
  if(!selected.length){res.status(404).json({ok:false,error:'No matching influencer ids'});return;}

  const results=await mapLimit(selected,2,target=>socialCrawlPost(target,key));
  res.setHeader('Cache-Control',`public, max-age=0, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=3600`);
  res.status(200).json({
    ok:true,
    results,
    successful:results.filter(x=>x.available).length,
    total:results.length,
    creditsUsed:results.reduce((s,x)=>s+(Number(x.creditsUsed)||0),0),
    updatedAt:new Date().toISOString()
  });
}
