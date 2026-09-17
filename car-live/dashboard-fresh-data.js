(()=>{
  const nativeFetch=window.fetch.bind(window);
  const BUCKET_MS=30*60*1000;

  window.fetch=(input,init={})=>{
    const raw=typeof input==='string'?input:(input&&typeof input.url==='string'?input.url:'');
    try{
      const u=new URL(raw,location.origin);
      if(u.origin===location.origin&&u.pathname==='/api/data'){
        // New cache key every 30 minutes. This breaks any old/stuck Vercel CDN
        // response while still preventing a Supermetrics request on every page refresh.
        u.searchParams.set('_sm_bucket',String(Math.floor(Date.now()/BUCKET_MS)));
        const nextInit={...init,cache:'no-store',headers:{...(init?.headers||{}),'Cache-Control':'no-cache'}};
        return nativeFetch(u.pathname+u.search,nextInit);
      }
    }catch(_){}
    return nativeFetch(input,init);
  };
})();
