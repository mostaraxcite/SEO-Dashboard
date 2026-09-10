const SOCIALCRAWL_API='https://www.socialcrawl.dev/v1';
const ENSEMBLE_API='https://ensembledata.com/apis';
const SOCIALKIT_API='https://api.socialkit.dev';
const TIMEOUT_MS=10000;
const CACHE_SECONDS=2*24*60*60;
const UPDATE_DAYS=2;

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

function firstNum(obj,keys){
  if(!obj||typeof obj!=='object') return null;
  for(const key of keys){
    const n=asNum(obj[key]);
    if(n!==null) return n;
  }
  return null;
}

async function fetchJson(url,headers={}){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),TIMEOUT_MS);
  try{
    const r=await fetch(url,{signal:ctrl.signal,headers:{Accept:'application/json',...headers}});
    const text=await r.text();
    let body={};
    try{body=text?JSON.parse(text):{};}catch(_){}
    if(!r.ok||body?.success===false){
      const msg=body?.message||body?.error||body?.detail||`HTTP ${r.status}`;
      throw new Error(typeof msg==='string'?msg:JSON.stringify(msg));
    }
    return body;
  }finally{clearTimeout(timer);}
}

function normalizedResult(meta,source,{views=null,likes=null,comments=null,shares=null,saves=null,reach=null}={}){
  const parts=[likes,comments,shares,saves].filter(Number.isFinite);
  const engagement=parts.length?parts.reduce((a,b)=>a+b,0):null;
  const suspicious=Number.isFinite(views)&&views<=5&&[likes,comments,shares,saves].every(v=>v===null||v===0);
  return {
    ...meta,views,likes,comments,shares,saves,reach,engagement,
    available:!suspicious&&[views,likes,comments,shares,saves,reach].some(Number.isFinite),
    suspicious,source
  };
}

function normalizeSocialCrawlPost(body,meta){
  const post=body?.data?.post||body?.post||body?.data||{};
  const engagement=post?.engagement||body?.data?.engagement||{};
  const computed=post?.computed||body?.data?.computed||{};
  const ext=post?.ext||{};
  return {
    ...normalizedResult(meta,'socialcrawl-instagram-post',{
      views:asNum(engagement?.views??post?.views??ext?.ig_play_count??ext?.play_count),
      likes:asNum(engagement?.likes??post?.likes),
      comments:asNum(engagement?.comments??post?.comments),
      // Standard /instagram/post intentionally does not request the expensive share-count source.
      shares:null,
      saves:null,
      reach:asNum(computed?.estimated_reach)
    }),
    cached:body?.cached===true,
    creditsUsed:asNum(body?.credits_used),
    creditsRemaining:asNum(body?.credits_remaining),
    requestId:body?.request_id||null
  };
}

async function socialCrawlPost(meta,key){
  const q=new URLSearchParams({url:meta.url,trim:'true'});
  const body=await fetchJson(`${SOCIALCRAWL_API}/instagram/post?${q}`,{'x-api-key':key});
  return normalizeSocialCrawlPost(body,meta);
}

function nodeCode(node){
  if(!node||typeof node!=='object') return '';
  for(const key of ['shortcode','code']) if(node[key]) return String(node[key]);
  for(const key of ['url','permalink','link']){
    const m=String(node[key]||'').match(/\/(?:reel|p|tv)\/([^/?#]+)/i);
    if(m) return m[1];
  }
  return '';
}

const METRIC_FIELDS=new Set([
  'video_play_count','play_count','view_count','video_view_count','plays','views',
  'like_count','likes_count','likes','comment_count','comments_count','comments',
  'share_count','shares_count','reshare_count','shares','save_count','saved_count','saves'
]);

function hasMetricFields(node){
  return !!node&&typeof node==='object'&&!Array.isArray(node)&&Object.keys(node).some(k=>METRIC_FIELDS.has(k)&&node[k]!==null&&node[k]!==undefined);
}

function findMetricDescendant(root){
  const seen=new Set();let hit=null;
  function walk(node){
    if(hit||!node||typeof node!=='object'||seen.has(node)) return;
    seen.add(node);
    if(hasMetricFields(node)){hit=node;return;}
    const values=Array.isArray(node)?node:Object.values(node);
    for(const value of values){if(value&&typeof value==='object'){walk(value);if(hit)return;}}
  }
  walk(root);return hit;
}

function findPostNode(root,shortcode){
  const seen=new Set();let exact=null;let metricCandidate=null;
  function walk(node){
    if(!node||typeof node!=='object'||seen.has(node)||exact) return;
    seen.add(node);
    if(!Array.isArray(node)){
      if(nodeCode(node)===shortcode){exact=node;return;}
      if(!metricCandidate&&hasMetricFields(node)) metricCandidate=node;
    }
    const values=Array.isArray(node)?node:Object.values(node);
    for(const value of values){if(value&&typeof value==='object') walk(value);if(exact)return;}
  }
  walk(root);
  if(exact) return hasMetricFields(exact)?exact:(findMetricDescendant(exact)||exact);
  return metricCandidate||findMetricDescendant(root)||root;
}

function normalizeFlat(node,meta,source){
  return normalizedResult(meta,source,{
    views:firstNum(node,['video_play_count','play_count','video_view_count','view_count','plays','views']),
    likes:firstNum(node,['like_count','likes_count','likes']),
    comments:firstNum(node,['comment_count','comments_count','comments']),
    shares:firstNum(node,['share_count','shares_count','reshare_count','shares']),
    saves:firstNum(node,['save_count','saved_count','saves'])
  });
}

async function ensembleStats(meta,token){
  const q=new URLSearchParams({code:meta.shortcode,n_comments_to_fetch:'0',token});
  const body=await fetchJson(`${ENSEMBLE_API}/instagram/post/details?${q}`);
  return normalizeFlat(findPostNode(body,meta.shortcode),meta,'ensembledata-instagram-post-details');
}

async function socialKitStats(meta,key){
  const q=new URLSearchParams({url:meta.url,cache:'true',cache_ttl:String(14*24*60*60)});
  const body=await fetchJson(`${SOCIALKIT_API}/instagram/stats?${q}`,{'x-access-key':key});
  return normalizeFlat(body?.data??body,meta,'socialkit-instagram-stats');
}

async function mapLimit(items,limit,worker){
  const out=new Array(items.length);let next=0;
  async function run(){
    for(;;){
      const i=next++;if(i>=items.length)return;
      try{out[i]=await worker(items[i]);}
      catch(e){out[i]={...items[i],available:false,error:String(e?.message||e),source:'instagram-provider-unavailable'};}
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length||1)},run));
  return out;
}

export default async function handler(req,res){
  if(req.method&&req.method!=='GET'){
    res.setHeader('Allow','GET');res.status(405).json({ok:false,error:'Method not allowed'});return;
  }

  const socialCrawlKey=String(process.env.SOCIALCRAWL_API_KEY||'').trim();
  const ensembleToken=String(process.env.ENSEMBLEDATA_API_TOKEN||process.env.ENSEMBLEDATA_TOKEN||'').trim();
  const socialKitKey=String(process.env.SOCIALKIT_INSTAGRAM_ACCESS_KEY||'').trim();
  if(!socialCrawlKey&&!ensembleToken&&!socialKitKey){
    res.status(503).json({ok:false,error:'No Instagram data provider is configured'});return;
  }

  const requested=String(req.query?.shortcode||'').trim();
  const selected=requested?REELS.filter(x=>x.shortcode===requested):REELS;
  if(requested&&!selected.length){res.status(404).json({ok:false,error:'Unknown Instagram shortcode'});return;}

  const provider=socialCrawlKey?'socialcrawl-post':(ensembleToken?'ensembledata':'socialkit-fallback');
  const results=await mapLimit(selected,3,async meta=>{
    // Cheapest trustworthy path: one SocialCrawl /instagram/post request per reel (1 credit).
    if(socialCrawlKey){
      try{
        const r=await socialCrawlPost(meta,socialCrawlKey);
        if(r.available) return r;
      }catch(e){
        // Fall through only when the primary provider is unavailable; do not retry another SocialCrawl endpoint.
      }
    }
    if(ensembleToken){
      try{const r=await ensembleStats(meta,ensembleToken);if(r.available)return r;}catch(_){}
    }
    if(socialKitKey){
      try{const r=await socialKitStats(meta,socialKitKey);if(r.available)return r;}catch(_){}
    }
    return {...meta,available:false,error:'No trustworthy Instagram counters returned',source:'instagram-unavailable'};
  });

  const successful=results.filter(x=>x.available).length;
  const socialCrawlCreditsUsed=results.reduce((sum,x)=>sum+(x.source==='socialcrawl-instagram-post'?(asNum(x.creditsUsed)||0):0),0);
  const updatesPer30Days=Math.ceil(30/UPDATE_DAYS);
  const estimatedMonthlyCredits=REELS.length*updatesPer30Days;

  res.setHeader('Cache-Control',`public, max-age=0, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400`);
  res.status(200).json({
    ok:true,provider,successful,total:selected.length,
    socialCrawlCreditsUsed,
    socialCrawlCreditsPerFullRefresh:socialCrawlKey?selected.length:null,
    estimatedMonthlyCredits:socialCrawlKey?estimatedMonthlyCredits:null,
    cacheDays:UPDATE_DAYS,
    sharesRefresh:'disabled-on-routine-refresh-to-save-credits',
    results,updatedAt:new Date().toISOString()
  });
}
