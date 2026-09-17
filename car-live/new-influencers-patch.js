(()=>{
  const previousFetch=window.fetch.bind(window);
  const CATEGORY_OVERRIDES={ohoud:'Mega',wejdan:'Mega','taghtiyat-abha':'Micro'};
  const TARGET_IDS=new Set(Object.keys(CATEGORY_OVERRIDES));
  const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const num=v=>finite(v)?Number(v):null;

  function isInfluencersRequest(url){
    try{
      const u=new URL(typeof url==='string'?url:url?.url||'',location.origin);
      return u.origin===location.origin&&u.pathname==='/api/influencers';
    }catch(_){return false;}
  }

  function hasMetrics(post){
    return !!post&&['views','likes','comments','shares','saves'].some(k=>finite(post[k]));
  }

  function addKnown(arr,key){
    const vals=arr.map(x=>num(x?.[key])).filter(Number.isFinite);
    return vals.length?vals.reduce((a,b)=>a+b,0):null;
  }

  function aggregate(posts=[]){
    const views=addKnown(posts,'views');
    const reach=addKnown(posts,'reach');
    const likes=addKnown(posts,'likes');
    const comments=addKnown(posts,'comments');
    const shares=addKnown(posts,'shares');
    const saves=addKnown(posts,'saves');
    const clicks=addKnown(posts,'clicks');
    const directEngagement=addKnown(posts,'engagement');
    const parts=[likes,comments,shares,saves].filter(Number.isFinite);
    const engagement=directEngagement!==null?directEngagement:(parts.length?parts.reduce((a,b)=>a+b,0):null);
    return {views,reach,likes,comments,shares,saves,engagement,clicks};
  }

  function rate(cost,value){
    return Number.isFinite(cost)&&Number.isFinite(value)&&value>0?cost/value:null;
  }

  function recalc(data){
    for(const item of data.influencers||[]){
      if(CATEGORY_OVERRIDES[item.id]) item.category=CATEGORY_OVERRIDES[item.id];
      item.metrics=aggregate(item.posts||[]);
      item.cpv=rate(item.cost,item.metrics.views);
      item.cpe=rate(item.cost,item.metrics.engagement);
      item.cpc=rate(item.cost,item.metrics.clicks);
      item.metricsAvailable=(item.posts||[]).some(p=>p?.available||hasMetrics(p));
    }

    const totalCost=(data.influencers||[]).reduce((s,i)=>s+(Number.isFinite(i.cost)?i.cost:0),0);
    const totals=aggregate((data.influencers||[]).map(i=>i.metrics||{}));
    const engagementRate=Number.isFinite(totals.engagement)&&Number.isFinite(totals.views)&&totals.views>0
      ?totals.engagement/totals.views:null;
    data.totals={
      ...(data.totals||{}),cost:totalCost,...totals,engagementRate,
      cpv:rate(totalCost,totals.views),cpe:rate(totalCost,totals.engagement),cpc:rate(totalCost,totals.clicks)
    };
    data.categoryCounts=(data.influencers||[]).reduce((acc,i)=>{
      const c=String(i.category||'UGC');
      acc[c]=(acc[c]||0)+1;
      return acc;
    },{Mega:0,Micro:0,UGC:0});
  }

  function mergeSupplement(item,supp){
    if(!item||!supp?.available) return;
    let post=(item.posts||[]).find(p=>p?.platform==='tiktok');
    if(!post){
      post={platform:'tiktok',url:supp.originalUrl||supp.url||null,clicks:null};
      item.posts=item.posts||[];
      item.posts.push(post);
    }
    for(const key of ['views','likes','comments','shares','saves','reach','engagement']){
      if(finite(supp[key])) post[key]=Number(supp[key]);
    }
    post.url=supp.url||post.url||supp.originalUrl||null;
    post.available=true;
    post.source='socialcrawl-tiktok-post';
  }

  function responseWithJson(original,data){
    const headers=new Headers(original.headers);
    headers.set('Content-Type','application/json');
    headers.set('X-New-Influencers-Patch','1');
    return new Response(JSON.stringify(data),{status:original.status,statusText:original.statusText,headers});
  }

  window.fetch=async(input,init)=>{
    if(!isInfluencersRequest(input)) return previousFetch(input,init);

    const response=await previousFetch(input,init);
    if(!response.ok) return response;
    const data=await response.clone().json().catch(()=>null);
    if(!data?.ok||!Array.isArray(data.influencers)) return response;

    for(const item of data.influencers){
      if(CATEGORY_OVERRIDES[item.id]) item.category=CATEGORY_OVERRIDES[item.id];
    }

    const missing=data.influencers
      .filter(i=>TARGET_IDS.has(i.id))
      .filter(i=>!(i.posts||[]).some(p=>p?.platform==='tiktok'&&hasMetrics(p)))
      .map(i=>i.id);

    if(missing.length){
      try{
        const q=new URLSearchParams({ids:missing.join(',')});
        const r=await previousFetch(`/api/new-influencers-tiktok?${q}`,{cache:'default'});
        const supplement=await r.json().catch(()=>({}));
        if(r.ok&&supplement?.ok&&Array.isArray(supplement.results)){
          const byId=new Map(supplement.results.map(x=>[x.id,x]));
          for(const item of data.influencers){
            const extra=byId.get(item.id);
            if(extra) mergeSupplement(item,extra);
          }
          data.newInfluencersSocialCrawl={
            successful:supplement.successful,
            total:supplement.total,
            creditsUsed:supplement.creditsUsed,
            updatedAt:supplement.updatedAt
          };
        }
      }catch(_){}
    }

    recalc(data);
    return responseWithJson(response,data);
  };
})();
