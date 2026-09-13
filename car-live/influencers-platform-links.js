(()=>{
  let applying=false;
  function platformKey(cell){
    const badge=cell?.querySelector('.platform-name');
    if(!badge) return '';
    if(badge.classList.contains('instagram')) return 'instagram';
    if(badge.classList.contains('tiktok')) return 'tiktok';
    if(badge.classList.contains('snapchat')) return 'snapchat';
    return String(badge.textContent||'').trim().toLowerCase();
  }
  function labelFor(platform,index,total){
    const base=platform==='instagram'?'Instagram':platform==='tiktok'?'TikTok':platform==='snapchat'?'Snapchat':platform||'Platform';
    return total>1?`${base} ${index+1}`:base;
  }
  function simplifyTable(){
    if(applying) return;
    const table=document.querySelector('#influencersPanel .influencers-table');
    if(!table||table.dataset.platformLinksCondensed==='1') return;
    applying=true;
    try{
      const header=[...table.querySelectorAll('thead th')].find(th=>String(th.textContent||'').trim()==='الروابط');
      if(header) header.remove();
      for(const tr of table.querySelectorAll('tbody tr')){
        const platformCell=[...tr.children].find(td=>td.querySelector?.('.platform-name'));
        const linksCell=[...tr.children].find(td=>td.querySelector?.('.platform-chips'));
        if(!platformCell||!linksCell) continue;
        const platform=platformKey(platformCell);
        const postLinks=[...linksCell.querySelectorAll('a[href]')].filter(a=>!a.classList.contains('profile-link'));
        if(postLinks.length){
          const wrap=document.createElement('div');
          wrap.className='platform-direct-links';
          postLinks.forEach((oldLink,index)=>{
            const a=document.createElement('a');
            a.href=oldLink.href;
            a.target='_blank';
            a.rel='noopener noreferrer';
            a.className=`platform-name platform-direct-link ${platform}`;
            a.textContent=labelFor(platform,index,postLinks.length);
            a.title='فتح البوست';
            wrap.appendChild(a);
          });
          platformCell.replaceChildren(wrap);
        }
        linksCell.remove();
      }
      for(const td of table.querySelectorAll('tbody td[colspan]')){
        const current=Number(td.getAttribute('colspan'));
        if(Number.isFinite(current)&&current>1) td.setAttribute('colspan',String(current-1));
      }
      table.dataset.platformLinksCondensed='1';
    }finally{applying=false;}
  }
  function injectCss(){
    if(document.getElementById('influencersPlatformLinksCss')) return;
    const style=document.createElement('style');
    style.id='influencersPlatformLinksCss';
    style.textContent=`#influencersPanel .platform-direct-links{display:flex;align-items:center;gap:5px;flex-wrap:wrap}#influencersPanel .platform-direct-link{text-decoration:none;cursor:pointer;transition:.15s ease}#influencersPanel .platform-direct-link:hover{transform:translateY(-1px);filter:brightness(.96);box-shadow:0 2px 6px rgba(16,24,40,.08)}#influencersPanel .influencers-table{min-width:1320px}`;
    document.head.appendChild(style);
  }
  function run(){injectCss();simplifyTable();}
  const observer=new MutationObserver(()=>queueMicrotask(run));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run,{once:true}); else run();
})();