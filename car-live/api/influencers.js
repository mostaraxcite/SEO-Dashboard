const SOCIALKIT_API='https://api.socialkit.dev';
const FETCH_TIMEOUT_MS=7000;
const MAX_CONCURRENCY=3;

const INFLUENCERS=[
  {id:'raid-abdulmosen',name:'RAID ABDULMOSEN',cost:13000,platform:'سناب + تيك توك + انستقرام',urls:[
    'https://vt.tiktok.com/ZSVKa9pHg/',
    'https://www.instagram.com/reel/Dcv2p1SoN-U/?igsi=MTRmaDhpcTIyaHVxdQ=='
  ]},
  {id:'najla-alwadaani',name:'Najla Alwadaani',cost:70000,platform:'سناب',urls:[]},
  {id:'amani-alyousif',name:'AMANI ALYOUSIF',cost:3136,platform:'تيك توك',urls:['https://vt.tiktok.com/ZSVUkETUP/']},
  {id:'bushayer',name:'BUSHAYER',cost:4600,platform:'تيك توك',urls:['https://vt.tiktok.com/ZSVAFqcVF/']},
  {id:'hind-alajmi',name:'HIND ALAJMI',cost:4000,platform:'تيك توك',urls:['https://vt.tiktok.com/ZSVac9c89/']},
  {id:'majd',name:'MAJD',cost:3000,platform:'تيك توك',urls:['https://vt.tiktok.com/ZSVPNv9Ku/']},
  {id:'yasser-1',name:'YASSER',cost:4181,platform:'تيك توك',urls:['https://vm.tiktok.com/ZN8L9THE4/']},
  {id:'zohor',name:'ZOHOR',cost:4725,platform:'تيك توك',urls:['https://vt.tiktok.com/ZSVU4LsAa/']},
  {id:'haneen-jeddah',name:'Haneen Jeddah -',cost:4000,platform:'تيك توك',urls:[]},
  {id:'hasan-alshehri',name:'Hasan Alshehri',cost:21950,platform:'تيك توك + انستقرام',urls:[
    'https://vt.tiktok.com/ZSqeJs5vQ/',
    'https://www.instagram.com/reel/Dcy0wZ4Ipe6/?stkn=a203ZG5sNWtwZ244'
  ]},
  {id:'jeddah-briefly',name:'Jeddah Briefly',cost:4725,platform:'تيك توك',urls:[]},
  {id:'jawlat-jeddah',name:'Jawlat Jeddah',cost:4000,platform:'تيك توك',urls:[]},
  {id:'jaded-abha',name:'Jaded Abha',cost:2909,platform:'تيك توك',urls:['https://vt.tiktok.com/ZSqeRS8wS/']},
  {id:'samera-mohammed',name:'Samera Mohammed',cost:2625,platform:'تيك توك',urls:[]},
  {id:'shouq',name:'SHOUQ',cost:2200,platform:'تيك توك',urls:['https://vt.tiktok.com/ZSqeJjg82/']},
  {id:'yasser-2',name:'YASSER',cost:4400,platform:'سناب + تيك توك + انستقرام',urls:[
    'https://vt.tiktok.com/ZSqJtvyvx/',
    'https://www.instagram.com/reel/DczGDbasz9-/?igsi=d3JsazQ3Mnd4eXBj'
  ]},
  {id:'omar-ep',name:'OMAR EP',cost:2990,platform:'سناب + تيك توك + انستقرام',urls:[
    'https://vt.tiktok.com/ZSqeJhr57/',
    'https://www.instagram.com/reel/Dcx_ep3NUJn/?igsi=MWpmZGpiNWxsM2g1ZQ==',
    'https://snapchat.com/t/a1hwYild'
  ]}
];

function platformOf(url=''){
  const v=String(url).toLowerCase();
  if(v.includes('tiktok.com')) return 'tiktok';
  if(v.includes('instagram.com')) return 'instagram';
  if(v.includes('snapchat.com')) return 'snapchat';
  return 'other';
}

function asNum(v){
  if(v===null||v===undefined||v==='') return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

function htmlDecode(s=''){
  return String(s)
    .replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'")
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}

function compactCount(v){
  const s=String(v||'').replace(/,/g,'').trim().toUpperCase();
  const m=s.match(/^([\d.]+)\s*([KMB])?$/);
  if(!m) return null;
  const mult={K:1e3,M:1e6,B:1e9}[m[2]]||1;
  const n=Number(m[1])*mult;
  return Number.isFinite(n)?Math.round(n):null;
}

async function fetchText(url){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),FETCH_TIMEOUT_MS);
  try{
    const r=await fetch(url,{
      redirect:'follow',
      signal:ctrl.signal,
      headers:{
        'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        'Accept-Language':'ar,en-US;q=0.9,en;q=0.8',
        Accept:'text/html,application/xhtml+xml'
      }
    });
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return {text:await r.text(),url:r.url,status:r.status};
  }finally{clearTimeout(timer);}
}

function deepFindStats(node,seen=new Set()){
  if(!node||typeof node!=='object'||seen.has(node)) return null;
  seen.add(node);
  const stats=node.stats||node.statsV2;
  if(stats&&typeof stats==='object'){
    const views=asNum(stats.playCount??stats.play_count);
    const likes=asNum(stats.diggCount??stats.likeCount??stats.like_count);
    const comments=asNum(stats.commentCount??stats.comment_count);
    const shares=asNum(stats.shareCount??stats.share_count);
    const saves=asNum(stats.collectCount??stats.collect_count??stats.favoriteCount);
    if([views,likes,comments,shares,saves].some(v=>v!==null)){
      return {views,likes,comments,shares,saves};
    }
  }
  for(const value of Object.values(node)){
    if(value&&typeof value==='object'){
      const hit=deepFindStats(value,seen);
      if(hit) return hit;
    }
  }
  return null;
}

function jsonScript(html,id){
  const escaped=id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp(`<script[^>]+id=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/script>`,'i');
  const m=html.match(re);
  if(!m) return null;
  try{return JSON.parse(htmlDecode(m[1]));}catch(_){return null;}
}

async function tiktokPublic(url){
  const page=await fetchText(url);
  const candidates=[
    jsonScript(page.text,'__UNIVERSAL_DATA_FOR_REHYDRATION__'),
    jsonScript(page.text,'SIGI_STATE')
  ].filter(Boolean);
  for(const data of candidates){
    const stats=deepFindStats(data);
    if(stats) return {...stats,url:page.url,source:'tiktok-public',available:true};
  }
  throw new Error('TikTok public stats not found');
}

function metaContent(html,key){
  const esc=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterns=[
    new RegExp(`<meta[^>]+property=["']${esc}["'][^>]+content=["']([^"']*)["'][^>]*>`,'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${esc}["'][^>]*>`,'i'),
    new RegExp(`<meta[^>]+name=["']${esc}["'][^>]+content=["']([^"']*)["'][^>]*>`,'i')
  ];
  for(const re of patterns){
    const m=html.match(re); if(m) return htmlDecode(m[1]);
  }
  return '';
}

async function instagramPublic(url){
  const page=await fetchText(url);
  const desc=metaContent(page.text,'og:description')||metaContent(page.text,'description');
  let likes=null,comments=null,views=null;
  const likeMatch=desc.match(/([\d.,]+\s*[KMB]?)\s+likes?/i);
  const commentMatch=desc.match(/([\d.,]+\s*[KMB]?)\s+comments?/i);
  const viewMatch=desc.match(/([\d.,]+\s*[KMB]?)\s+(?:views?|plays?)/i);
  if(likeMatch) likes=compactCount(likeMatch[1]);
  if(commentMatch) comments=compactCount(commentMatch[1]);
  if(viewMatch) views=compactCount(viewMatch[1]);
  if([likes,comments,views].every(v=>v===null)) throw new Error('Instagram public counters not exposed');
  return {views,likes,comments,shares:null,saves:null,url:page.url,source:'instagram-public',available:true};
}

async function socialKit(url,key){
  const platform=platformOf(url);
  if(!['tiktok','instagram'].includes(platform)) return null;
  const endpoint=platform==='tiktok'?'tiktok/stats':'instagram/stats';
  const q=new URLSearchParams({access_key:key,url,cache:'true',cache_ttl:'21600'});
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),FETCH_TIMEOUT_MS);
  try{
    const r=await fetch(`${SOCIALKIT_API}/${endpoint}?${q}`,{
      signal:ctrl.signal,
      headers:{Accept:'application/json'}
    });
    const text=await r.text();
    let body={};
    try{body=text?JSON.parse(text):{};}catch(_){}
    if(!r.ok||body?.success===false) throw new Error(body?.error||body?.message||`SocialKit HTTP ${r.status}`);
    const d=body?.data||body;
    return {
      views:asNum(d.views),
      likes:asNum(d.likes),
      comments:asNum(d.comments),
      shares:asNum(d.shares),
      saves:asNum(d.collects??d.saves),
      url:d.url||url,
      source:'socialkit',
      available:true
    };
  }finally{clearTimeout(timer);}
}

async function getUrlStats(url,key){
  const platform=platformOf(url);
  if(platform==='snapchat'){
    return {platform,url,views:null,likes:null,comments:null,shares:null,saves:null,clicks:null,available:false,error:'Snapchat public post metrics are not exposed'};
  }

  if(key&&['tiktok','instagram'].includes(platform)){
    try{
      const d=await socialKit(url,key);
      if(d) return {platform,clicks:null,...d};
    }catch(_){}
  }

  try{
    const d=platform==='tiktok'?await tiktokPublic(url):platform==='instagram'?await instagramPublic(url):null;
    if(d) return {platform,clicks:null,...d};
  }catch(e){
    return {platform,url,views:null,likes:null,comments:null,shares:null,saves:null,clicks:null,available:false,error:String(e?.message||e)};
  }

  return {platform,url,views:null,likes:null,comments:null,shares:null,saves:null,clicks:null,available:false,error:'Unsupported platform'};
}

async function mapLimit(items,limit,worker){
  const out=new Array(items.length);
  let next=0;
  async function runner(){
    for(;;){
      const i=next++; if(i>=items.length) return;
      try{out[i]=await worker(items[i],i);}
      catch(e){out[i]={available:false,error:String(e?.message||e)};}
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length||1)},runner));
  return out;
}

function addKnown(arr,key){
  const vals=arr.map(x=>asNum(x?.[key])).filter(v=>v!==null);
  return vals.length?vals.reduce((a,b)=>a+b,0):null;
}

function combineMetrics(items){
  const views=addKnown(items,'views');
  const likes=addKnown(items,'likes');
  const comments=addKnown(items,'comments');
  const shares=addKnown(items,'shares');
  const saves=addKnown(items,'saves');
  const clicks=addKnown(items,'clicks');
  const engagementParts=[likes,comments,shares,saves].filter(v=>v!==null);
  const engagement=engagementParts.length?engagementParts.reduce((a,b)=>a+b,0):null;
  return {views,likes,comments,shares,saves,engagement,clicks};
}

function rate(cost,value){
  return Number.isFinite(cost)&&Number.isFinite(value)&&value>0?cost/value:null;
}

export default async function handler(req,res){
  if(req.method&&req.method!=='GET'){
    res.setHeader('Allow','GET');
    res.status(405).json({ok:false,error:'Method not allowed'});return;
  }

  const key=String(process.env.SOCIALKIT_ACCESS_KEY||'').trim();
  const allUrls=INFLUENCERS.flatMap(i=>i.urls.map(url=>({id:i.id,url})));
  const stats=await mapLimit(allUrls,MAX_CONCURRENCY,async item=>({id:item.id,...await getUrlStats(item.url,key)}));
  const byId=new Map();
  for(const item of stats){
    if(!byId.has(item.id)) byId.set(item.id,[]);
    byId.get(item.id).push(item);
  }

  const influencers=INFLUENCERS.map(i=>{
    const posts=byId.get(i.id)||[];
    const metrics=combineMetrics(posts);
    return {
      ...i,
      posts,
      metrics,
      cpv:rate(i.cost,metrics.views),
      cpe:rate(i.cost,metrics.engagement),
      cpc:rate(i.cost,metrics.clicks),
      metricsAvailable:posts.some(p=>p.available),
      missingLink:i.urls.length===0
    };
  });

  const totalCost=INFLUENCERS.reduce((s,i)=>s+i.cost,0);
  const totals=combineMetrics(influencers.map(i=>i.metrics));
  const engagementRate=Number.isFinite(totals.engagement)&&Number.isFinite(totals.views)&&totals.views>0
    ? totals.engagement/totals.views
    : null;

  res.setHeader('Cache-Control','public, max-age=0, s-maxage=3600, stale-while-revalidate=300');
  res.status(200).json({
    ok:true,
    influencers,
    totals:{
      cost:totalCost,
      ...totals,
      engagementRate,
      cpv:rate(totalCost,totals.views),
      cpe:rate(totalCost,totals.engagement),
      cpc:rate(totalCost,totals.clicks)
    },
    creatorCount:INFLUENCERS.length,
    creatorsWithLinks:INFLUENCERS.filter(i=>i.urls.length).length,
    postLinkCount:allUrls.length,
    socialKitEnabled:Boolean(key),
    clickMetricsAvailable:false,
    notes:[
      'Public social post URLs do not expose outbound click counts. Add a tracked Bitly/UTM link per influencer or platform Insights to populate clicks and CPC.',
      'Instagram share/save counts can be unavailable publicly; unavailable fields are returned as null, not zero.',
      'Creators without a URL in the supplied file remain visible with missingLink=true.'
    ],
    updatedAt:new Date().toISOString()
  });
}
