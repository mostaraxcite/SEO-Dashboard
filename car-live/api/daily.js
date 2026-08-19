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

async function pull(name,url){
  if(!url) return {ok:true,data:FALLBACK[name],stale:true,error:'Missing environment variable'};
  try{
    const r=await fetch(url,{cache:'no-store'});
    const text=await r.text();
    if(!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0,220)}`);
    return {ok:true,data:JSON.parse(text),stale:false};
  }catch(e){
    return {ok:true,data:FALLBACK[name],stale:true,error:String(e?.message||e)};
  }
}

export default async function handler(req,res){
  const [Pinterest,X]=await Promise.all([
    pull('Pinterest',process.env.SM_PINTEREST_URL),
    pull('X',process.env.SM_X_URL)
  ]);

  // Cache this endpoint at Vercel CDN for 24 hours.
  // Dashboard refreshes can hit it repeatedly without creating new Supermetrics queries.
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=86400, stale-while-revalidate=3600');
  res.setHeader('Vercel-CDN-Cache-Control','max-age=86400');
  res.status(200).json({
    updatedAt:new Date().toISOString(),
    refreshMode:'daily',
    sources:{Pinterest,X}
  });
}
