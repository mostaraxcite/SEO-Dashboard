(()=>{
  const INITIAL_ROWS=5;

  function injectCss(){
    if(document.getElementById('bitlyShowMoreCss')) return;
    const style=document.createElement('style');
    style.id='bitlyShowMoreCss';
    style.textContent=`
      .bitly-show-more-wrap{display:flex;justify-content:center;padding:16px 0 4px}
      .bitly-show-more-btn{min-width:150px;height:40px;padding:0 18px;border:1px solid #d7dee8;border-radius:10px;background:#fff;color:#078dcc;font-family:Tajawal,sans-serif;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 1px 2px rgba(16,24,40,.04)}
      .bitly-show-more-btn:hover{background:#f4fbfe;border-color:#8bd1ef}
      .bitly-show-more-btn:focus{outline:none;box-shadow:0 0 0 3px rgba(7,148,210,.12)}
    `;
    document.head.appendChild(style);
  }

  function apply(){
    const body=document.getElementById('bitlyBody');
    const table=body?.querySelector('.bitly-table');
    const tbody=table?.querySelector('tbody');
    if(!body||!table||!tbody) return;

    const rows=[...tbody.querySelectorAll(':scope > tr')];
    const old=body.querySelector('.bitly-show-more-wrap');

    if(rows.length<=INITIAL_ROWS){
      rows.forEach(r=>r.style.display='');
      old?.remove();
      return;
    }

    if(old) return;

    let expanded=false;
    const control=document.createElement('div');
    control.className='bitly-show-more-wrap';
    const button=document.createElement('button');
    button.type='button';
    button.className='bitly-show-more-btn';
    control.appendChild(button);

    function renderState(){
      rows.forEach((row,index)=>{
        row.style.display=(expanded||index<INITIAL_ROWS)?'':'none';
      });
      const hidden=Math.max(rows.length-INITIAL_ROWS,0);
      button.textContent=expanded?'عرض أقل':`عرض المزيد (${hidden})`;
      button.setAttribute('aria-expanded',expanded?'true':'false');
    }

    button.addEventListener('click',()=>{
      expanded=!expanded;
      renderState();
    });

    const wrap=table.closest('.bitly-table-wrap')||table.parentElement;
    (wrap?.parentElement||body).insertBefore(control,wrap?.nextSibling||null);
    renderState();
  }

  function start(){
    injectCss();
    apply();
    const body=document.getElementById('bitlyBody');
    if(!body) return;
    let timer=null;
    const observer=new MutationObserver(()=>{
      clearTimeout(timer);
      timer=setTimeout(apply,40);
    });
    observer.observe(body,{childList:true,subtree:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(start,0),{once:true});
  else setTimeout(start,0);
})();
