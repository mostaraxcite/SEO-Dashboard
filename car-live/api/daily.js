const FALLBACK={
  Pinterest:{
    meta:{status_code:'FALLBACK',note:'Last known successful dashboard values'},
    data:[
      ['Campaign','Currency','Cost','Impressions','Reach','Pin clicks','CTR','CPM','CPC'],
      ['bmw-car-raffle','USD',492.36,1122225,0,1758,0.0015665,0.4387,0.2801]
    ]
  },
  X:{
    meta:{status_code:'FALLBACK',note:'Last known successful dashboard values'},
    data:[
      ['Campaign','Currency','Cost','Impressions','Reach','Link clicks','CTR','CPM','CPC'],
      ['X-Bmw-Car-2026','USD',646.57,696913,0,478,0.0006859,0.9278,1.3527]
    ]
  }
};

const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;

function getDateRange(req){
  const start=String(req.query?.start_date||'').trim();
  const end=String(req.query?.end_date||'').trim();
  if(!start&&!end) return {start:null,end:null,custom:false};
  if(!DATE_RE.test(start)||!DATE_RE.test(end)||start>end){
    return {error:'Invalid date range'};
  }
  return {start,end,custom:true};
}

function withDateRange(rawUrl,range){
  if(!range.custom) return rawUrl;
  const u=new URL(rawUrl);
  u.searchParams.set('json',JSON.stringify({start_date:range.start,end_date:range.end}));
  return u.toString();
}

async function pull(name,rawUrl,range){
  if(!rawUrl){
    if(range.custom) return {ok:false,error:'Missing environment variable',stale:false};
    return {ok:true,data:FALLBACK[name],stale:true,error:'Missing environment variable'};
  }
  try{
    const url=withDateRange(rawUrl,range);
    const r=await fetch(url,{cache:'no-store'});
    const text=await r.text();
    if(!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0,220)}`);
    return {ok:true,data:JSON.parse(text),stale:false};
  }catch(e){
    if(range.custom){
      return {ok:false,error:String(e?.message||e),stale:false};
    }
    return {ok:true,data:FALLBACK[name],stale:true,error:String(e?.message||e)};
  }
}

export default async function handler(req,res){
  const range=getDateRange(req);
  if(range.error){
    res.status(400).json({error:range.error});
    return;
  }

  const [Pinterest,X]=await Promise.all([
    pull('Pinterest',process.env.SM_PINTEREST_URL,range),
    pull('X',process.env.SM_X_URL,range)
  ]);

  // One cached Supermetrics request per selected date range every 24 hours.
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=86400, stale-while-revalidate=3600');
  res.setHeader('Vercel-CDN-Cache-Control','max-age=86400');
  res.status(200).json({
    updatedAt:new Date().toISOString(),
    dateRange:{start_date:range.start,end_date:range.end,custom:range.custom},
    refreshMode:'daily',
    sources:{Pinterest,X}
  });
}
