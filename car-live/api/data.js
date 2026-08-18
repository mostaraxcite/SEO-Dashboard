export default async function handler(req,res){
  const sources={Meta:process.env.SM_META_URL,Google:process.env.SM_GOOGLE_URL,Pinterest:process.env.SM_PINTEREST_URL,Snapchat:process.env.SM_SNAPCHAT_URL,TikTok:process.env.SM_TIKTOK_URL,X:process.env.SM_X_URL};
  const out={};
  await Promise.all(Object.entries(sources).map(async([name,url])=>{
    if(!url){out[name]={ok:false,error:'Missing environment variable'};return;}
    try{
      const r=await fetch(url,{cache:'no-store'});
      const text=await r.text();
      if(!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0,160)}`);
      out[name]={ok:true,data:JSON.parse(text)};
    }catch(e){out[name]={ok:false,error:String(e?.message||e)}}
  }));
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.status(200).json({updatedAt:new Date().toISOString(),sources:out});
}
