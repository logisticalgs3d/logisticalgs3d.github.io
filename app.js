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
    tbodyConteo:$('tbodyConteo'),tbodyRepos:$('tbodyRepos'),cardlistConteo:$('cardlistConteo'),loadMore:$('loadMore'),showingHint:$('showingHint')};
  let activeTab='conteo', cuboRows=[], edits=new Map(), reposListAll=[], skuIndex=new Map(), showOnlyDiff=false;
  let viewLimit = 120;
  let filterIndex = null;

  const norm=s=>String(s??'').trim();
  const low=s=>norm(s).toLowerCase();
  const nowIso=()=>new Date().toISOString();
  const isMobile = () => window.matchMedia('(max-width: 899px)').matches;
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

  
  function buildFilterIndex(){
    const rubroSet = new Set();
    const subByRubro = new Map();
    const filByRS = new Map();
    const detByRSF = new Map();
    const skuByRSFD = new Map();
    const depByRSFDS = new Map();

    for(const r of cuboRows){
      const rub=norm(r.RUBRO), sub=norm(r.SUBRUBRO), fil=norm(r.B2C_FILAME), det=norm(r.DETALLE), sku=norm(r.COD_ALFA), dep=norm(r.DEPOSITO);
      rubroSet.add(rub);
      if(!subByRubro.has(rub)) subByRubro.set(rub,new Set());
      subByRubro.get(rub).add(sub);

      const kRS=rub+'||'+sub;
      if(!filByRS.has(kRS)) filByRS.set(kRS,new Set());
      filByRS.get(kRS).add(fil);

      const kRSF=kRS+'||'+fil;
      if(!detByRSF.has(kRSF)) detByRSF.set(kRSF,new Set());
      detByRSF.get(kRSF).add(det);

      const kRSFD=kRSF+'||'+det;
      if(!skuByRSFD.has(kRSFD)) skuByRSFD.set(kRSFD,new Set());
      skuByRSFD.get(kRSFD).add(sku);

      const kRSFDS=kRSFD+'||'+sku;
      if(!depByRSFDS.has(kRSFDS)) depByRSFDS.set(kRSFDS,new Set());
      if(dep) depByRSFDS.get(kRSFDS).add(dep);
    }
    filterIndex={rubroSet,subByRubro,filByRS,detByRSF,skuByRSFD,depByRSFDS};
  }

function setOpts(sel,vals,labelAll){sel.innerHTML=''; const o=document.createElement('option');o.value='__ALL__';o.textContent=labelAll;sel.appendChild(o);
    for(const v of vals){const oo=document.createElement('option');oo.value=v;oo.textContent=v===''?'(vacío)':v;sel.appendChild(oo);} }
  function filters(){return{rubro:els.f_rubro.value,subrubro:els.f_subrubro.value,filame:els.f_filame.value,detalle:els.f_detalle.value,sku:els.f_sku.value,deposito:els.f_deposito.value,q:low(els.search.value)};}
  function pass(sel,val){if(sel==='__ALL__') return true; const v=norm(val); if(sel==='(vacío)') return v===''; return v===sel;}
  function rowOk(r,st,dep=true){if(!pass(st.rubro,r.RUBRO)) return false; if(!pass(st.subrubro,r.SUBRUBRO)) return false; if(!pass(st.filame,r.B2C_FILAME)) return false;
    if(!pass(st.detalle,r.DETALLE)) return false; if(!pass(st.sku,r.COD_ALFA)) return false; if(dep && st.deposito!=='__ALL__' && norm(r.DEPOSITO)!==st.deposito) return false;
    if(st.q){const hay=(low(r.COD_ALFA)+' '+low(r.DETALLE)+' '+low(r.SUBRUBRO)+' '+low(r.RUBRO)+' '+low(r.B2C_FILAME)); if(!hay.includes(st.q)) return false;} return true;}
  function hideZero(stock){return els.hideZero.checked && stock===0;}

  function cascade(){
    const st=filters();
    if(!filterIndex){ return; }

    const rub=[...filterIndex.rubroSet].sort();
    setOpts(els.f_rubro,rub,'Todos');
    els.f_rubro.value=(rub.includes(st.rubro)||st.rubro==='__ALL__')?st.rubro:'__ALL__';
    const rubSel=els.f_rubro.value;

    const subSet=new Set();
    if(rubSel==='__ALL__'){
      for(const s of filterIndex.subByRubro.values()) for(const v of s) subSet.add(v);
    } else {
      for(const v of (filterIndex.subByRubro.get(rubSel)||new Set())) subSet.add(v);
    }
    const sub=[...subSet].sort();
    setOpts(els.f_subrubro,sub,'Todos');
    els.f_subrubro.value=(sub.includes(st.subrubro)||st.subrubro==='__ALL__')?st.subrubro:'__ALL__';
    const subSel=els.f_subrubro.value;

    const filSet=new Set();
    for(const [k,s] of filterIndex.filByRS.entries()){
      const [r,su]=k.split('||');
      if((rubSel==='__ALL__'||r===rubSel) && (subSel==='__ALL__'||su===subSel)){
        for(const v of s) filSet.add(v);
      }
    }
    const fil=[...filSet].sort();
    setOpts(els.f_filame,fil,'Todos');
    els.f_filame.value=(fil.includes(st.filame)||st.filame==='__ALL__')?st.filame:'__ALL__';
    const filSel=els.f_filame.value;

    const detSet=new Set();
    for(const [k,s] of filterIndex.detByRSF.entries()){
      const [r,su,f]=k.split('||');
      if((rubSel==='__ALL__'||r===rubSel) && (subSel==='__ALL__'||su===subSel) && (filSel==='__ALL__'||f===filSel)){
        for(const v of s) detSet.add(v);
      }
    }
    const det=[...detSet].sort().slice(0,600);
    setOpts(els.f_detalle,det,'Todos');
    els.f_detalle.value=(det.includes(st.detalle)||st.detalle==='__ALL__')?st.detalle:'__ALL__';
    const detSel=els.f_detalle.value;

    const skuSet=new Set();
    for(const [k,s] of filterIndex.skuByRSFD.entries()){
      const [r,su,f,d]=k.split('||');
      if((rubSel==='__ALL__'||r===rubSel) && (subSel==='__ALL__'||su===subSel) && (filSel==='__ALL__'||f===filSel) && (detSel==='__ALL__'||d===detSel)){
        for(const v of s) skuSet.add(v);
      }
    }
    const sk=[...skuSet].sort().slice(0,1200);
    setOpts(els.f_sku,sk,'Todos');
    els.f_sku.value=(sk.includes(st.sku)||st.sku==='__ALL__')?st.sku:'__ALL__';
    const skuSel=els.f_sku.value;

    const depSet=new Set();
    for(const [k,s] of filterIndex.depByRSFDS.entries()){
      const [r,su,f,d,sku]=k.split('||');
      if((rubSel==='__ALL__'||r===rubSel) && (subSel==='__ALL__'||su===subSel) && (filSel==='__ALL__'||f===filSel) && (detSel==='__ALL__'||d===detSel) && (skuSel==='__ALL__'||sku===skuSel)){
        for(const v of s) depSet.add(v);
      }
    }
    const dep=[...depSet].filter(Boolean).sort((a,b)=>Number(a)-Number(b));
    setOpts(els.f_deposito,dep,'Todos');
    els.f_deposito.value=(dep.includes(st.deposito)||st.deposito==='__ALL__')?st.deposito:'__ALL__';
  }

  function buildIndex(){skuIndex=new Map(); for(const r of cuboRows){const sku=norm(r.COD_ALFA); if(!sku) continue; const dep=norm(r.DEPOSITO); const stock=numOr0(r.STOCK);
    if(!skuIndex.has(sku)) skuIndex.set(sku,{SKU:sku,RUBRO:norm(r.RUBRO),SUBRUBRO:norm(r.SUBRUBRO),B2C_FILAME:norm(r.B2C_FILAME),DETALLE:norm(r.DETALLE),stockByDep:new Map()});
    const o=skuIndex.get(sku); o.stockByDep.set(dep,stock); if(!o.DETALLE && norm(r.DETALLE)) o.DETALLE=norm(r.DETALLE);}}
  function isImp(r){const x=low(r); return x.includes('impres')||x.includes('printer');}
  function isFil(r){const x=low(r); return x.includes('filam')||x.includes('filament');}
  function repos(){reposListAll=[]; for(const [sku,o] of skuIndex.entries()){const d1=o.stockByDep.get('1')??0; const d12=o.stockByDep.get('12')??0; let u=null;
      if(isImp(o.RUBRO)) u=50; else if(isFil(o.RUBRO)) u=100; else continue; if(d1<u && d12>0) reposListAll.push({RUBRO:o.RUBRO,SUBRUBRO:o.SUBRUBRO,B2C_FILAME:o.B2C_FILAME,DETALLE:o.DETALLE,SKU:o.SKU,DEP1:d1,DEP12:d12,UMBRAL:u});}
    els.k_repos.textContent=String(reposListAll.length); pill(els.reposPill,reposListAll.length?`Reposición: ${reposListAll.length}`:'Reposición: sin pendientes',reposListAll.length?'warn':'ok');}
  function rebuild(){buildIndex(); repos(); buildFilterIndex();}

  function pendingCount(){let n=0; for(const e of edits.values()) if(e.pending) n++; return n;}
  function updatePills(){pill(els.netPill,navigator.onLine?'Red: online':'Red: offline',navigator.onLine?'ok':'warn');
    const p=pendingCount(); els.k_pending.textContent=String(p); pill(els.syncPill,p?`Sync: ${p} pendientes`:'Sync: OK',p?'warn':'ok');}
  function updateBtns(){const any=cuboRows.length>0; const anyEdit=edits.size>0;
    els.onlyDiff.disabled=!any; els.syncNow.disabled=!anyEdit||!navigator.onLine; els.exportControl.disabled=!anyEdit; els.exportDiffs.disabled=!anyEdit;
    els.onlyDiff.textContent=showOnlyDiff?'Ver todo':'Mostrar sólo con cambios'; els.k_changes.textContent=String(edits.size); updatePills();}

  function listIdx(){const st=filters(); const idx=[]; for(let i=0;i<cuboRows.length;i++){const r=cuboRows[i]; if(!rowOk(r,st,true)) continue;
      const stock=numOr0(r.STOCK); if(hideZero(stock) && stock>=0) continue;
      const k=keyOf(r.COD_ALFA,r.DEPOSITO); if(showOnlyDiff && !edits.has(k)) continue; idx.push(i);} return idx;}

  function renderConteo(){
    const idx=listIdx();
    els.k_items.textContent=String(idx.length);

    els.tbodyConteo.innerHTML='';
    if(els.cardlistConteo) els.cardlistConteo.innerHTML='';

    const total = idx.length;
    const limit = Math.max(40, viewLimit);
    const slice = idx.slice(0, limit);

    if(els.showingHint){
      els.showingHint.textContent = total ? `Mostrando ${slice.length} de ${total}. Usá filtros/búsqueda para acotar.` : '';
    }
    if(els.loadMore){
      els.loadMore.disabled = slice.length >= total;
      els.loadMore.style.display = (total > slice.length) ? 'block' : 'none';
    }

    const fragT=document.createDocumentFragment();
    const fragC=document.createDocumentFragment();

    for(const i of slice){
      const r=cuboRows[i];
      const sku=norm(r.COD_ALFA), dep=norm(r.DEPOSITO), k=keyOf(sku,dep);
      const stock=numOr0(r.STOCK);
      const ex=edits.get(k);

      const onInput = async (val) => {
        const contado=val; const usuario=els.userName.value.trim()||'SIN_USUARIO'; const sid=els.sessionId.value.trim()||'SIN_SESSION';
        const rec={k,sku,deposito:dep,contado,stock_csv:stock,dif:(contado===''?'':(Number(contado)-stock)),rubro:norm(r.RUBRO),subrubro:norm(r.SUBRUBRO),b2c_filame:norm(r.B2C_FILAME),detalle:norm(r.DETALLE),ts:nowIso(),usuario,sessionId:sid,pending:true};
        if(contado==='') edits.delete(k); else edits.set(k,rec);
        await saveMeta(); await saveLocalEdits(); updateBtns();
      };

      if(!isMobile()){
        const tr=document.createElement('tr');
        const td=(t)=>{const x=document.createElement('td'); x.textContent=t; return x;};
        const tdDep=td(dep), tdSku=td(sku), tdDet=td(norm(r.DETALLE));
        const tdStock=document.createElement('td'); tdStock.style.textAlign='right'; tdStock.textContent=String(stock);
        if(stock<0) tdStock.innerHTML=`<span style="color:var(--danger);font-weight:950;">${stock}</span>`;

        const tdIn=document.createElement('td');
        const inp=document.createElement('input'); inp.className='input-mini'; inp.type='number'; inp.step='1'; inp.inputMode='numeric'; inp.placeholder='—';
        if(ex?.contado!==undefined) inp.value=ex.contado;

        const tdDiff=document.createElement('td'); tdDiff.className='diff-cell';
        const paint=(v)=>{ if(v===undefined||v===''){tdDiff.textContent='—'; tdDiff.style.color='var(--muted)'; return;}
          const n=Number(v); if(!Number.isFinite(n)){tdDiff.textContent='—'; tdDiff.style.color='var(--muted)'; return;}
          const d=n-stock; tdDiff.textContent=String(d); tdDiff.style.color=(d===0)?'var(--ok)':(d<0?'var(--danger)':'var(--text)'); };
        paint(ex?.contado);

        inp.addEventListener('input', async (ev)=>{await onInput(ev.target.value); paint(ev.target.value);});
        tdIn.appendChild(inp);

        tr.appendChild(tdDep); tr.appendChild(tdSku); tr.appendChild(tdDet); tr.appendChild(tdStock); tr.appendChild(tdIn); tr.appendChild(tdDiff);
        fragT.appendChild(tr);
      } else if(els.cardlistConteo){
        const card=document.createElement('div'); card.className='itemcard';
        const top=document.createElement('div'); top.className='itemtop';
        const left=document.createElement('div');
        left.innerHTML = `<div class="bigsku">${sku}</div><div class="line">${norm(r.DETALLE)||''}</div>`;
        const right=document.createElement('div');
        right.innerHTML = `<div class="bigdep">Dep ${dep}</div><div class="line">Stock CSV: <b class="mono">${stock}</b></div>`;
        top.appendChild(left); top.appendChild(right);

        const row=document.createElement('div'); row.className='row2';
        const inp=document.createElement('input'); inp.className='input-mini'; inp.type='number'; inp.step='1'; inp.inputMode='numeric'; inp.placeholder='Contado…';
        if(ex?.contado!==undefined) inp.value=ex.contado;
        const diff=document.createElement('span'); diff.className='diffpill neu'; diff.textContent='—';

        const paintDiff=(v)=>{
          if(v===undefined||v===''){diff.textContent='—'; diff.classList.remove('ok','bad','neu'); diff.classList.add('neu'); return;}
          const n=Number(v); if(!Number.isFinite(n)){diff.textContent='—'; return;}
          const d=n-stock; diff.textContent=String(d);
          diff.classList.remove('ok','bad','neu');
          if(d===0) diff.classList.add('ok'); else if(d<0) diff.classList.add('bad'); else diff.classList.add('neu');
        };
        paintDiff(ex?.contado);

        inp.addEventListener('input', async (ev)=>{await onInput(ev.target.value); paintDiff(ev.target.value);});
        row.appendChild(inp); row.appendChild(diff);
        card.appendChild(top); card.appendChild(row);
        fragC.appendChild(card);
      }
    }

    els.tbodyConteo.appendChild(fragT);
    if(els.cardlistConteo) els.cardlistConteo.appendChild(fragC);
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
  function setTab(t){activeTab=t; viewLimit=120; const c=(t==='conteo'); els.tabConteo.classList.toggle('active',c); els.tabRepos.classList.toggle('active',!c);
    els.viewConteo.classList.toggle('hidden',!c); els.viewRepos.classList.toggle('hidden',c); els.depWrap.classList.toggle('hidden',!c); render();}

  function apiBase(){return (els.apiUrl.value||'').trim().replace(/\/$/,'');}
  async function apiGet(params){const base=apiBase(); if(!base) throw new Error('Falta API URL'); const url=base+'?'+new URLSearchParams(params).toString(); const r=await fetch(url); if(!r.ok) throw new Error('HTTP '+r.status); return r.json();}
  async function apiPost(payload){const base=apiBase(); if(!base) throw new Error('Falta API URL'); const r=await fetch(base,{method:'POST',body:JSON.stringify(payload)}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json();}

  async function createSession(){await saveMeta(); const sid=els.sessionId.value.trim(); if(!sid) return status('Falta Session ID',true);
    try{status('Creando sesión (API)…'); const out=await apiPost({action:'createSession',session_id:sid,created_at:nowIso()});
      status(out.ok?('Sesión creada: '+sid):('No pude crear sesión: '+(out.error||'error')),!out.ok);}catch(e){status('Error creando sesión (API).',true);}}
  async function uploadCubo(){await saveMeta(); const sid=els.sessionId.value.trim(); if(!sid) return status('Falta Session ID',true);
    const f=els.file.files?.[0]; if(!f) return status('Seleccioná un CSV del cubo',true);
    try{status('Leyendo CSV…'); const parsed = await new Promise((res,rej)=>{let rows=[]; let seen=0;
        Papa.parse(f,{header:true,skipEmptyLines:true,worker:true,step:(results)=>{if(results&&results.data){rows.push(results.data); seen++; if(seen%400===0) status('Leyendo CSV… '+seen+' filas');}},complete:()=>res(rows),error:rej});
      });
      const rows=parsed.map(r=>({RUBRO:r.RUBRO??r['RUBRO'],SUBRUBRO:r.SUBRUBRO??r['SUBRUBRO'],B2C_FILAME:r.B2C_FILAME??r['B2C_FILAME'],B2C_DIAMET:r.B2C_DIAMET??r['B2C_DIAMET'],B2C_PESO:r.B2C_PESO??r['B2C_PESO'],B2C_COLOR:r.B2C_COLOR??r['B2C_COLOR'],DEPOSITO:r.DEPOSITO??r['DEPOSITO'],COD_ALFA:r.COD_ALFA??r['COD_ALFA'],DETALLE:r.DETALLE??r['DETALLE'],STOCK:r.STOCK??r['STOCK']}));

      cuboRows=rows; await saveLocalCubo(rows); rebuild(); cascade(); viewLimit=120; render();

      const total=rows.length; const chunkSize=150; const chunks=Math.ceil(total/chunkSize);
      const postWithRetry=async (payload,tries=3)=>{let last=null; for(let t=0;t<tries;t++){try{const r=await apiPost(payload); if(r&&r.ok) return r; last=new Error(r?.error||'error');}catch(e){last=e;} await new Promise(res=>setTimeout(res,350*(t+1)));} throw last||new Error('error');};

      status(`Iniciando upload… (${total} filas)`); let out=await postWithRetry({action:'uploadCuboStart',session_id:sid,uploaded_at:nowIso()},3);
      if(!out.ok) return status('No pude iniciar upload: '+(out.error||'error'),true);

      for(let ci=0; ci<chunks; ci++){const start=ci*chunkSize; const part=rows.slice(start,start+chunkSize);
        status(`Subiendo cubo… ${ci+1}/${chunks}`);
        out=await postWithRetry({action:'uploadCuboChunk',session_id:sid,chunk_index:ci,chunk_size:chunkSize,rows:part},3);
        if(!out.ok) return status('Falló chunk '+(ci+1)+': '+(out.error||'error'),true);
      }

      status('Finalizando upload…'); out=await postWithRetry({action:'uploadCuboFinish',session_id:sid,finished_at:nowIso(),total_rows:total},3);
      if(!out.ok) return status('Upload incompleto: '+(out.error||'error'),true);

      status('Cubo subido (chunks) a la sesión: '+sid);
    }catch(e){console.error(e); status('Error subiendo cubo.',true);}
  }

  function downloadCubo(){await saveMeta(); const sid=els.sessionId.value.trim(); if(!sid) return status('Falta Session ID',true);
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
  for(const el of [els.f_rubro,els.f_subrubro,els.f_filame,els.f_detalle,els.f_sku,els.f_deposito]) el.addEventListener('change',()=>{viewLimit=120; cascade();render();});
  els.search.addEventListener('input',()=>{viewLimit=120; render();}); els.hideZero.addEventListener('change',()=>{viewLimit=120; render();});
  if(els.loadMore){els.loadMore.addEventListener('click',()=>{viewLimit += 120; render();});}
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
    await loadMeta();
    if(!els.apiUrl.value.trim()) els.apiUrl.value = 'https://script.google.com/macros/s/AKfycbzWGGrh-QL-r8xLUKY0rQ8W9aSBUqiygqIrmuSkZxoec9zcp7LAxzpKY-KGxMTXPdZPeg/exec'; await loadLocalSession(); updateBtns();
    setInterval(()=>{if(!navigator.onLine) return; if(pendingCount()===0) return; syncNow();},45000);
  }
  init();
})();