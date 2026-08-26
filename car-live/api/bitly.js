const BITLY_API='https://api-ssl.bitly.com/v4';
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;

const BUILTIN_PATTERNS={
  bmw:['bmw','car-r','car raffle','car-raffle','raffle','سيارة','السحب'],
  sealtec:['sealtec']
};

function norm(v){return String(v??'').toLowerCase().replace(/[_-]/g,' ').replace(/\s+/g,' ').trim();}
function uniq(a){return [...new Set(a.map(v=>norm(v)).filter(Boolean))];}
function getRange(req){
  const start=String(req.query?.start_date||'').trim();
  const end=String(req.query?.end_date||'').trim();
  if(!start&&!end) return {unit:'day',units:-1,unitReference:null,start:null,end:null};
  if(!DATE_RE.test(start)||!DATE_RE.test(end)||start>end) return {error:'Invalid date range'};
  const startMs=new Date(`${start}T00:00:00Z`).getTime();
  const endMs=new Date(`${end}T23:59:59Z`).getTime();
  const units=Math.max(1,Math.ceil((endMs-startMs+1)/86400000));
  return {unit:'day',units,unitReference:new Date(endMs).toISOString(),start,end};
}
function metricQuery(range,size){
  const q=new URLSearchParams({unit:range.unit,units:String(range.units)});
  if(range.unitReference) q.set('unit_reference',range.unitReference);
  if(size) q.set('size',String(size));
  return q.toString();
}
function safeBitlinkPath(id){return String(id||'').split('/').map(encodeURIComponent).join('/');}
function linkText(link){return norm([link?.id,link?.link,link?.title,link?.long_url,...(link?.tags||[])].filter(Boolean).join(' '));}
function campaignPatterns(campaign){
  const built=BUILTIN_PATTERNS[campaign]||[];
  let extra=[];
  try{
    const cfg=JSON.parse(process.env.BITLY_CAMPAIGN_PATTERNS||'{}');
    if(Array.isArray(cfg?.[campaign])) extra=cfg[campaign];
  }catch(_){/* ignore invalid optional env */}
  return uniq([campaign,...built,...extra]);
}
function matchesCampaign(link,campaign){
  if(!campaign||campaign==='all') return true;
  const text=linkText(link);
  return campaignPatterns(campaign).some(p=>text.includes(p));
}
async function bitlyFetch(path,token){
  const r=await fetch(`${BITLY_API}${path}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},cache:'no-store'});
  const text=await r.text();
  let data=null;
  try{data=text?JSON.parse(text):{};}catch(_){data={message:text};}
  if(!r.ok){
    const err=new Error(data?.message||data?.description||`Bitly HTTP ${r.status}`);
    err.status=r.status;err.data=data;throw err;
  }
  return data;
}
async function getGroups(token){
  if(process.env.BITLY_GROUP_GUID) return [{guid:process.env.BITLY_GROUP_GUID,name:'Configured group'}];
  const data=await bitlyFetch('/groups',token);
  return (data?.groups||[]).filter(g=>g?.guid&&g?.is_active!==false);
}
async function getLinksForGroup(group,token){
  const q=new URLSearchParams({size:'100',archived:'off'});
  const data=await bitlyFetch(`/groups/${encodeURIComponent(group.guid)}/bitlinks?${q}`,token);
  return (data?.links||[]).map(link=>({...link,group_guid:group.guid,group_name:group.name||''}));
}
async function getLinkMetrics(link,range,token){
  const id=safeBitlinkPath(link.id||link.link);
  const qs=metricQuery(range);
  const cityQs=metricQuery(range,50);
  let summary=null,cities=null,cityError=null;
  try{summary=await bitlyFetch(`/bitlinks/${id}/clicks/summary?${qs}`,token);}catch(e){summary={total_clicks:0,error:e.message};}
  try{cities=await bitlyFetch(`/bitlinks/${id}/cities?${cityQs}`,token);}catch(e){cityError=e.message;}
  return {
    id:link.id,
    shortUrl:link.link||`https://${link.id}`,
    longUrl:link.long_url||'',
    title:link.title||link.id||'Bitly link',
    tags:link.tags||[],
    group:link.group_name||'',
    createdAt:link.created_at||'',
    clicks:Number(summary?.total_clicks||0),
    cities:Array.isArray(cities?.metrics)?cities.metrics.map(m=>({city:m.city||'Unknown',region:m.region||'',country:m.country||'',clicks:Number(m.clicks||0)})):[],
    otherCityClicks:Number(cities?.other_metrics?.other_city_clicks||0),
    noCityClicks:Number(cities?.other_metrics?.no_city_clicks||0),
    cityMetricsAvailable:!cityError,
    cityError
  };
}

export default async function handler(req,res){
  const token=String(process.env.BITLY_ACCESS_TOKEN||'').trim();
  if(!token){res.status(500).json({ok:false,error:'Missing BITLY_ACCESS_TOKEN'});return;}
  const range=getRange(req);
  if(range.error){res.status(400).json({ok:false,error:range.error});return;}
  const campaign=norm(req.query?.campaign||'all').replace(/\s+/g,'-');
  try{
    const groups=await getGroups(token);
    const groupLinks=(await Promise.all(groups.map(g=>getLinksForGroup(g,token)))).flat();
    const matched=groupLinks.filter(link=>matchesCampaign(link,campaign)).slice(0,30);
    const links=await Promise.all(matched.map(link=>getLinkMetrics(link,range,token)));
    const cityMap=new Map();
    for(const link of links){
      for(const c of link.cities){
        const key=[c.city,c.region,c.country].join('|');
        const prev=cityMap.get(key)||{city:c.city,region:c.region,country:c.country,clicks:0};
        prev.clicks+=c.clicks;cityMap.set(key,prev);
      }
    }
    const cities=[...cityMap.values()].sort((a,b)=>b.clicks-a.clicks);
    const totalClicks=links.reduce((s,l)=>s+l.clicks,0);
    const sorted=[...links].sort((a,b)=>b.clicks-a.clicks);
    const cityMetricsAvailable=links.some(l=>l.cityMetricsAvailable);
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=1800, stale-while-revalidate=300');
    res.status(200).json({
      ok:true,
      campaign,
      range:{start_date:range.start,end_date:range.end},
      groups:groups.map(g=>({guid:g.guid,name:g.name||''})),
      discoveredLinks:groupLinks.length,
      matchedLinks:links.length,
      totalClicks,
      topLink:sorted[0]||null,
      topCity:cities[0]||null,
      cities,
      cityMetricsAvailable,
      links:sorted,
      updatedAt:new Date().toISOString()
    });
  }catch(e){
    res.status(e?.status||500).json({ok:false,error:String(e?.message||e),details:e?.data||null});
  }
}
