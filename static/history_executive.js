(function(){
  'use strict';
  const root=document.querySelector('[data-history-executive]');
  if(!root) return;

  const tabs=[...root.querySelectorAll('[data-history-tab]')];
  const panels=[...root.querySelectorAll('[data-history-panel]')];
  tabs.forEach(btn=>btn.addEventListener('click',()=>{
    const target=btn.dataset.historyTab;
    tabs.forEach(x=>x.classList.toggle('active',x===btn));
    panels.forEach(x=>x.hidden=x.dataset.historyPanel!==target);
  }));

  const rows=[...root.querySelectorAll('.hx-movement-row')];
  const search=document.getElementById('hxSearch');
  const type=document.getElementById('hxTypeFilter');
  const source=document.getElementById('hxSourceFilter');
  const dateFrom=document.getElementById('hxDateFrom');
  const dateTo=document.getElementById('hxDateTo');
  const reset=document.getElementById('hxReset');
  const exportBtn=document.getElementById('hxExport');
  const prev=document.getElementById('hxPrev');
  const next=document.getElementById('hxNext');
  const pages=document.getElementById('hxPages');
  const pageSize=document.getElementById('hxPageSize');
  const status=document.getElementById('hxStatus');
  const empty=document.getElementById('hxNoResults');
  const table=document.getElementById('hxMovementTable');
  let currentPage=1;
  let sortKey='date';
  let sortDirection='desc';
  let filtered=[];

  function haystack(row){
    return [row.dataset.product,row.dataset.productId,row.dataset.location,row.dataset.sourceText,row.dataset.reference,row.dataset.details,row.textContent].join(' ').toLowerCase();
  }
  function numeric(v){const n=Number(v);return Number.isFinite(n)?n:0;}
  function compare(a,b,key){
    let av='',bv='';
    if(key==='date'){av=a.dataset.created||'';bv=b.dataset.created||'';}
    else if(key==='type'){av=a.dataset.type||'';bv=b.dataset.type||'';}
    else if(key==='product'){av=a.dataset.product||'';bv=b.dataset.product||'';}
    else if(key==='productId'){av=a.dataset.productId||'';bv=b.dataset.productId||'';}
    else if(key==='qty'){av=numeric(a.dataset.qty);bv=numeric(b.dataset.qty);return av-bv;}
    else if(key==='location'){av=a.dataset.location||'';bv=b.dataset.location||'';}
    else if(key==='source'){av=a.dataset.sourceText||'';bv=b.dataset.sourceText||'';}
    return String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:'base'});
  }
  function visibleRows(){
    const q=(search?.value||'').trim().toLowerCase();
    const movement=type?.value||'';
    const src=source?.value||'';
    const from=dateFrom?.value||'';
    const to=dateTo?.value||'';
    filtered=rows.filter(row=>{
      if(q && !haystack(row).includes(q)) return false;
      if(movement && row.dataset.type!==movement) return false;
      if(src && row.dataset.source!==src) return false;
      const d=row.dataset.date||'';
      if(from && d && d<from) return false;
      if(to && d && d>to) return false;
      return true;
    }).sort((a,b)=>{
      const result=compare(a,b,sortKey);
      return sortDirection==='asc'?result:-result;
    });
  }
  function renderPages(totalPages){
    if(!pages) return;
    pages.innerHTML='';
    if(totalPages<=1) return;
    const candidates=[];
    for(let i=1;i<=totalPages;i++){
      if(i===1||i===totalPages||Math.abs(i-currentPage)<=2) candidates.push(i);
    }
    let last=0;
    candidates.forEach(page=>{
      if(last && page-last>1){const dots=document.createElement('span');dots.textContent='…';dots.style.padding='0 3px';pages.appendChild(dots);}
      const b=document.createElement('button');b.type='button';b.textContent=page;b.classList.toggle('active',page===currentPage);b.addEventListener('click',()=>{currentPage=page;render();});pages.appendChild(b);last=page;
    });
  }
  function render(){
    visibleRows();
    const size=Math.max(1,Number(pageSize?.value||10));
    const totalPages=Math.max(1,Math.ceil(filtered.length/size));
    currentPage=Math.min(Math.max(1,currentPage),totalPages);
    rows.forEach(row=>row.hidden=true);
    const start=(currentPage-1)*size;
    const shown=filtered.slice(start,start+size);
    shown.forEach(row=>row.hidden=false);
    if(status){
      const from=filtered.length?start+1:0;
      const to=Math.min(start+size,filtered.length);
      status.textContent=`Showing ${from} to ${to} of ${filtered.length} movements`;
    }
    if(empty) empty.hidden=filtered.length!==0;
    if(prev) prev.disabled=currentPage<=1;
    if(next) next.disabled=currentPage>=totalPages;
    renderPages(totalPages);
  }
  [search,type,source,dateFrom,dateTo,pageSize].filter(Boolean).forEach(el=>el.addEventListener(el===search?'input':'change',()=>{currentPage=1;render();}));
  prev?.addEventListener('click',()=>{if(currentPage>1){currentPage--;render();}});
  next?.addEventListener('click',()=>{const size=Number(pageSize?.value||10);if(currentPage<Math.ceil(filtered.length/size)){currentPage++;render();}});
  reset?.addEventListener('click',()=>{if(search)search.value='';if(type)type.value='';if(source)source.value='';if(dateFrom)dateFrom.value='';if(dateTo)dateTo.value='';currentPage=1;render();});
  table?.querySelectorAll('th[data-sort-key]').forEach(th=>th.addEventListener('click',()=>{const key=th.dataset.sortKey;if(sortKey===key)sortDirection=sortDirection==='asc'?'desc':'asc';else{sortKey=key;sortDirection=key==='date'?'desc':'asc';}currentPage=1;render();}));

  function csvCell(value){const s=String(value??'').replace(/\r?\n/g,' ').trim();return `"${s.replace(/"/g,'""')}"`;}
  exportBtn?.addEventListener('click',()=>{
    visibleRows();
    const header=['Date & Time','Movement','Product','Product ID','Quantity','Before','After','Location','Source / Reference','Details'];
    const lines=[header.map(csvCell).join(',')];
    filtered.forEach(row=>{
      const cells=[...row.cells].map(cell=>cell.innerText.trim());
      lines.push(cells.map(csvCell).join(','));
    });
    const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`NUNES_Stock_History_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  });

  render();
})();
