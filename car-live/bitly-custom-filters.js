(()=>{
  const STORAGE_KEY='jazeeraBitlyNamedFiltersV1';
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function readFilters(){
    try{
      const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
      return Array.isArray(parsed)?parsed.filter(x=>x&&x.name&&Array.isArray(x.terms)&&x.terms.length):[];
    }catch(_){return [];}
  }
  function writeFilters(filters){localStorage.setItem(STORAGE_KEY,JSON.stringify(filters));}
  function valueFor(filter){return filter.terms.map(v=>String(v).trim()).filter(Boolean).join('|');}

  function ensureOption(select,filter){
    const id=String(filter.id);
    let option=[...select.options].find(o=>o.dataset.bitlyCustomId===id);
    if(!option){
      option=document.createElement('option');
      option.dataset.bitlyCustomId=id;
      select.appendChild(option);
    }
    option.value=valueFor(filter);
    option.textContent=filter.name;
    return option;
  }

  function install(){
    const select=document.getElementById('bitlyCampaignTag');
    if(!select||document.getElementById('bitlyAddNamedFilter')) return false;

    let filters=readFilters();
    filters.forEach(f=>ensureOption(select,f));

    const add=document.createElement('button');
    add.id='bitlyAddNamedFilter';add.type='button';add.className='bf-custom-add';add.textContent='+ إضافة فلتر';
    const del=document.createElement('button');
    del.id='bitlyDeleteNamedFilter';del.type='button';del.className='bf-custom-delete';del.textContent='حذف الفلتر';del.style.display='none';
    const group=select.closest('.bf-group');
    group?.after(del);group?.after(add);

    const style=document.createElement('style');
    style.textContent=`
      .bitly-filter .bf-custom-add{background:#101828;color:#fff;border-color:#101828}.bitly-filter .bf-custom-delete{color:#b42318;border-color:#f3c4c4;background:#fff}
      .bitly-filter-modal{position:fixed;inset:0;z-index:100100;background:rgba(16,24,40,.55);display:none;align-items:center;justify-content:center;padding:18px;direction:rtl}
      .bitly-filter-card{width:min(560px,96vw);background:#fff;border-radius:18px;padding:22px;box-shadow:0 24px 70px rgba(16,24,40,.25);font-family:Tajawal,Arial,sans-serif}
      .bitly-filter-card h3{font-size:20px;margin:0 0 6px}.bitly-filter-help{font-size:12px;color:#667085;line-height:1.8;margin-bottom:16px}
      .bitly-filter-field{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}.bitly-filter-field label{font-size:12px;font-weight:800;color:#344054}.bitly-filter-field input{height:40px;border:1px solid #d7dee8;border-radius:9px;padding:0 10px;font-family:Tajawal,Arial,sans-serif;outline:none}.bitly-filter-field input:focus{border-color:#078dcc;box-shadow:0 0 0 3px rgba(7,141,204,.10)}
      .bitly-filter-actions{display:flex;gap:8px;margin-top:16px}.bitly-filter-actions button{height:38px;border-radius:9px;padding:0 16px;border:1px solid #d7dee8;background:#fff;font-family:Tajawal,sans-serif;font-weight:800;cursor:pointer}.bitly-filter-actions .save{background:#078dcc;border-color:#078dcc;color:#fff}
    `;
    document.head.appendChild(style);

    const modal=document.createElement('div');
    modal.id='bitlyNamedFilterModal';modal.className='bitly-filter-modal';
    modal.innerHTML=`<div class="bitly-filter-card"><h3>إضافة فلتر روابط</h3><div class="bitly-filter-help">اكتب اسم الفلتر الذي سيظهر في القائمة، ثم كلمات المطابقة. يبحث الفلتر داخل اسم الرابط، الرابط المختصر، الرابط الأصلي وBitly Tags. يمكن كتابة أكثر من كلمة مفصولة بفاصلة.</div><div class="bitly-filter-field"><label>اسم الفلتر</label><input id="bitlyNamedFilterName" placeholder="مثال: روابط الفروع"></div><div class="bitly-filter-field"><label>كلمات المطابقة</label><input id="bitlyNamedFilterTerms" placeholder="مثال: locations, branch, فروع"></div><div class="bitly-filter-actions"><button id="bitlyNamedFilterSave" class="save" type="button">حفظ الفلتر</button><button id="bitlyNamedFilterCancel" type="button">إلغاء</button></div></div>`;
    document.body.appendChild(modal);

    function selectedCustom(){return select.selectedOptions?.[0]?.dataset?.bitlyCustomId||'';}
    function syncDelete(){del.style.display=selectedCustom()?'inline-flex':'none';}
    function close(){modal.style.display='none';}

    add.addEventListener('click',()=>{
      document.getElementById('bitlyNamedFilterName').value='';
      document.getElementById('bitlyNamedFilterTerms').value='';
      modal.style.display='flex';
      setTimeout(()=>document.getElementById('bitlyNamedFilterName')?.focus(),0);
    });
    document.getElementById('bitlyNamedFilterCancel').addEventListener('click',close);
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
    document.getElementById('bitlyNamedFilterSave').addEventListener('click',()=>{
      const name=document.getElementById('bitlyNamedFilterName').value.trim();
      const terms=document.getElementById('bitlyNamedFilterTerms').value.split(',').map(v=>v.trim()).filter(Boolean);
      if(!name){alert('اكتب اسم الفلتر');return;}
      if(!terms.length){alert('اكتب كلمة مطابقة واحدة على الأقل');return;}
      const filter={id:'bf_'+Date.now(),name,terms};
      filters.push(filter);writeFilters(filters);
      const option=ensureOption(select,filter);
      select.value=option.value;
      close();syncDelete();
      select.dispatchEvent(new Event('change',{bubbles:true}));
    });
    del.addEventListener('click',()=>{
      const id=selectedCustom();if(!id)return;
      const option=select.selectedOptions?.[0];
      if(!confirm(`حذف فلتر ${option?.textContent||''}؟`))return;
      filters=filters.filter(f=>String(f.id)!==String(id));writeFilters(filters);
      option?.remove();select.value='all';syncDelete();
      select.dispatchEvent(new Event('change',{bubbles:true}));
    });
    select.addEventListener('change',syncDelete);
    syncDelete();
    return true;
  }

  if(!install()){
    let tries=0;
    const timer=setInterval(()=>{tries++;if(install()||tries>40)clearInterval(timer);},100);
  }
})();
