(()=>{
  const SAR_PER_USD=3.75;
  const WHATSAPP_SAR=61056.20;
  const SMS_SAR=11109.72;
  const MESSAGING_SAR=WHATSAPP_SAR+SMS_SAR;

  function fmt(v){
    return Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  }

  function decorateBMWSpend(){
    try{
      if(typeof selectedTag==='undefined'||selectedTag!=='bmw') return;
      const el=document.getElementById('kSpend');
      if(!el) return;
      const text=String(el.textContent||'');
      const m=text.match(/\$\s*([\d,]+(?:\.\d+)?)/);
      if(!m) return;
      const adUsd=Number(m[1].replace(/,/g,''));
      if(!Number.isFinite(adUsd)) return;
      const totalUsd=adUsd+(MESSAGING_SAR/SAR_PER_USD);
      const totalSar=(adUsd*SAR_PER_USD)+MESSAGING_SAR;
      const card=el.closest('.kpi');
      const label=card&&card.querySelector('.lbl');
      if(label) label.textContent='إجمالي إنفاق حملة BMW';
      el.innerHTML='';
      const usd=document.createElement('div');
      usd.textContent='$'+fmt(totalUsd);
      const sar=document.createElement('div');
      sar.textContent=fmt(totalSar)+' ر.س';
      sar.style.cssText='font-size:15px;margin-top:5px;color:#101828';
      const note=document.createElement('div');
      note.textContent='يشمل الإعلانات + WhatsApp '+fmt(WHATSAPP_SAR)+' ر.س + SMS '+fmt(SMS_SAR)+' ر.س';
      note.style.cssText='font-family:Tajawal,Arial,sans-serif;font-size:10px;font-weight:500;color:#667085;margin-top:5px;line-height:1.5';
      el.append(usd,sar,note);
    }catch(_){ }
  }

  if(typeof renderPayload==='function'){
    const previousRender=renderPayload;
    renderPayload=function(payload){
      previousRender(payload);
      decorateBMWSpend();
    };
  }

  if(typeof lastPayload!=='undefined'&&lastPayload){
    try{renderPayload(lastPayload);}catch(_){ }
  }
})();
