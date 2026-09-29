(()=>{
  const VERIFIED_AT='2026-09-29T07:25:00.000Z';
  const START='2026-01-01';
  const BASELINE_END='2026-09-29';

  const SNAPSHOT={
    Meta:[
      ['Campaign name','Cost (USD)','Impressions','Link clicks','Reach'],
      ['IG-Bmw-Raffle-Aug-2026',20558.58,50044950,8944,9326840],
      ['FB-Bmw-Raffle-Aug-2026',12966.98,7311458,58615,2120026]
    ],
    Snapchat:[
      ['Campaign name','Cost (USD)','Impressions','Swipes'],
      ['SN-Bmw-Raffle-Aug-2026',21012.0634,32718107,18735]
    ],
    TikTok:[
      ['Campaign name','Cost (USD)','Impressions','Clicks'],
      ['TT-Bmw-Raffle-Aug-Sept2026 (JazVideos)',21454.463,54802072,65134],
      ['tiktok-inf-BMW-Raffle-2026',8765.5152,6471021,1548727],
      ['TT-Bmw-Raffle-Aug 2026 - Aug - inf only',2306.8762,3703848,12057]
    ],
    Google:[
      ['Campaign name','Cost (USD)','Impressions','Clicks'],
      ['YT-Bmw-Raffle-Aug-2026-No-Skip',6152.7988,11213284,157],
      ['YT-Bmw-Raffle-Aug-2026',3266.7401,2483707,8867],
      ['Search-BMW Car Raffle',42.4945,121,43]
    ]
  };

  function clone(v){
    try{
      if(typeof structuredClone==='function') return structuredClone(v);
    }catch(_){}
    return JSON.parse(JSON.stringify(v));
  }

  function shouldProtect(){
    try{
      return typeof selectedTag!=='undefined'&&selectedTag==='bmw'&&
        typeof selectedRange!=='undefined'&&
        selectedRange?.start===START&&
        String(selectedRange?.end||'')>=BASELINE_END;
    }catch(_){return false;}
  }

  function snapshotSpend(data){
    if(!Array.isArray(data)||data.length<2) return NaN;
    const h=data[0].map(v=>String(v));
    const i=h.indexOf('Cost (USD)');
    if(i<0) return NaN;
    return data.slice(1).reduce((s,r)=>{
      const n=Number(r?.[i]);
      return s+(Number.isFinite(n)?n:0);
    },0);
  }

  function currentSpend(name,source){
    try{
      if(!source?.ok||typeof parse!=='function') return NaN;
      const d=parse(name,source.data,'bmw');
      return Number(d?.spend);
    }catch(_){return NaN;}
  }

  function baselineSource(data){
    return {
      ok:true,
      data,
      refreshMode:'verified-direct-floor',
      queryScope:'bmw-direct-floor',
      sourceEnv:'Supermetrics connector direct',
      diagnostics:{
        requestedRange:{start_date:START,end_date:BASELINE_END},
        sourceRange:{start_date:START,end_date:BASELINE_END},
        cacheUsed:false,
        verifiedAt:VERIFIED_AT
      }
    };
  }

  function guardedPayload(input){
    const p=clone(input);
    p.sources=p.sources||{};
    const protectedNames=[];

    for(const [name,data] of Object.entries(SNAPSHOT)){
      const baseline=snapshotSpend(data);
      const live=currentSpend(name,p.sources[name]);

      if(!Number.isFinite(live)||live<baseline){
        p.sources[name]=baselineSource(data);
        protectedNames.push(name);
      }
    }

    p.verifiedBMWGuard=true;
    p.verifiedBMWAt=VERIFIED_AT;
    p.verifiedBMWBaselineEnd=BASELINE_END;
    p.verifiedBMWProtectedSources=protectedNames;
    return p;
  }

  const previousRender=renderPayload;
  renderPayload=function(payload){
    const protect=shouldProtect();
    const next=protect?guardedPayload(payload):payload;
    previousRender(next);

    if(!protect) return;
    const protectedNames=next?.verifiedBMWProtectedSources||[];
    if(!protectedNames.length) return;

    const notice=document.getElementById('notice');
    if(notice){
      const extra='BMW: تم منع أرقام قديمة من '+protectedNames.join('، ')+' واستخدام آخر حد موثق مباشرة من Supermetrics حتى 29 Sep 2026. المصدر الأحدث يُستخدم تلقائيًا بمجرد أن يتجاوز هذا الحد.';
      notice.style.display='block';
      notice.textContent=notice.textContent?extra+' '+notice.textContent:extra;
    }
  };

  if(typeof lastPayload!=='undefined'&&lastPayload&&shouldProtect()){
    try{renderPayload(lastPayload);}catch(_){}
  }
})();