const SOCIALKIT_API='https://api.socialkit.dev';
const FETCH_TIMEOUT_MS=4500;
const MAX_CONCURRENCY=6;

const INFLUENCERS=[
  {
    id:'raid-abdulmosen',name:'RAID ABDULMOSEN',cost:13000,platform:'سناب + تيك توك + انستقرام',category:'Mega',
    instagramProfile:'https://www.instagram.com/raidalreda/',
    urls:[
      'https://vt.tiktok.com/ZSVKa9pHg/',
      'https://www.instagram.com/raidalreda/reel/Dcv2p1SoN-U/'
    ]
  },
  {
    id:'najla-alwadaani',name:'Najla Alwadaani',cost:70000,platform:'سناب',category:'Mega',urls:[],
    manualMetrics:{views:564708,reach:516609,engagement:398947,source:'workbook'}
  },
  {
    id:'amani-alyousif',name:'AMANI ALYOUSIF',cost:3136,platform:'تيك توك',category:'Micro',
    urls:['https://vt.tiktok.com/ZSVUkETUP/']
  },
  {
    id:'bushayer',name:'BUSHAYER',cost:4600,platform:'تيك توك',category:'Micro',
    urls:['https://vt.tiktok.com/ZSVAFqcVF/']
  },
  {
    id:'hind-alajmi',name:'HIND ALAJMI',cost:4000,platform:'تيك توك',category:'Micro',
    urls:['https://vt.tiktok.com/ZSVac9c89/']
  },
  {
    id:'majd',name:'MAJD',cost:3000,platform:'تيك توك',category:'Micro',
    urls:['https://vt.tiktok.com/ZSVPNv9Ku/']
  },
  {
    id:'yasser-1',name:'YASSER',cost:4181,platform:'تيك توك',category:'Micro',
    urls:['https://vm.tiktok.com/ZN8L9THE4/']
  },
  {
    id:'zohor',name:'ZOHOR',cost:4725,platform:'تيك توك',category:'Micro',
    urls:['https://vt.tiktok.com/ZSVU4LsAa/']
  },
  {
    id:'haneen-jeddah',name:'Haneen Jeddah -',cost:4000,platform:'تيك توك',category:'Micro',
    instagramProfile:'https://www.instagram.com/haneen_jeddah8_/',
    urls:[
      'https://vt.tiktok.com/ZSqMd8DVn/',
      'https://www.instagram.com/haneen_jeddah8_/reel/Dc_PxlJOsbs/'
    ]
  },
  {
    id:'hasan-alshehri',name:'Hasan Alshehri',cost:21950,platform:'تيك توك + انستقرام',category:'Mega',
    instagramProfile:'https://www.instagram.com/r.5i9/',
    urls:[
      'https://vt.tiktok.com/ZSqeJs5vQ/',
      'https://vt.tiktok.com/ZSqMsR3dE/',
      'https://www.instagram.com/r.5i9/reel/Dc_CBNgoovN/'
    ],
    manualFallback:{views:400000,source:'workbook-approx'}
  },
  {
    id:'jawlat-jeddah',name:'Jawlat Jeddah',cost:4000,platform:'تيك توك + انستقرام',category:'Micro',
    instagramProfile:'https://www.instagram.com/jeddah_for_all2/',
    urls:[
      'https://vt.tiktok.com/ZSqMp7Dxt/',
      'https://www.instagram.com/jeddah_for_all2/reel/Dc_2QK-RZJm/'
    ]
  },
  {
    id:'jaded-abha',name:'Jaded Abha',cost:2909,platform:'تيك توك',category:'Micro',
    urls:['https://vt.tiktok.com/ZSqeRS8wS/']
  },
  {
    id:'samera-mohammed',name:'Samera Mohammed',cost:2625,platform:'تيك توك',category:'Micro',
    urls:['https://www.tiktok.com/@semo33_1/video/7682433376208391444?_r=1&_t=ZS-99VdmCirGVw']
  },
  {
    id:'shouq',name:'SHOUQ',cost:2200,platform:'تيك توك',category:'Micro',
    urls:['https://vt.tiktok.com/ZSqeJjg82/']
  },
  {
    id:'yasser-2',name:'YASSER',cost:4400,platform:'سناب + تيك توك + انستقرام',category:'Micro',
    instagramProfile:'https://www.instagram.com/wo555_/',
    urls:[
      'https://vt.tiktok.com/ZSqJtvyvx/',
      'https://www.instagram.com/wo555_/reel/DczGDbasz9-/'
    ]
  },
  {
    id:'omar-ep',name:'OMAR EP',cost:2990,platform:'سناب + تيك توك + انستقرام',category:'Micro',
    instagramProfile:'https://www.instagram.com/omarrating/',
    urls:[
      'https://vt.tiktok.com/ZSqeJhr57/',
      'https://www.instagram.com/omarrating/reel/Dcx_ep3NUJn/',
      'https://snapchat.com/t/a1hwYild'
    ]
  },
  {
    id:'jeddah-briefly',name:'Jeddah Briefly',cost:4725,platform:'انستقرام',category:'Micro',
    instagramProfile:'https://www.instagram.com/jeddah_briefly/',
    urls:['https://www.instagram.com/jeddah_briefly/reel/Dc_sS2cOn3C/']
  }
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

function firstFinite(...vals){
  for(const v of vals){
    const n=asNum(v);
    if(n!==null) return n;
  }
  return null;
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
        'Accept-Language':'en-US,en;q=0.9,ar;q=0.8',
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
    if(stats) return {...stats,reach:null,engagement:null,url:page.url,source:'tiktok-public',available:true};
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

function reelShortcode(url=''){
  const m=String(url).match(/\/reel\/([^/?#]+)/i);
  return m?m[1]:'';
}

function regexNumber(text,patterns){
  for(const re of patterns){
    const m=String(text||'').match(re);
    if(m){
      const n=compactCount(m[1]);
      if(n!==null) return n;
    }
  }
  return null;
}

function instagramStatsFromText(text,shortcode=''){
  const raw=htmlDecode(String(text||''));
  const normalized=raw
    .replace(/\\u002F/gi,'/')
    .replace(/\\u003D/gi,'=')
    .replace(/\\u0026/gi,'&');

  const windows=[];
  if(shortcode){
    let idx=normalized.indexOf(shortcode);
    let guard=0;
    while(idx>=0&&guard<6){
      windows.push(normalized.slice(Math.max(0,idx-18000),Math.min(normalized.length,idx+18000)));
      idx=normalized.indexOf(shortcode,idx+shortcode.length);
      guard++;
    }
  }
  if(!windows.length) windows.push(normalized.slice(0,120000));
  const scoped=windows.join('\n');

  const views=regexNumber(scoped,[
    /["']?(?:video_play_count|play_count|video_view_count|view_count)["']?\s*[:=]\s*["']?([\d.,]+\s*[KMB]?)/i,
    /([\d.,]+\s*[KMB]?)\s+(?:views?|plays?)/i
  ]);
  const likes=regexNumber(scoped,[
    /["']?(?:like_count|likes_count)["']?\s*[:=]\s*["']?([\d.,]+\s*[KMB]?)/i,
    /edge_media_preview_like[\s\S]{0,300}?["']?count["']?\s*:\s*([\d.,]+)/i,
    /([\d.,]+\s*[KMB]?)\s+likes?/i
  ]);
  const comments=regexNumber(scoped,[
    /["']?(?:comment_count|comments_count)["']?\s*[:=]\s*["']?([\d.,]+\s*[KMB]?)/i,
    /edge_media_to_comment[\s\S]{0,300}?["']?count["']?\s*:\s*([\d.,]+)/i,
    /([\d.,]+\s*[KMB]?)\s+comments?/i
  ]);

  return {views,likes,comments};
}

async function instagramPublic(url,profileUrl=''){
  const page=await fetchText(url);
  const shortcode=reelShortcode(page.url)||reelShortcode(url);
  const desc=metaContent(page.text,'og:description')||metaContent(page.text,'description');
  const direct=instagramStatsFromText(`${desc}\n${page.text}`,shortcode);

  let views=direct.views;
  let likes=direct.likes;
  let comments=direct.comments;
  let profileSource=false;

  if(profileUrl&&views===null){
    try{
      const reelsUrl=`${String(profileUrl).replace(/\/+$/,'')}/reels/`;
      const profile=await fetchText(reelsUrl);
      const fromProfile=instagramStatsFromText(profile.text,shortcode);
      views=firstFinite(views,fromProfile.views);
      likes=firstFinite(likes,fromProfile.likes);
      comments=firstFinite(comments,fromProfile.comments);
      profileSource=fromProfile.views!==null||fromProfile.likes!==null||fromProfile.comments!==null;
    }catch(_){}
  }

  if([likes,comments,views].every(v=>v===null)) throw new Error('Instagram public counters not exposed');
  return {
    views,likes,comments,shares:null,saves:null,reach:null,engagement:null,
    url:page.url,
    source:profileSource?'instagram-public-profile+reel':'instagram-public-reel',
    available:true
  };
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
      reach:asNum(d.reach),
      engagement:asNum(d.engagements??d.engagement),
      url:d.url||url,
      source:'socialkit',
      available:true
    };
  }finally{clearTimeout(timer);}
}

async function getUrlStats(item,key){
  const url=item.url;
  const platform=platformOf(url);
  if(platform==='snapchat'){
    return {platform,url,views:null,likes:null,comments:null,shares:null,saves:null,reach:null,engagement:null,clicks:null,available:false,error:'Snapchat public post metrics are not exposed'};
  }

  if(key&&['tiktok','instagram'].includes(platform)){
    try{
      const d=await socialKit(url,key);
      if(d) return {platform,clicks:null,...d};
    }catch(_){}
  }

  try{
    const d=platform==='tiktok'
      ?await tiktokPublic(url)
      :platform==='instagram'
        ?await instagramPublic(url,item.instagramProfile||'')
        :null;
    if(d) return {platform,clicks:null,...d};
  }catch(e){
    return {platform,url,views:null,likes:null,comments:null,shares:null,saves:null,reach:null,engagement:null,clicks:null,available:false,error:String(e?.message||e)};
  }

  return {platform,url,views:null,likes:null,comments:null,shares:null,saves:null,reach:null,engagement:null,clicks:null,available:false,error:'Unsupported platform'};
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
  const reach=addKnown(items,'reach');
  const clicks=addKnown(items,'clicks');
  const directEngagement=addKnown(items,'engagement');
  const engagementParts=[likes,comments,shares,saves].filter(v=>v!==null);
  const engagement=directEngagement!==null
    ?directEngagement
    :(engagementParts.length?engagementParts.reduce((a,b)=>a+b,0):null);
  return {views,reach,likes,comments,shares,saves,engagement,clicks};
}

function rate(cost,value){
  return Number.isFinite(cost)&&Number.isFinite(value)&&value>0?cost/value:null;
}

function manualPost(i){
  if(!i.manualMetrics) return null;
  return {
    platform:'manual',
    url:null,
    views:asNum(i.manualMetrics.views),
    reach:asNum(i.manualMetrics.reach),
    likes:null,comments:null,shares:null,saves:null,
    engagement:asNum(i.manualMetrics.engagement),
    clicks:null,
    available:true,
    source:i.manualMetrics.source||'workbook'
  };
}

export default async function handler(req,res){
  if(req.method&&req.method!=='GET'){
    res.setHeader('Allow','GET');
    res.status(405).json({ok:false,error:'Method not allowed'});return;
  }

  const key=String(process.env.SOCIALKIT_ACCESS_KEY||'').trim();
  const allUrls=INFLUENCERS.flatMap(i=>i.urls.map(url=>({id:i.id,url,instagramProfile:i.instagramProfile||''})));
  const stats=await mapLimit(allUrls,MAX_CONCURRENCY,async item=>({id:item.id,...await getUrlStats(item,key)}));
  const byId=new Map();
  for(const item of stats){
    if(!byId.has(item.id)) byId.set(item.id,[]);
    byId.get(item.id).push(item);
  }

  const influencers=INFLUENCERS.map(i=>{
    const posts=byId.get(i.id)||[];
    const manual=manualPost(i);
    if(manual) posts.push(manual);

    let metrics=combineMetrics(posts);
    if(i.manualFallback&&metrics.views===null){
      metrics={...metrics,views:asNum(i.manualFallback.views)};
      posts.push({
        platform:'manual-fallback',url:null,views:asNum(i.manualFallback.views),reach:null,
        likes:null,comments:null,shares:null,saves:null,engagement:null,clicks:null,
        available:true,source:i.manualFallback.source||'workbook-fallback'
      });
    }

    return {
      id:i.id,name:i.name,cost:i.cost,platform:i.platform,category:i.category,
      instagramProfile:i.instagramProfile||null,
      urls:i.urls,
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

  const categoryCounts=INFLUENCERS.reduce((acc,i)=>{
    acc[i.category]=(acc[i.category]||0)+1;
    return acc;
  },{Mega:0,Micro:0,UGC:0});

  res.setHeader('Cache-Control','public, max-age=0, s-maxage=1800, stale-while-revalidate=300');
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
    categoryCounts,
    creatorCount:INFLUENCERS.length,
    creatorsWithLinks:INFLUENCERS.filter(i=>i.urls.length).length,
    postLinkCount:allUrls.length,
    socialKitEnabled:Boolean(key),
    clickMetricsAvailable:false,
    notes:[
      'Classification is sourced from the latest workbook: Mega, Micro and UGC.',
      'Instagram public extraction reads the reel page first, then the creator public /reels/ page for the matching shortcode when views are not present on the reel page.',
      'Instagram reach, shares and saves may be unavailable publicly; unavailable fields are returned as null, not zero.',
      'Outbound clicks require a tracked Bitly/UTM link or authenticated platform Insights.'
    ],
    updatedAt:new Date().toISOString()
  });
}
