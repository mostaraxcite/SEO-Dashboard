export default async function handler(req,res){
  const liveSources={
    Meta:process.env.SM_META_URL,
    Google:process.env.SM_GOOGLE_URL,
    Snapchat:process.env.SM_SNAPCHAT_URL,
    TikTok:process.env.SM_TIKTOK_URL
  };

  const out={};

  await Promise.all(Object.entries(liveSources).map(async([name,url])=>{
    if(!url){out[name]={ok:false,error:'Missing environment variable'};return;}
    try{
      const r=await fetch(url,{cache:'no-store'});
      const text=await r.text();
      if(!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0,160)}`);
      out[name]={ok:true,data:JSON.parse(text),refreshMode:'30min'};
    }catch(e){
      out[name]={ok:false,error:String(e?.message||e),refreshMode:'30min'};
    }
  }));

  try{
    const proto=req.headers['x-forwarded-proto']||'https';
    const host=req.headers.host;
    const dailyUrl=`${proto}://${host}/api/daily`;
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
    sources:out,
    refreshPolicy:{every30Minutes:['Meta','Google','Snapchat','TikTok'],daily:['Pinterest','X']}
  });
}
