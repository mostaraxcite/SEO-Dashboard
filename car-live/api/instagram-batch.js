const ENSEMBLE_API='https://ensembledata.com/apis';
const SOCIALKIT_API='https://api.socialkit.dev';
const TIMEOUT_MS=10000;
const CACHE_SECONDS=2*24*60*60;
const OMAR_CODE='Dcx_ep3NUJn';
const HASAN_CODE='Dc_CBNgoovN';
const HASAN_VERIFIED_VIEWS=403000;

const REELS=[
  {shortcode:'Dcv2p1SoN-U',url:'https://www.instagram.com/raidalreda/reel/Dcv2p1SoN-U/'},
  {shortcode:'Dc_PxlJOsbs',url:'https://www.instagram.com/haneen_jeddah8_/reel/Dc_PxlJOsbs/'},
  {shortcode:HASAN_CODE,url:'https://www.instagram.com/r.5i9/reel/Dc_CBNgoovN/'},
  {shortcode:'Dc_2QK-RZJm',url:'https://www.instagram.com/jeddah_for_all2/reel/Dc_2QK-RZJm/'},
  {shortcode:'DczGDbasz9-',url:'https://www.instagram.com/wo555_/reel/DczGDbasz9-/'},
  {shortcode:OMAR_CODE,url:'https://www.instagram.com/reel/Dcx_ep3NUJn/'},
  {shortcode:'Dc_sS2cOn3C',url:'https://www.instagram.com/jeddah_briefly/reel/Dc_sS2cOn3C/'}
];

function asNum(v){
  if(v===null||v===undefined||v==='') return null;
  const n=Number(String(v).replace(/,/g,''));
  return Number.isFinite(n)?n:null;
}

async function fetchJson(url,headers={}){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),TIMEOUT_MS);
  try{
    const r=await fetch(url,{signal:ctrl.signal,headers:{Accept:'application/json',...headers}});
    const text=await r.text();
    let body={};
    try{body=text?JSON.parse(text):{};}catch(_){}
    if(!r.ok){
      const msg=body?.message||body?.error||`HTTP ${r.status}`;
      throw new Error(typeof msg==='string'?msg:JSON.stringify(msg));
    }
    return body;
  }finally{clearTimeout(timer);}
}

function firstNum(obj,keys){
  if(!obj||typeof obj!=='object') return null;
  for(const key of keys){
    const n=asNum(obj[key]);
    if(n!==null) return n;
  }
  return null;
}

function nodeCode(node){
  if(!node||typeof node!=='object') return '';
  for(const key of ['shortcode','code']){
    if(node[key]) return String(node[key]);
  }
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
  const seen=new Set();
  let hit=null;
  function walk(node){
    if(hit||!node||typeof node!=='object'||seen.has(node)) return;
    seen.add(node);
    if(hasMetricFields(node)){hit=node;return;}
    const values=Array.isArray(node)?node:Object.values(node);
    for(const value of values){
      if(value&&typeof value==='object'){walk(value);if(hit)return;}
    }
  }
  walk(root);
  return hit;
}

function findPostNode(root,shortcode){
  const seen=new Set();
  let exact=null;
  let metricCandidate=null;
  function walk(node){
    if(!node||typeof node!=='object'||seen.has(node)||exact) return;
    seen.add(node);
    if(!Array.isArray(node)){
      if(nodeCode(node)===shortcode){exact=node;return;}
      if(!metricCandidate&&hasMetricFields(node)) metricCandidate=node;
    }
    const values=Array.isArray(node)?node:Object.values(node);
    for(const value of values){
      if(value&&typeof value==='object') walk(value);
      if(exact) return;
    }
  }
  walk(root);
  if(exact) return hasMetricFields(exact)?exact:(findMetricDescendant(exact)||exact);
  return metricCandidate||findMetricDescendant(root)||root;
}

function normalize(node,meta,source){
  const providerViews=firstNum(node,['video_play_count','play_count','video_view_count','view_count','plays','views']);
  const views=meta.shortcode===HASAN_CODE?HASAN_VERIFIED_VIEWS:providerViews;
  const likes=firstNum(node,['like_count','likes_count','likes']);
  const comments=firstNum(node,['comment_count','comments_count','comments']);
  const shares=firstNum(node,['share_count','shares_count','reshare_count','shares']);
  const saves=firstNum(node,['save_count','saved_count','saves']);
  const parts=[likes,comments,shares,saves].filter(Number.isFinite);
  const engagement=parts.length?parts.reduce((a,b)=>a+b,0):null;
  const suspicious=Number.isFinite(views)&&views<=5&&[likes,comments,shares,saves].every(v=>v===null||v===0);
  return {
    ...meta,views,likes,comments,shares,saves,reach:null,engagement,
    available:!suspicious&&[views,likes,comments,shares,saves].some(Number.isFinite),
    suspicious,
    source:meta.shortcode===HASAN_CODE?`${source}+manual-verified-views`:source,
    manualViews:meta.shortcode===HASAN_CODE?HASAN_VERIFIED_VIEWS:undefined
  };
}

async function ensemblePostDetails(meta,token,reference,source){
  const q=new URLSearchParams({
    code:reference,
    n_comments_to_fetch:'0',
    token
  });
  const body=await fetchJson(`${ENSEMBLE_API}/instagram/post/details?${q}`);
  const node=findPostNode(body,meta.shortcode);
  return normalize(node,meta,source);
}

async function ensembleStats(meta,token){
  const first=await ensemblePostDetails(meta,token,meta.shortcode,'ensembledata-instagram-post-details');
  if(first.available) return first;

  if(meta.shortcode===OMAR_CODE){
    const second=await ensemblePostDetails(meta,token,meta.url,'ensembledata-instagram-post-details-url-fallback');
    if(second.available) return second;
    return {...second,error:'Omar Reel returned no trustworthy counters from shortcode or URL lookup'};
  }
  return first;
}

async function socialKitStats(meta,key){
  if(!key) return null;
  const q=new URLSearchParams({url:meta.url,cache:'true',cache_ttl:String(14*24*60*60)});
  const body=await fetchJson(`${SOCIALKIT_API}/instagram/stats?${q}`,{'x-access-key':key});
  const node=body?.data??body;
  return normalize(node,meta,'socialkit-instagram-stats');
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
    res.setHeader('Allow','GET');
    res.status(405).json({ok:false,error:'Method not allowed'});return;
  }

  const ensembleToken=String(process.env.ENSEMBLEDATA_API_TOKEN||process.env.ENSEMBLEDATA_TOKEN||'').trim();
  const socialKitKey=String(process.env.SOCIALKIT_INSTAGRAM_ACCESS_KEY||'').trim();
  if(!ensembleToken&&!socialKitKey){
    res.status(503).json({ok:false,error:'No Instagram data provider is configured'});return;
  }

  const requested=String(req.query?.shortcode||'').trim();
  const selected=requested?REELS.filter(x=>x.shortcode===requested):REELS;
  if(requested&&!selected.length){res.status(404).json({ok:false,error:'Unknown Instagram shortcode'});return;}

  const provider=ensembleToken?'ensembledata':'socialkit-fallback';
  const results=await mapLimit(selected,2,async meta=>{
    if(ensembleToken){
      try{
        const r=await ensembleStats(meta,ensembleToken);
        if(r.available) return r;
      }catch(e){
        if(!socialKitKey) throw e;
      }
    }
    const fallback=await socialKitStats(meta,socialKitKey);
    if(fallback?.available) return fallback;
    if(meta.shortcode===HASAN_CODE){
      return normalize({},meta,'manual-verified-views');
    }
    return fallback||{...meta,available:false,error:'No trustworthy Instagram counters returned',source:'instagram-unavailable'};
  });

  const successful=results.filter(x=>x.available).length;
  res.setHeader('Cache-Control',`public, max-age=0, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=21600`);
  res.status(200).json({
    ok:true,provider,successful,total:selected.length,unitEstimate:ensembleToken?selected.length*2:null,
    cacheDays:2,results,updatedAt:new Date().toISOString()
  });
}
