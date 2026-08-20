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

function sourceConfig(allUrl,standardUrl){
  if(allUrl) return {url:allUrl,scope:'all-campaigns'};
  if(standardUrl) return {url:standardUrl,scope:'all-campaigns'};
  return {url:null,scope:'missing'};
}

async function pull(name,cfg,range){
  if(!cfg.url){
    return {ok:false,error:'Missing Supermetrics URL',stale:false,queryScope:cfg.scope};
  }
  try{
    const url=withDateRange(cfg.url,range);
    const r=await fetch(url,{cache:'no-store'});
    const text=await r.text();
    if(!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0,220)}`);
    return {ok:true,data:JSON.parse(text),stale:false,queryScope:cfg.scope};
  }catch(e){
    return {ok:false,error:String(e?.message||e),stale:false,queryScope:cfg.scope};
  }
}

export default async function handler(req,res){
  const range=getDateRange(req);
  if(range.error){
    res.status(400).json({error:range.error});
    return;
  }

  const pinterestCfg=sourceConfig(process.env.SM_PINTEREST_ALL_URL,process.env.SM_PINTEREST_URL);
  const xCfg=sourceConfig(process.env.SM_X_ALL_URL,process.env.SM_X_URL);

  const [Pinterest,X]=await Promise.all([
    pull('Pinterest',pinterestCfg,range),
    pull('X',xCfg,range)
  ]);

  res.setHeader('Cache-Control','public, max-age=0, s-maxage=86400, stale-while-revalidate=3600');
  res.setHeader('Vercel-CDN-Cache-Control','max-age=86400');
  res.status(200).json({
    dashboardScope:'all-campaigns',
    updatedAt:new Date().toISOString(),
    dateRange:{start_date:range.start,end_date:range.end,custom:range.custom},
    refreshMode:'daily',
    sources:{Pinterest,X}
  });
}
