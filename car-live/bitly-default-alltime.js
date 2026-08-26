(()=>{
  let done=false;
  function setDefaultAllTime(){
    if(done) return true;
    const panel=document.getElementById('bitlyPanel');
    const btn=document.getElementById('bitlyAllTime');
    if(!panel||!btn) return false;

    done=true;
    // Bitly's link detail card shows lifetime engagements by default. The
    // dashboard used to inherit the advertising date range, which could make
    // a link with lifetime engagements appear as 0. Force the Bitly section
    // to start on lifetime data; date buttons remain fully usable afterwards.
    setTimeout(()=>btn.click(),0);

    const note=document.createElement('div');
    note.id='bitlyDefaultRangeNote';
    note.style.cssText='font-size:10px;color:#667085;margin-top:4px';
    note.textContent='الافتراضي: كل مدة الرابط · غيّر التاريخ من فلاتر الروابط عند الحاجة';
    const head=document.querySelector('#bitlyPanel .panel-head > div');
    if(head&&!document.getElementById('bitlyDefaultRangeNote')) head.appendChild(note);
    return true;
  }

  if(!setDefaultAllTime()){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(setDefaultAllTime()||tries>60) clearInterval(timer);
    },100);
  }
})();
