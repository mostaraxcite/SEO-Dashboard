(()=>{
  function relabel(){
    const root=document.getElementById('bitlyPanel');
    if(!root)return;

    root.querySelectorAll('.b-label, th, label, .bitly-warning, .note').forEach(el=>{
      const t=(el.textContent||'').trim();
      if(t==='إجمالي نقرات Bitly') el.textContent='إجمالي تفاعلات Bitly';
      else if(t==='النقرات') el.textContent='التفاعلات';
      else if(t.includes('Bitly رفض بيانات النقرات')) el.innerHTML=el.innerHTML.replace('بيانات النقرات','بيانات التفاعلات');
      else if(t.includes('النقرات وصلت، لكن تفاصيل المدن')) el.textContent='التفاعلات وصلت. تفاصيل المدن في Bitly مبنية على نقرات الرابط فقط وقد تتطلب خطة تدعم City metrics.';
    });

    const note=document.getElementById('bitlyNote');
    if(note && note.textContent.includes('النقرات والمدن')){
      note.textContent=note.textContent.replace('النقرات والمدن','التفاعلات والمدن');
    }
  }

  relabel();
  const obs=new MutationObserver(relabel);
  obs.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
})();
