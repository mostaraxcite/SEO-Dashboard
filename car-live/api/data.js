const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;

function getDateRange(req){
  const start=String(req.query?.start_date||'').trim();
  const end=String(req.query?.end_date||'').trim();
  if(!start&&!end) return {start:null,end:null,custom:false};
  if(!DATE_RE.test(start)||!DATE_RE.test(end)||start>end){
    return {error:'Invalid date range. Use YYYY-MM-DD and make sure start_date is before end_date.'};
  }
  return {start,end,custom:true};
}

function withDateRange(rawUrl,range){
  if(!range.custom) return rawUrl;
  const u=new URL(rawUrl);
  u.searchParams.set('json',JSON.stringify({start_date:range.start,end_date:range.end}));
  return u.toString();
}

export default async function handler(req,res){
  const range=getDateRange(req);
  if(range.error){
    res.status(400).json({error:range.error});
    return;
  }

  const liveSources={
    Meta:process.env.SM_META_URL,
    Google:process.env.SM_GOOGLE_URL,
    Snapchat:process.env.SM_SNAPCHAT_URL,
    TikTok:process.env.SM_TIKTOK_URL
  };

  const out={};

  await Promise.all(Object.entries(liveSources).map(async([name,rawUrl])=>{
    if(!rawUrl){
      out[name]={ok:false,error:'Missing environment variable',refreshMode:'30min'};
      return;
    }
    try{
      const url=withDateRange(rawUrl,range);
      const r=await fetch(url,{cache:'no-store'});
      const text=await r.text();
      if(!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0,200)}`);
      out[name]={ok:true,data:JSON.parse(text),refreshMode:'30min'};
    }catch(e){
      out[name]={ok:false,error:String(e?.message||e),refreshMode:'30min'};
    }
  }));

  try{
    const proto=req.headers['x-forwarded-proto']||'https';
    const host=req.headers.host;
    const qs=range.custom?`?start_date=${encodeURIComponent(range.start)}&end_date=${encodeURIComponent(range.end)}`:'';
    const dailyUrl=`${proto}://${host}/api/daily${qs}`;
    const r=await fetch(dailyUrl);
    const daily=await r.json();
    out.Pinterest={...(daily.sources?.Pinterest||{ok:false,error:'Daily cache unavailable'}),refreshMode:'daily'};
    out.X={...(daily.sources?.X||{ok:false,error:'Daily cache unavailable'}),refreshMode:'daily'};
  }catch(e){
    out.Pinterest={ok:false,error:String(e?.message||e),refreshMode:'daily'};
    out.X={ok:false,error:String(e?.message||e),refreshMode:'daily'};
  }

  res.setHeader('Cache-Control','public, max-age=0, s-maxage=1800, stale-while-revalidate=300');
  res.setHeader('Vercel-CDN-Cache-Control','max-age=1800');
  res.status(200).json({
    updatedAt:new Date().toISOString(),
    dateRange:{start_date:range.start,end_date:range.end,custom:range.custom},
    sources:out,
    refreshPolicy:{every30Minutes:['Meta','Google','Snapchat','TikTok'],daily:['Pinterest','X']}
  });
}
