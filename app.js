// Stock LGS PWA v5 (offline + sync)
(() => {
  const DB_NAME='presea_stock_pwa_v5', DB_VER=1;
  const $=id=>document.getElementById(id);
  const els={netPill:$('netPill'),syncPill:$('syncPill'),apiUrl:$('apiUrl'),sessionId:$('sessionId'),userName:$('userName'),
    createSession:$('createSession'),downloadCubo:$('downloadCubo'),file:$('file'),uploadCubo:$('uploadCubo'),clearLocal:$('clearLocal'),
    tabConteo:$('tabConteo'),tabRepos:$('tabRepos'),viewConteo:$('viewConteo'),viewRepos:$('viewRepos'),depWrap:$('depWrap'),
    f_rubro:$('f_rubro'),f_subrubro:$('f_subrubro'),f_filame:$('f_filame'),f_detalle:$('f_detalle'),f_sku:$('f_sku'),f_deposito:$('f_deposito'),
    search:$('search'),hideZero:$('hideZero'),onlyDiff:$('onlyDiff'),syncNow:$('syncNow'),
    k_items:$('k_items'),k_changes:$('k_changes'),k_pending:$('k_pending'),k_repos:$('k_repos'),
    exportControl:$('exportControl'),exportDiffs:$('exportDiffs'),status:$('status'),reposPill:$('reposPill'),
    tbodyConteo:$('tbodyConteo'),tbodyRepos:$('tbodyRepos')};
  let activeTab='conteo', cuboRows=[], edits=new Map(), reposListAll=[], skuIndex=new Map(), showOnlyDiff=false;

  const norm=s=>String(s??'').trim();
  const low=s=>norm(s).toLowerCase();
  const nowIso=()=>new Date().toISOString();
  const numOr0=x=>{const n=Number(String(x??'').replace(',','.'));return Number.isFinite(n)?n:0;};
  const keyOf=(sku,dep)=>`${norm(sku)}||${norm(dep)}`;

  function pill(el,t,cls){el.textContent=t;el.className='pill'+(cls?' '+cls:'');}
  function status(t,d=false){els.status.textContent=t;els.status.className='pill'+(d?' danger':'');}
  function detectDelim(s){const c=[';','\t',',','|'];let b=';',m=-1;for(const d of c){const sc=s.split(/\r?\n/)[0].split(d).length;if(sc>m){m=sc;b=d;}}return b;}

  function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VER);
    r.onupgradeneeded=()=>{const db=r.result; if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta',{keyPath:'k'});
      if(!db.objectStoreNames.contains('cubo')) db.createObjectStore('cubo',{keyPath:'k'});
      if(!db.objectStoreNames.contains('edits')) db.createObjectStore('edits',{keyPath:'k'});};
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);});}
  async function dbGet(st,key){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(st,'readonly');const rq=tx.objectStore(st).get(key);
    rq.onsuccess=()=>res(rq.result);rq.onerror=()=>rej(rq.error);});}
  async function dbPut(st,val){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(st,'readwrite');tx.objectStore(st).put(val);
    tx.oncomplete=()=>res(true);tx.onerror=()=>rej(tx.error);});}
  async function dbClearAll(){const db=await openDB();for(const s of ['meta','cubo','edits']) await new Promise((res,rej)=>{const tx=db.transaction(s,'readwrite');tx.objectStore(s).clear();tx.oncomplete=()=>res(true);tx.onerror=()=>rej(tx.error);});}

  async function saveMeta(){await dbPut('meta',{k:'apiUrl',v:els.apiUrl.value.trim()});await dbPut('meta',{k:'sessionId',v:els.sessionId.value.trim()});await dbPut('meta',{k:'userName',v:els.userName.value.trim()});}
  async function loadMeta(){const a=await dbGet('meta','apiUrl');const s=await dbGet('meta','sessionId');const u=await dbGet('meta','userName'); if(a?.v) els.apiUrl.value=a.v; if(s?.v) els.sessionId.value=s.v; if(u?.v) els.userName.value=u.v;}
  async function saveLocalCubo(rows){const sid=els.sessionId.value.trim(); if(!sid) throw new Error('Falta Session ID'); await dbPut('cubo',{k:sid,savedAt:nowIso(),rows});}
  async function saveLocalEdits(){const sid=els.sessionId.value.trim(); if(!sid) return; await dbPut('edits',{k:sid,savedAt:nowIso(),edits:Array.from(edits.values())});}
  async function loadLocalSession(){const sid=els.sessionId.value.trim(); if(!sid) return false; const c=await dbGet('cubo',sid); const e=await dbGet('edits',sid);
    cuboRows=c?.rows||[]; edits=new Map((e?.edits||[]).map(x=>[x.k,x])); if(cuboRows.length){rebuild(); cascade(); render(); status(`Cubo local cargado (${cuboRows.length})`); return true;} return false;}

  function setOpts(sel,vals,labelAll){sel.innerHTML=''; const o=document.createElement('option');o.value='__ALL__';o.textContent=labelAll;sel.appendChild(o);
    for(const v of vals){const oo=document.createElement('option');oo.value=v;oo.textContent=v===''?'(vacío)':v;sel.appendChild(oo);} }
  function filters(){return{rubro:els.f_rubro.value,subrubro:els.f_subrubro.value,filame:els.f_filame.value,detalle:els.f_detalle.value,sku:els.f_sku.value,deposito:els.f_deposito.value,q:low(els.search.value)};}
  function pass(sel,val){if(sel==='__ALL__') return true; const v=norm(val); if(sel==='(vacío)') return v===''; return v===sel;}
  function rowOk(r,st,dep=true){if(!pass(st.rubro,r.RUBRO)) return false; if(!pass(st.subrubro,r.SUBRUBRO)) return false; if(!pass(st.filame,r.B2C_FILAME)) return false;
    if(!pass(st.detalle,r.DETALLE)) return false; if(!pass(st.sku,r.COD_ALFA)) return false; if(dep && st.deposito!=='__ALL__' && norm(r.DEPOSITO)!==st.deposito) return false;
    if(st.q){const hay=(low(r.COD_ALFA)+' '+low(r.DETALLE)+' '+low(r.SUBRUBRO)+' '+low(r.RUBRO)+' '+low(r.B2C_FILAME)); if(!hay.includes(st.q)) return false;} return true;}
  function hideZero(stock){return els.hideZero.checked && stock===0;}

  function cascade(){const st=filters(); const rows=cuboRows; const f=(p)=>rows.filter(r=>rowOk(r,p,true));
    const rub=[...new Set(rows.map(r=>norm(r.RUBRO)))].sort(); setOpts(els.f_rubro,rub,'Todos'); els.f_rubro.value=(rub.includes(st.rubro)||st.rubro==='__ALL__')?st.rubro:'__ALL__';
    const st2={...st,rubro:els.f_rubro.value,subrubro:'__ALL__',filame:'__ALL__',detalle:'__ALL__',sku:'__ALL__'};
    const sub=[...new Set(f(st2).map(r=>norm(r.SUBRUBRO)))].sort(); setOpts(els.f_subrubro,sub,'Todos'); els.f_subrubro.value=(sub.includes(st.subrubro)||st.subrubro==='__ALL__')?st.subrubro:'__ALL__';
    const st3={...st2,subrubro:els.f_subrubro.value}; const fil=[...new Set(f(st3).map(r=>norm(r.B2C_FILAME)))].sort(); setOpts(els.f_filame,fil,'Todos'); els.f_filame.value=(fil.includes(st.filame)||st.filame==='__ALL__')?st.filame:'__ALL__';
    const st4={...st3,filame:els.f_filame.value}; const det=[...new Set(f(st4).map(r=>norm(r.DETALLE)))].sort().slice(0,600); setOpts(els.f_detalle,det,'Todos'); els.f_detalle.value=(det.includes(st.detalle)||st.detalle==='__ALL__')?st.detalle:'__ALL__';
    const st5={...st4,detalle:els.f_detalle.value}; const sk=[...new Set(f(st5).map(r=>norm(r.COD_ALFA)))].sort().slice(0,1200); setOpts(els.f_sku,sk,'Todos'); els.f_sku.value=(sk.includes(st.sku)||st.sku==='__ALL__')?st.sku:'__ALL__';
    const st6={...st5,sku:els.f_sku.value}; const dep=[...new Set(f(st6).map(r=>norm(r.DEPOSITO)))].filter(Boolean).sort((a,b)=>Number(a)-Number(b)); setOpts(els.f_deposito,dep,'Todos'); els.f_deposito.value=(dep.includes(st.deposito)||st.deposito==='__ALL__')?st.deposito:'__ALL__';
  }

  function buildIndex(){skuIndex=new Map(); for(const r of cuboRows){const sku=norm(r.COD_ALFA); if(!sku) continue; const dep=norm(r.DEPOSITO); const stock=numOr0(r.STOCK);
    if(!skuIndex.has(sku)) skuIndex.set(sku,{SKU:sku,RUBRO:norm(r.RUBRO),SUBRUBRO:norm(r.SUBRUBRO),B2C_FILAME:norm(r.B2C_FILAME),DETALLE:norm(r.DETALLE),stockByDep:new Map()});
    const o=skuIndex.get(sku); o.stockByDep.set(dep,stock); if(!o.DETALLE && norm(r.DETALLE)) o.DETALLE=norm(r.DETALLE);}}
  function isImp(r){const x=low(r); return x.includes('impres')||x.includes('printer');}
  function isFil(r){const x=low(r); return x.includes('filam')||x.includes('filament');}
  function repos(){reposListAll=[]; for(const [sku,o] of skuIndex.entries()){const d1=o.stockByDep.get('1')??0; const d12=o.stockByDep.get('12')??0; let u=null;
      if(isImp(o.RUBRO)) u=50; else if(isFil(o.RUBRO)) u=100; else continue; if(d1<u && d12>0) reposListAll.push({RUBRO:o.RUBRO,SUBRUBRO:o.SUBRUBRO,B2C_FILAME:o.B2C_FILAME,DETALLE:o.DETALLE,SKU:o.SKU,DEP1:d1,DEP12:d12,UMBRAL:u});}
    els.k_repos.textContent=String(reposListAll.length); pill(els.reposPill,reposListAll.length?`Reposición: ${reposListAll.length}`:'Reposición: sin pendientes',reposListAll.length?'warn':'ok');}
  function rebuild(){buildIndex(); repos();}

  function pendingCount(){let n=0; for(const e of edits.values()) if(e.pending) n++; return n;}
  function updatePills(){pill(els.netPill,navigator.onLine?'Red: online':'Red: offline',navigator.onLine?'ok':'warn');
    const p=pendingCount(); els.k_pending.textContent=String(p); pill(els.syncPill,p?`Sync: ${p} pendientes`:'Sync: OK',p?'warn':'ok');}
  function updateBtns(){const any=cuboRows.length>0; const anyEdit=edits.size>0;
    els.onlyDiff.disabled=!any; els.syncNow.disabled=!anyEdit||!navigator.onLine; els.exportControl.disabled=!anyEdit; els.exportDiffs.disabled=!anyEdit;
    els.onlyDiff.textContent=showOnlyDiff?'Ver todo':'Mostrar sólo con cambios'; els.k_changes.textContent=String(edits.size); updatePills();}

  function listIdx(){const st=filters(); const idx=[]; for(let i=0;i<cuboRows.length;i++){const r=cuboRows[i]; if(!rowOk(r,st,true)) continue;
      const stock=numOr0(r.STOCK); if(hideZero(stock) && stock>=0) continue;
      const k=keyOf(r.COD_ALFA,r.DEPOSITO); if(showOnlyDiff && !edits.has(k)) continue; idx.push(i);} return idx;}

  function renderConteo(){const idx=listIdx(); els.k_items.textContent=String(idx.length); els.tbodyConteo.innerHTML=''; const max=250;
    for(const i of idx.slice(0,max)){const r=cuboRows[i]; const sku=norm(r.COD_ALFA), dep=norm(r.DEPOSITO), k=keyOf(sku,dep); const stock=numOr0(r.STOCK);
      const tr=document.createElement('tr');
      const td=(t)=>{const x=document.createElement('td'); x.textContent=t; return x;};
      const tdDep=td(dep), tdSku=td(sku), tdDet=td(norm(r.DETALLE));
      const tdStock=document.createElement('td'); tdStock.style.textAlign='right'; tdStock.textContent=String(stock); if(stock<0) tdStock.innerHTML=`<span style="color:var(--danger);font-weight:950;">${stock}</span>`;
      const tdIn=document.createElement('td'); const inp=document.createElement('input'); inp.className='input-mini'; inp.type='number'; inp.step='1'; inp.inputMode='numeric'; inp.placeholder='—';
      const ex=edits.get(k); if(ex?.contado!==undefined) inp.value=ex.contado;
      const tdDiff=document.createElement('td'); tdDiff.className='diff-cell';
      const paint=(v)=>{if(v===undefined||v===''){tdDiff.textContent='—'; tdDiff.style.color='var(--muted)'; return;} const n=Number(v); if(!Number.isFinite(n)){tdDiff.textContent='—'; tdDiff.style.color='var(--muted)'; return;}
        const d=n-stock; tdDiff.textContent=String(d); tdDiff.style.color=(d===0)?'var(--ok)':(d<0?'var(--danger)':'var(--text)');};
      paint(ex?.contado);
      inp.addEventListener('input', async (ev)=>{const contado=ev.target.value; const usuario=els.userName.value.trim()||'SIN_USUARIO'; const sid=els.sessionId.value.trim()||'SIN_SESSION';
        const rec={k,sku,deposito:dep,contado,stock_csv:stock,dif:(contado===''?'':(Number(contado)-stock)),rubro:norm(r.RUBRO),subrubro:norm(r.SUBRUBRO),b2c_filame:norm(r.B2C_FILAME),detalle:norm(r.DETALLE),ts:nowIso(),usuario,sessionId:sid,pending:true};
        if(contado==='') edits.delete(k); else edits.set(k,rec);
        await saveMeta(); await saveLocalEdits(); updateBtns(); paint(contado);});
      tdIn.appendChild(inp);
      tr.appendChild(tdDep); tr.appendChild(tdSku); tr.appendChild(tdDet); tr.appendChild(tdStock); tr.appendChild(tdIn); tr.appendChild(tdDiff);
      els.tbodyConteo.appendChild(tr);}
    if(idx.length>max){const tr=document.createElement('tr'); const td=document.createElement('td'); td.colSpan=6; td.innerHTML=`<span class="hint">Mostrando ${max} de ${idx.length}. Refiná con filtros.</span>`; tr.appendChild(td); els.tbodyConteo.appendChild(tr);}
  }

  function reposOk(it,st){if(!pass(st.rubro,it.RUBRO)) return false; if(!pass(st.subrubro,it.SUBRUBRO)) return false; if(!pass(st.filame,it.B2C_FILAME)) return false;
    if(!pass(st.detalle,it.DETALLE)) return false; if(!pass(st.sku,it.SKU)) return false; if(st.q){const hay=(low(it.SKU)+' '+low(it.DETALLE)+' '+low(it.SUBRUBRO)+' '+low(it.RUBRO)+' '+low(it.B2C_FILAME)); if(!hay.includes(st.q)) return false;} return true;}
  function renderRepos(){const st=filters(); const list=reposListAll.filter(it=>reposOk(it,st)); els.k_items.textContent=String(list.length); els.tbodyRepos.innerHTML='';
    const max=400; for(const it of list.slice(0,max)){const tr=document.createElement('tr');
      const td=(t)=>{const x=document.createElement('td'); x.textContent=t; return x;};
      const t1=td(it.RUBRO||'—'), t2=td(it.SUBRUBRO||'—'), t3=td(it.SKU), t4=td(it.DETALLE||'—');
      const td1=document.createElement('td'); td1.style.textAlign='right'; td1.textContent=String(it.DEP1);
      const td12=document.createElement('td'); td12.style.textAlign='right'; td12.textContent=String(it.DEP12);
      const tU=document.createElement('td'); tU.style.textAlign='right'; tU.textContent=String(it.UMBRAL);
      const tE=document.createElement('td'); tE.innerHTML='<span class="pill warn">REPOSICIÓN</span>';
      tr.appendChild(t1); tr.appendChild(t2); tr.appendChild(t3); tr.appendChild(t4); tr.appendChild(td1); tr.appendChild(td12); tr.appendChild(tU); tr.appendChild(tE);
      els.tbodyRepos.appendChild(tr);}
    if(list.length>max){const tr=document.createElement('tr'); const td=document.createElement('td'); td.colSpan=8; td.innerHTML=`<span class="hint">Mostrando ${max} de ${list.length}.</span>`; tr.appendChild(td); els.tbodyRepos.appendChild(tr);}
  }

  function render(){if(!cuboRows.length){updateBtns(); return;} if(activeTab==='conteo') renderConteo(); else renderRepos(); updateBtns();}
  function setTab(t){activeTab=t; const c=(t==='conteo'); els.tabConteo.classList.toggle('active',c); els.tabRepos.classList.toggle('active',!c);
    els.viewConteo.classList.toggle('hidden',!c); els.viewRepos.classList.toggle('hidden',c); els.depWrap.classList.toggle('hidden',!c); render();}

  function apiBase(){return (els.apiUrl.value||'').trim().replace(/\/$/,'');}
  async function apiGet(params){const base=apiBase(); if(!base) throw new Error('Falta API URL'); const url=base+'?'+new URLSearchParams(params).toString(); const r=await fetch(url); if(!r.ok) throw new Error('HTTP '+r.status); return r.json();}
  async function apiPost(payload){const base=apiBase(); if(!base) throw new Error('Falta API URL'); const r=await fetch(base,{method:'POST',body:JSON.stringify(payload)}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json();}

  async function createSession(){await saveMeta(); const sid=els.sessionId.value.trim(); if(!sid) return status('Falta Session ID',true);
    try{status('Creando sesión (API)…'); const out=await apiPost({action:'createSession',session_id:sid,created_at:nowIso()});
      status(out.ok?('Sesión creada: '+sid):('No pude crear sesión: '+(out.error||'error')),!out.ok);}catch(e){status('Error creando sesión (API).',true);}}
  async function uploadCubo(){await saveMeta(); const sid=els.sessionId.value.trim(); if(!sid) return status('Falta Session ID',true);
    const f=els.file.files?.[0]; if(!f) return status('Seleccioná un CSV del cubo',true);
    try{status('Leyendo CSV…'); const text=await f.text(); const delim=detectDelim(text.slice(0,1000));
      const parsed=await new Promise((res,rej)=>Papa.parse(text,{header:true,skipEmptyLines:true,delimiter:delim,complete:r=>res(r.data||[]),error:rej}));
      const rows=parsed.map(r=>({RUBRO:r.RUBRO??r['RUBRO'],SUBRUBRO:r.SUBRUBRO??r['SUBRUBRO'],B2C_FILAME:r.B2C_FILAME??r['B2C_FILAME'],B2C_DIAMET:r.B2C_DIAMET??r['B2C_DIAMET'],B2C_PESO:r.B2C_PESO??r['B2C_PESO'],B2C_COLOR:r.B2C_COLOR??r['B2C_COLOR'],DEPOSITO:r.DEPOSITO??r['DEPOSITO'],COD_ALFA:r.COD_ALFA??r['COD_ALFA'],DETALLE:r.DETALLE??r['DETALLE'],STOCK:r.STOCK??r['STOCK']}));
      cuboRows=rows; await saveLocalCubo(rows); rebuild(); cascade(); render();
      status('Subiendo cubo al API…'); const out=await apiPost({action:'uploadCubo',session_id:sid,uploaded_at:nowIso(),rows});
      status(out.ok?('Cubo subido a la sesión: '+sid):('No pude subir cubo: '+(out.error||'error')),!out.ok);}catch(e){console.error(e);status('Error subiendo cubo.',true);}}
  async function downloadCubo(){await saveMeta(); const sid=els.sessionId.value.trim(); if(!sid) return status('Falta Session ID',true);
    try{status('Descargando cubo (API)…'); const out=await apiGet({action:'getCubo',session_id:sid}); if(!out.ok) return status('No pude descargar: '+(out.error||'error'),true);
      cuboRows=Array.isArray(out.rows)?out.rows:[]; await saveLocalCubo(cuboRows); rebuild(); cascade(); render(); status(`Cubo descargado (${cuboRows.length}). Ya podés ir offline.`);}catch(e){status('Error descargando cubo.',true);}}
  async function syncNow(){await saveMeta(); const sid=els.sessionId.value.trim(); if(!sid) return status('Falta Session ID',true);
    if(!navigator.onLine) return status('Estás offline. No se puede sync.',true);
    const pending=[...edits.values()].filter(e=>e.pending); if(!pending.length){updateBtns(); return status('Nada pendiente para sincronizar.');}
    try{status(`Sincronizando ${pending.length}…`); const out=await apiPost({action:'pushConteos',session_id:sid,pushed_at:nowIso(),conteos:pending});
      if(!out.ok) return status('Sync falló: '+(out.error||'error'),true);
      for(const e of pending){const cur=edits.get(e.k); if(cur){cur.pending=false; edits.set(e.k,cur);}}
      await saveLocalEdits(); updateBtns(); status(`Sync OK (${pending.length} enviados).`);}catch(e){status('Error de sync.',true);}}
  function dlCSV(name,rows){const csv=Papa.unparse(rows,{quotes:true,delimiter:';'}); const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);}
  function exportRows(onlyDiff){const out=[]; for(const e of edits.values()){const dif=Number(e.dif); if(onlyDiff && dif===0) continue;
      out.push({TS_ISO:e.ts,SESSION_ID:e.sessionId,USUARIO:e.usuario,COD_ALFA:e.sku,DEPOSITO:e.deposito,STOCK_CSV:e.stock_csv,STOCK_CONTADO:Number(e.contado),DIF:dif,RUBRO:e.rubro,SUBRUBRO:e.subrubro,B2C_FILAME:e.b2c_filame,DETALLE:e.detalle,PENDIENTE_SYNC:e.pending?'SI':'NO'});} return out;}

  els.tabConteo.addEventListener('click',()=>setTab('conteo')); els.tabRepos.addEventListener('click',()=>setTab('repos'));
  for(const el of [els.f_rubro,els.f_subrubro,els.f_filame,els.f_detalle,els.f_sku,els.f_deposito]) el.addEventListener('change',()=>{cascade();render();});
  els.search.addEventListener('input',()=>render()); els.hideZero.addEventListener('change',()=>render());
  els.onlyDiff.addEventListener('click',()=>{showOnlyDiff=!showOnlyDiff;updateBtns();render();});
  els.createSession.addEventListener('click',createSession); els.uploadCubo.addEventListener('click',uploadCubo); els.downloadCubo.addEventListener('click',downloadCubo);
  els.syncNow.addEventListener('click',syncNow);
  els.exportControl.addEventListener('click',()=>dlCSV('control_realizado_local.csv',exportRows(false)));
  els.exportDiffs.addEventListener('click',()=>dlCSV('diferencias_local.csv',exportRows(true)));
  els.clearLocal.addEventListener('click',async()=>{await dbClearAll(); cuboRows=[]; edits=new Map(); reposListAll=[]; skuIndex=new Map(); status('Datos locales borrados.'); render();});

  window.addEventListener('online',()=>{updateBtns(); syncNow();});
  window.addEventListener('offline',()=>updateBtns());

  async function init(){
    pill(els.netPill,'Red: …','warn'); pill(els.syncPill,'Sync: …','warn');
    for(const s of [els.f_rubro,els.f_subrubro,els.f_filame,els.f_detalle,els.f_sku,els.f_deposito]) s.innerHTML='<option>—</option>';
    await loadMeta(); await loadLocalSession(); updateBtns();
    setInterval(()=>{if(!navigator.onLine) return; if(pendingCount()===0) return; syncNow();},45000);
  }
  init();
})();