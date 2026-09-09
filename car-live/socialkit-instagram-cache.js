(()=>{
  const nativeFetch=window.fetch.bind(window);
  window.fetch=(input,init)=>{
    const url=typeof input==='string'?input:(input&&typeof input.url==='string'?input.url:'');
    if(!url.includes('/api/instagram-public')) return nativeFetch(input,init);

    const next={...(init||{})};
    // The Instagram resolver controls its own 2-day / 14-day CDN cache windows.
    // Do not let the browser's previous `cache: no-store` option force a fresh
    // SocialKit-backed server execution on every dashboard view.
    delete next.cache;
    return nativeFetch(input,next);
  };
})();
