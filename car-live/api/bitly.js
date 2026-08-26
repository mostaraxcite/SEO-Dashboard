const BITLY_API='https://api-ssl.bitly.com/v4';
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const MAX_CONCURRENCY=4;
const MAX_LINKS=100;

const BUILTIN_PATTERNS={
  bmw:['bmw','car-r','car raffle','car-raffle','raffle','سيارة','السحب'],
  sealtec:['sealtec','sealtic']
};

function norm(v){return String(v??'').toLowerCase().replace(/[_-]/g,' ').replace(/\s+/g,' ').trim();}
function uniq(a){return [...new Set(a.map(v=>norm(v)).filter(Boolean))];}

function getRange(req){
  const start=String(req.query?.start_date||'').trim();
  const end=String(req.query?.end_date||'').trim();
  if(!start&&!end) return {unit:'day',units:-1,unitReference:null,start:null,end:null,allTime:true};
  if(!DATE_RE.test(start)||!DATE_RE.test(end)||start>end) return {error:'Invalid date range'};
  const startMs=new Date(`${start}T00:00:00Z`).getTime();
  const endMs=new Date(`${end}T23:59:59Z`).getTime();
  const units=Math.max(1,Math.ceil((endMs-startMs+1)/86400000));
  const unitReference=`${end}T23:59:59+0000`;
  return {unit:'day',units,unitReference,start,end,allTime:false};
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
  const raw=String(campaign||'');
  const direct=raw.split(/[|,]/).map(v=>norm(v)).filter(Boolean);
  const built=BUILTIN_PATTERNS[raw]||[];
  let extra=[];
  try{
    const cfg=JSON.parse(process.env.BITLY_CAMPAIGN_PATTERNS||'{}');
    if(Array.isArray(cfg?.[raw])) extra=cfg[raw];
  }catch(_){}
  return uniq([...direct,...built,...extra]);
}

function matchesCampaign(link,campaign){
  if(!campaign||campaign==='all') return true;
  const text=linkText(link);
  return campaignPatterns(campaign).some(p=>text.includes(p));
}

async function bitlyFetch(path,token){
  const r=await fetch(`${BITLY_API}${path}`,{
    headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},
    cache:'no-store'
  });
  const text=await r.text();
  let data={};
  try{data=text?JSON.parse(text):{};}catch(_){data={message:text};}
  if(!r.ok){
    const err=new Error(data?.message||data?.description||`Bitly HTTP ${r.status}`);
    err.status=r.status;
    err.data=data;
    throw err;
  }
  return data;
}

async function getGroups(token){
  if(process.env.BITLY_GROUP_GUID){
    return [{guid:process.env.BITLY_GROUP_GUID,name:'Configured group'}];
  }
  const data=await bitlyFetch('/groups',token);
  return (data?.groups||[]).filter(g=>g?.guid&&g?.is_active!==false);
}

async function getLinksForGroup(group,token){
  const out=[];
  let searchAfter='';
  for(let page=0;page<10&&out.length<500;page++){
    const q=new URLSearchParams({size:'100',archived:'off'});
    if(searchAfter) q.set('search_after',searchAfter);
    const data=await bitlyFetch(`/groups/${encodeURIComponent(group.guid)}/bitlinks?${q}`,token);
    const links=(data?.links||[]).map(link=>({...link,group_guid:group.guid,group_name:group.name||''}));
    out.push(...links);
    const next=data?.pagination?.search_after||data?.pagination?.next||'';
    if(!next||!links.length) break;
    searchAfter=String(next);
  }
  return out;
}

async function mapLimit(items,limit,worker){
  const out=new Array(items.length);
  let next=0;
  async function run(){
    while(true){
      const i=next++;
      if(i>=items.length) return;
      try{out[i]=await worker(items[i],i);}
      catch(e){out[i]={__workerError:String(e?.message||e)};}
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length||1)},run));
  return out;
}

async function getEngagementSummary(id,range,token){
  const qs=metricQuery(range);
  try{
    const data=await bitlyFetch(`/bitlinks/${id}/engagements/summary?${qs}`,token);
    const breakdown=data?.engagements||{};
    const total=Number(data?.total_engagements||0);
    return {
      totalEngagements:total,
      linkClicks:Number(breakdown?.clicks||0),
      scans:Number(breakdown?.scans||0),
      libButtonClicks:Number(breakdown?.lib_button_clicks||0),
      source:'engagements/summary',
      error:null
    };
  }catch(primaryError){
    try{
      const clicks=await bitlyFetch(`/bitlinks/${id}/clicks/summary?${qs}`,token);
      const count=Number(clicks?.total_clicks||0);
      return {
        totalEngagements:count,
        linkClicks:count,
        scans:0,
        libButtonClicks:0,
        source:'clicks/summary',
        error:null,
        fallbackFrom:String(primaryError?.message||primaryError)
      };
    }catch(fallbackError){
      return {
        totalEngagements:null,
        linkClicks:null,
        scans:null,
        libButtonClicks:null,
        source:null,
        error:String(fallbackError?.message||fallbackError),
        primaryError:String(primaryError?.message||primaryError),
        status:fallbackError?.status||primaryError?.status||null
      };
    }
  }
}

async function getCities(id,range,token){
  const qs=metricQuery(range,50);
  try{
    const data=await bitlyFetch(`/bitlinks/${id}/cities?${qs}`,token);
    const metrics=Array.isArray(data?.metrics)?data.metrics:[];
    return {
      cities:metrics.map(m=>({
        city:m.city||m.value||m.key||'Unknown',
        region:m.region||m.subregion||'',
        country:m.country||'',
        clicks:Number(m.clicks??m.value??0)
      })).filter(c=>c.clicks>0),
      otherCityClicks:Number(data?.other_metrics?.other_city_clicks||0),
      noCityClicks:Number(data?.other_metrics?.no_city_clicks||0),
      error:null
    };
  }catch(e){
    return {cities:[],otherCityClicks:0,noCityClicks:0,error:String(e?.message||e),status:e?.status||null};
  }
}

async function getLinkMetrics(link,range,token){
  const id=safeBitlinkPath(link.id||link.link);
  const summary=await getEngagementSummary(id,range,token);
  let city={cities:[],otherCityClicks:0,noCityClicks:0,error:null};
  if(Number(summary.linkClicks)>0){
    city=await getCities(id,range,token);
  }
  return {
    id:link.id,
    shortUrl:link.link||`https://${link.id}`,
    longUrl:link.long_url||'',
    title:link.title||link.id||'Bitly link',
    tags:link.tags||[],
    group:link.group_name||'',
    groupGuid:link.group_guid||'',
    createdAt:link.created_at||'',

    // Backward compatibility: the existing dashboard reads `clicks` as its main
    // number. Bitly's web app now labels that card as Engagements, so `clicks`
    // intentionally carries total_engagements for display parity with Bitly.
    clicks:summary.totalEngagements,
    engagements:summary.totalEngagements,
    linkClicks:summary.linkClicks,
    scans:summary.scans,
    libButtonClicks:summary.libButtonClicks,

    clickMetricSource:summary.source,
    clickError:summary.error,
    clickErrorStatus:summary.status||null,
    clickFallbackFrom:summary.fallbackFrom||null,
    cities:city.cities,
    otherCityClicks:city.otherCityClicks,
    noCityClicks:city.noCityClicks,
    cityMetricsAvailable:!city.error,
    cityError:city.error,
    cityErrorStatus:city.status||null
  };
}

export default async function handler(req,res){
  const token=String(process.env.BITLY_ACCESS_TOKEN||'').trim();
  if(!token){res.status(500).json({ok:false,error:'Missing BITLY_ACCESS_TOKEN'});return;}
  const range=getRange(req);
  if(range.error){res.status(400).json({ok:false,error:range.error});return;}
  const campaign=norm(req.query?.campaign||'all').replace(/\s+/g,'-');
  const requestedLimit=Math.max(1,Math.min(MAX_LINKS,Number(req.query?.limit)||50));

  try{
    const groups=await getGroups(token);
    const groupLinks=(await mapLimit(groups,MAX_CONCURRENCY,g=>getLinksForGroup(g,token))).flatMap(x=>Array.isArray(x)?x:[]);
    const matchedAll=groupLinks.filter(link=>matchesCampaign(link,campaign));
    const matched=matchedAll.slice(0,requestedLimit);

    const metrics=await mapLimit(matched,MAX_CONCURRENCY,link=>getLinkMetrics(link,range,token));
    const links=metrics.filter(x=>x&&!x.__workerError);

    const cityMap=new Map();
    for(const link of links){
      for(const c of link.cities||[]){
        const key=[c.city,c.region,c.country].join('|');
        const prev=cityMap.get(key)||{city:c.city,region:c.region,country:c.country,clicks:0};
        prev.clicks+=Number(c.clicks||0);
        cityMap.set(key,prev);
      }
    }

    const cities=[...cityMap.values()].sort((a,b)=>b.clicks-a.clicks);
    const linksWithMetrics=links.filter(l=>Number.isFinite(l.engagements));
    const metricErrors=links.filter(l=>l.clickError);
    const totalEngagements=linksWithMetrics.reduce((s,l)=>s+Number(l.engagements||0),0);
    const totalLinkClicks=linksWithMetrics.reduce((s,l)=>s+Number(l.linkClicks||0),0);
    const sorted=[...links].sort((a,b)=>(Number(b.engagements)||0)-(Number(a.engagements)||0));
    const cityMetricsAvailable=links.some(l=>l.cityMetricsAvailable&&Number(l.linkClicks)>0);
    const clickMetricsAvailable=linksWithMetrics.length>0;
    const groupsOut=groups.map(g=>({guid:g.guid,name:g.name||''}));

    res.setHeader('Cache-Control','public, max-age=0, s-maxage=300, stale-while-revalidate=60');
    res.status(200).json({
      ok:true,
      campaign,
      range:{start_date:range.start,end_date:range.end,all_time:range.allTime},
      groups:groupsOut,
      discoveredLinks:groupLinks.length,
      matchedLinks:matchedAll.length,
      returnedLinks:links.length,
      requestedLimit,

      // Compatibility with current UI plus explicit new fields.
      totalClicks:totalEngagements,
      totalEngagements,
      totalLinkClicks,
      clickMetricsAvailable,
      engagementMetricsAvailable:clickMetricsAvailable,

      metricErrors:metricErrors.slice(0,5).map(l=>({
        id:l.id,title:l.title,error:l.clickError,status:l.clickErrorStatus
      })),
      metricErrorCount:metricErrors.length,
      topLink:sorted.find(l=>Number(l.engagements)>0)||sorted[0]||null,
      topCity:cities[0]||null,
      cities,
      cityMetricsAvailable,
      links:sorted,
      updatedAt:new Date().toISOString(),
      diagnostics:{
        concurrency:MAX_CONCURRENCY,
        unit_reference:range.unitReference,
        primary_metric:'engagements/summary',
        note:'Displayed Bitly totals use total_engagements to match the Bitly web app. City metrics remain click-based.'
      }
    });
  }catch(e){
    res.status(e?.status||500).json({ok:false,error:String(e?.message||e),details:e?.data||null});
  }
}
