const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;

function localISODate(date=new Date()){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function getDateRange(req){
  const start=String(req.query?.start_date||'').trim();
  const end=String(req.query?.end_date||'').trim();

  // The dashboard default is YTD. Never fall back to a fixed date that may be
  // embedded inside an old Supermetrics Query Manager URL.
  if(!start&&!end){
    const today=localISODate();
    return {start:`${today.slice(0,4)}-01-01`,end:today,custom:false};
  }
  if(!DATE_RE.test(start)||!DATE_RE.test(end)||start>end){
    return {error:'Invalid date range. Use YYYY-MM-DD and make sure start_date is before end_date.'};
  }
  return {start,end,custom:true};
}

function buildFreshSupermetricsUrl(rawUrl,range){
  const u=new URL(rawUrl);

  // Query Manager URLs commonly store the full request inside ?json={...}.
  // Preserve accounts, fields, filters and settings; only replace dates/cache.
  const rawJson=u.searchParams.get('json');
  if(rawJson){
    try{
      const query=JSON.parse(rawJson);
      if(query&&typeof query==='object'&&!Array.isArray(query)){
        query.start_date=range.start;
        query.end_date=range.end;
        query.cache_minutes=0;
        u.searchParams.set('json',JSON.stringify(query));
      }
    }catch(_){
      // If this isn't a JSON-based URL, use ordinary query parameters below.
    }
  }

  // GET and short-query URLs can accept ordinary overrides as well. Setting
  // these is harmless for JSON URLs and prevents stale fixed date ranges.
  u.searchParams.set('start_date',range.start);
  u.searchParams.set('end_date',range.end);
  u.searchParams.set('cache_minutes','0');
  u.searchParams.set('sync_timeout','120');
  return u.toString();
}

function sourceConfig(standardUrl,allUrl,standardName,allName){
  if(standardUrl) return {url:standardUrl,scope:'all-campaigns',sourceEnv:standardName};
  if(allUrl) return {url:allUrl,scope:'all-campaigns',sourceEnv:allName};
  return {url:null,scope:'missing',sourceEnv:'missing'};
}

function normalizeLinkedInPayload(payload){
  const candidates=[payload,payload?.data,payload?.data?.data,payload?.results,payload?.result?.data];
  for(const table of candidates){
    if(!Array.isArray(table)||!table.length||!Array.isArray(table[0])) continue;
    table[0]=table[0].map(cell=>{
      const label=String(cell??'').trim().toLowerCase();
      return label.includes('campaign group name')?'Campaign name':cell;
    });
    break;
  }
  return payload;
}

function supermetricsDiagnostics(payload,range){
  const meta=payload?.meta||{};
  const query=meta?.query||{};
  return {
    requestedRange:{start_date:range.start,end_date:range.end},
    sourceRange:{
      start_date:query.start_date||null,
      end_date:query.end_date||null
    },
    cacheUsed:meta.cache_used===true,
    cacheTime:meta.cache_time||null,
    status:meta.status_code||null,
    scheduleId:meta.schedule_id||null
  };
}

export default async function handler(req,res){
  const range=getDateRange(req);
  if(range.error){res.status(400).json({error:range.error});return;}

  const liveSources={
    Meta:sourceConfig(process.env.SM_META_URL,process.env.SM_META_ALL_URL,'SM_META_URL','SM_META_ALL_URL'),
    Google:sourceConfig(process.env.SM_GOOGLE_URL,process.env.SM_GOOGLE_ALL_URL,'SM_GOOGLE_URL','SM_GOOGLE_ALL_URL'),
    Snapchat:sourceConfig(process.env.SM_SNAPCHAT_URL,process.env.SM_SNAPCHAT_ALL_URL,'SM_SNAPCHAT_URL','SM_SNAPCHAT_ALL_URL'),
    TikTok:sourceConfig(process.env.SM_TIKTOK_URL,process.env.SM_TIKTOK_ALL_URL,'SM_TIKTOK_URL','SM_TIKTOK_ALL_URL'),
    LinkedIn:sourceConfig(process.env.SM_LINKEDIN_URL,process.env.SM_LINKEDIN_ALL_URL,'SM_LINKEDIN_URL','SM_LINKEDIN_ALL_URL')
  };

  const out={};
  await Promise.all(Object.entries(liveSources).map(async([name,cfg])=>{
    if(!cfg.url){
      out[name]={ok:false,error:'Missing Supermetrics URL',refreshMode:'30min',queryScope:cfg.scope,sourceEnv:cfg.sourceEnv};
      return;
    }
    try{
      const url=buildFreshSupermetricsUrl(cfg.url,range);
      const r=await fetch(url,{
        cache:'no-store',
        headers:{
          'Cache-Control':'no-cache, no-store, max-age=0',
          Pragma:'no-cache'
        }
      });
      const text=await r.text();
      if(!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0,240)}`);
      let data=JSON.parse(text);
      const diagnostics=supermetricsDiagnostics(data,range);
      if(name==='LinkedIn') data=normalizeLinkedInPayload(data);
      out[name]={
        ok:true,data,refreshMode:'30min',queryScope:cfg.scope,sourceEnv:cfg.sourceEnv,
        diagnostics
      };
    }catch(e){
      out[name]={ok:false,error:String(e?.message||e),refreshMode:'30min',queryScope:cfg.scope,sourceEnv:cfg.sourceEnv};
    }
  }));

  try{
    const proto=req.headers['x-forwarded-proto']||'https';
    const host=req.headers.host;
    const qs=`?start_date=${encodeURIComponent(range.start)}&end_date=${encodeURIComponent(range.end)}`;
    const dailyUrl=`${proto}://${host}/api/daily${qs}`;
    const r=await fetch(dailyUrl,{cache:'no-store'});
    const daily=await r.json();
    out.Pinterest={...(daily.sources?.Pinterest||{ok:false,error:'Daily source unavailable'}),refreshMode:'daily'};
    out.X={...(daily.sources?.X||{ok:false,error:'Daily source unavailable'}),refreshMode:'daily'};
  }catch(e){
    out.Pinterest={ok:false,error:String(e?.message||e),refreshMode:'daily',queryScope:'unknown'};
    out.X={ok:false,error:String(e?.message||e),refreshMode:'daily',queryScope:'unknown'};
  }

  // Vercel can cache the assembled dashboard payload for 30 minutes, while
  // each Supermetrics upstream request itself is forced fresh when this runs.
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=1800, stale-while-revalidate=300');
  res.setHeader('Vercel-CDN-Cache-Control','max-age=1800');
  res.status(200).json({
    dashboardScope:'all-campaigns',
    updatedAt:new Date().toISOString(),
    dateRange:{start_date:range.start,end_date:range.end,custom:range.custom},
    sources:out,
    refreshPolicy:{every30Minutes:['Meta','Google','Snapchat','TikTok','LinkedIn'],daily:['Pinterest','X']}
  });
}
