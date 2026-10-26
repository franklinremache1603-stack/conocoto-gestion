/* Conocoto Control Operativo — GitHub Pages + Supabase. Sin datos reales preinstalados. */
(() => {
  'use strict';
  const config = window.CONOCOTO_CONFIG || {};
  const cloudConfigured = Boolean(config.supabaseUrl && config.supabasePublishableKey);
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toText = (x, len=250) => String(x ?? '').trim().replace(/[\u0000-\u001f]+/g,' ').slice(0,len);
  const nowDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const dateLabel = (d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : '—';
  const daysDiff = (a,b) => a && b ? Math.max(0,Math.floor((Date.parse(`${b}T12:00:00Z`)-Date.parse(`${a}T12:00:00Z`))/86400000)) : 0;
  const num = (n) => Number(n || 0).toLocaleString('es-EC');
  const uid = () => (globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.floor(Math.random()*1e8)}`);
  const trimNumber = (x) => toText(x,80).replace(/\.0+$/,'').replace(/^'/,'');
  const STATUS = {PENDIENTE:'Pendiente', EN_GESTION:'En gestión', ATENDIDA:'Atendida', NO_EJECUTADA:'No ejecutada'};
  const STORE_KEY = 'conocoto-control-v1';
  let client=null, user=null, activeOrderId=null, currentPage='dashboard', pageIndex=0, toastTimer=null;
  let db={orders:[],imports:[],snapshots:{},logs:[]};
  let parsedFile=null;
  let pageSize=30;
  const mapDefs = [
    ['order_no','Número de orden *',['numero de orden','n orden','nro orden','no orden','num orden','orden','orden de trabajo','ot','numero ot','numero orden','n de orden','nº orden','n° orden']],
    ['class_code','Clase de orden',['clase de orden','clase orden','clase','tipo de orden','tipo de ot','clase ot']],
    ['created_date','Fecha de creación',['fecha de creacion','fecha creacion','fecha de la orden','fecha orden','fecha solicitud','fecha de entrada','f creacion','fecha registro']],
    ['account_no','Cuenta contrato',['cuenta contrato','cuenta contractual','cuenta','contrato','nro cuenta','numero de cuenta']],
    ['sector','Sector / parroquia',['sector','parroquia','localidad','barrio','zona','ubicacion','sector de trabajo']],
    ['address','Dirección',['direccion','direccion servicio','direccion del cliente','calle','direccion instalacion']],
    ['customer','Cliente',['cliente','nombre cliente','nombre del cliente','abonado','interesado']],
    ['description','Descripción / texto',['texto breve','descripcion','texto orden','detalle','motivo','observacion','descripcion de orden']],
    ['source_state','Estado en el Excel',['estatus','estado','status','estado de la orden','status sistema','estatus de orden']]
  ];
  const normal = (x) => toText(x,160).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const dateISO = (v) => {
    if (!v) return null;
    if (v instanceof Date && !isNaN(+v)) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
    const s=String(v).trim();
    let m=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if(m){const d=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;return !isNaN(Date.parse(d))?d:null;}
    m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s|$)/);
    if(m){const year=m[3].length===2 ? Number(m[3])+(Number(m[3])<50?2000:1900) : Number(m[3]); const d=`${year}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;return !isNaN(Date.parse(d))?d:null;}
    return null;
  };
  function getLocal(){try{const x=JSON.parse(localStorage.getItem(STORE_KEY)||'{}');return {orders:Array.isArray(x.orders)?x.orders:[],imports:Array.isArray(x.imports)?x.imports:[],snapshots:x.snapshots||{},logs:Array.isArray(x.logs)?x.logs:[]};}catch{return {orders:[],imports:[],snapshots:{},logs:[]};}}
  function saveLocal(){try{localStorage.setItem(STORE_KEY,JSON.stringify(db));}catch(e){throw new Error('Almacenamiento local lleno. Configura la sincronización en Supabase o reduce la cantidad de órdenes.');}}
  function notify(msg,error=false){clearTimeout(toastTimer); const node=$('notice');node.textContent=msg;node.className='notice'+(error?' error':''); toastTimer=setTimeout(()=>node.classList.add('hidden'),7500);window.scrollTo({top:0,behavior:'smooth'});}
  function isCloud(){return cloudConfigured;}
  function setBusy(b,label='Guardando…'){['confirm-import','save-order','login-btn'].forEach(id=>{$(id).disabled=b;});if(b)$('confirm-import').textContent=label;else $('confirm-import').textContent='Confirmar importación';}
  async function initializeCloud(){
    if(!window.supabase?.createClient){$('auth-backdrop').classList.remove('hidden');notify('No se cargó la biblioteca de Supabase. Revisa tu conexión a Internet.',true);return;}
    client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
    const {data,error}=await client.auth.getSession();
    if(error) notify(error.message,true);
    if(data?.session?.user){await onLogin(data.session.user);}else{$('auth-backdrop').classList.remove('hidden');}
  }
  async function onLogin(u){
    user=u;
    const {data,error}=await client.from('members').select('user_id,display_name,role,enabled').eq('user_id',u.id).maybeSingle();
    if(error || !data?.enabled){user=null;await client.auth.signOut(); $('auth-backdrop').classList.remove('hidden');notify('Tu cuenta no está autorizada. El administrador debe registrarte en la tabla members.',true);return;}
    $('auth-backdrop').classList.add('hidden');$('user-btn').textContent=(data.display_name||u.email||'US').split(/\s|@/).slice(0,2).map(t=>t[0]||'').join('').toUpperCase();$('user-btn').title=data.display_name||u.email;
    $('mode-label').textContent='Sincronización activa';$('mode-dot').classList.add('cloud');$('demo-warning').classList.add('hidden');
    await reloadData();
  }
  async function reloadData(){
    try{
      if(isCloud()){
        if(!user)return;
        const {data:imports,error:e1}=await client.from('imports').select('id,file_name,cut_date,row_count,status,created_at,uploaded_by').eq('status','completada').order('created_at',{ascending:false}).limit(120);
        if(e1)throw e1;
        let all=[],pos=0;
        while(true){const {data,error}=await client.from('orders').select('*').order('order_no',{ascending:true}).range(pos,pos+999);if(error)throw error;all.push(...(data||[]));if(!data||data.length<1000)break;pos+=1000;if(pos>150000)throw new Error('Demasiadas órdenes para la consulta.');}
        db={orders:all,imports:imports||[],snapshots:{},logs:[]};
        const sorted=sortedImports();
        for(const imp of sorted.slice(0,2)) db.snapshots[imp.id]=await fetchSnapshot(imp.id);
      }else{db=getLocal();}
      renderAll();
    }catch(err){console.error(err);notify('No se pudieron consultar los datos: '+err.message,true);}
  }
  async function fetchSnapshot(id){let ids=[],pos=0;while(true){const {data,error}=await client.from('import_lines').select('order_no').eq('import_id',id).range(pos,pos+999);if(error)throw error;ids.push(...data.map(x=>x.order_no));if(data.length<1000)break;pos+=1000;}return ids;}
  function sortedImports(){return [...db.imports].filter(x=>x.status==='completada').sort((a,b)=>b.created_at.localeCompare(a.created_at));}
  function currentImport(){return sortedImports()[0]||null;}
  function beforeImport(){return sortedImports()[1]||null;}
  function currentOrders(){const latest=currentImport();return latest?db.orders.filter(o=>o.last_import_id===latest.id):[];}
  function comparative(){const a=currentImport(), b=beforeImport();if(!a||!b)return {newCount:null,missingCount:null};const now=new Set(db.snapshots[a.id]||[]),prev=new Set(db.snapshots[b.id]||[]);let n=0,m=0;for(const x of now)if(!prev.has(x))n++;for(const x of prev)if(!now.has(x))m++;return {newCount:n,missingCount:m};}
  function orderDays(o){return daysDiff(o.created_date||o.first_seen_date,currentImport()?.cut_date||nowDate());}
  function setPage(name){currentPage=name;pageIndex=0;document.querySelectorAll('.nav-link').forEach(x=>x.classList.toggle('active',x.dataset.page===name));document.querySelectorAll('.page').forEach(x=>x.classList.toggle('hidden',x.id!==`page-${name}`));$('page-title').textContent=({dashboard:'Resumen de pendientes',orders:'Órdenes de trabajo',imports:'Actualización de datos',history:'Historial de importaciones'})[name];$('sidebar').classList.remove('open');renderAll();}
  function renderAll(){const latest=currentImport();$('cutoff-label').textContent=latest?`Corte: ${dateLabel(latest.cut_date)}`:'Sin corte cargado';renderDashboard();renderOrders();renderHistory();}
  function renderDashboard(){
    const list=currentOrders(),pending=list.filter(x=>x.status!=='ATENDIDA'),cmp=comparative();
    $('kpi-total').textContent= list.length?num(list.length):'0';$('kpi-pending').textContent=num(pending.length);$('kpi-progress').textContent=num(list.filter(x=>x.status==='EN_GESTION').length);$('kpi-done').textContent=num(list.filter(x=>x.status==='ATENDIDA').length);
    $('kpi-new').textContent=cmp.newCount===null?'—':num(cmp.newCount);$('kpi-missing').textContent=cmp.missingCount===null?'—':num(cmp.missingCount);$('kpi-old').textContent=num(pending.filter(x=>orderDays(x)>15).length);
    const classes={};for(const o of pending)classes[o.class_code||'OTROS']=(classes[o.class_code||'OTROS']||0)+1;
    const vals=Object.entries(classes).sort((a,b)=>b[1]-a[1]).slice(0,10),max=Math.max(1,...vals.map(x=>x[1]));
    $('class-chart').innerHTML=vals.length?vals.map(([name,n])=>`<div class="bar-line"><span class="bar-label">${esc(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(1,n*100/max)}%"></div></div><span class="bar-value">${num(n)}</span></div>`).join(''):'<div class="empty-mini">No hay pendientes para graficar.</div>';
    const ages=[['0–5 días',x=>x<=5,''],['6–15 días',x=>x>5&&x<=15,''],['16–30 días',x=>x>15&&x<=30,'warn'],['Más de 30 días',x=>x>30,'danger']];
    $('age-chart').innerHTML=ages.map(([label,test,color])=>{const n=pending.filter(x=>test(orderDays(x))).length;return `<div class="age-row"><span>${label}</span><strong class="age-count">${num(n)}</strong><div class="progress ${color}"><i style="width:${pending.length?Math.round(n*100/pending.length):0}%"></i></div></div>`;}).join('');
    const priority=[...pending].sort((a,b)=>orderDays(b)-orderDays(a)).slice(0,8);
    $('priority-table').innerHTML=tableHtml(priority,false);
  }
  function filteredOrders(){const last=currentImport();let list;
    switch($('filter-scope').value){case 'missing':list=db.orders.filter(o=>last && o.last_import_id!==last.id);break;case 'all':list=[...db.orders];break;default:list=currentOrders();}
    const q=normal($('search').value),cls=$('filter-class').value,st=$('filter-status').value;
    return list.filter(o=>(!cls||o.class_code===cls)&&(!st||o.status===st)&&(!q||normal([o.order_no,o.account_no,o.sector,o.address,o.customer,o.description,o.assigned_to].join(' ')).includes(q))).sort((a,b)=>{const aDone=a.status==='ATENDIDA'?1:0,bDone=b.status==='ATENDIDA'?1:0;return aDone-bDone||orderDays(b)-orderDays(a)||String(a.order_no).localeCompare(String(b.order_no));});
  }
  function tableHtml(rows,includeAssigned=true){
    if(!rows.length)return '<div class="empty-state"><strong>Sin órdenes para mostrar</strong>Carga un Excel o modifica los filtros.</div>';
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>N.º ORDEN</th><th>CLASE</th><th>SECTOR</th>${includeAssigned?'<th>RESPONSABLE</th>':''}<th>ANTIGÜEDAD</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>${rows.map(o=>`<tr><td><span class="ot">${esc(o.order_no)}</span></td><td><span class="tag class">${esc(o.class_code||'—')}</span></td><td>${esc(o.sector||o.address||'—')}</td>${includeAssigned?`<td>${esc(o.assigned_to||'Sin asignar')}</td>`:''}<td>${num(orderDays(o))} días</td><td><span class="tag ${esc(o.status)}">${esc(STATUS[o.status]||o.status)}</span></td><td><button class="row-btn manage-btn" data-id="${esc(o.order_no)}">Gestionar →</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  function renderOrders(){
    const classes=[...new Set(db.orders.map(o=>o.class_code).filter(Boolean))].sort(); const sel=$('filter-class'),prior=sel.value;
    sel.innerHTML='<option value="">Todas las clases</option>'+classes.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');if(classes.includes(prior))sel.value=prior;
    const list=filteredOrders(),pages=Math.max(1,Math.ceil(list.length/pageSize));pageIndex=Math.min(pageIndex,pages-1);
    $('orders-count').textContent=`${num(list.length)} órdenes · ${num(currentOrders().length)} en último corte`;
    $('orders-table').innerHTML=tableHtml(list.slice(pageIndex*pageSize,(pageIndex+1)*pageSize));$('pagination-label').textContent=`Página ${pageIndex+1} de ${pages}`;
    $('prev-page').disabled=pageIndex===0;$('next-page').disabled=pageIndex>=pages-1;
  }
  function renderHistory(){const imports=sortedImports();$('history-total').textContent=`${imports.length} CORTE(S)`;
    $('history-table').innerHTML=imports.length?imports.map((x,i)=>`<div class="history-row"><div><div class="history-date">${dateLabel(x.cut_date)}</div><div class="history-meta">${i===0?'ÚLTIMO CORTE':'HISTÓRICO'}</div></div><div><strong>${esc(x.file_name)}</strong><div class="history-meta">Cargado: ${new Date(x.created_at).toLocaleString('es-EC')}</div></div><div><strong>${num(x.row_count)} OT</strong></div><div><span class="tag ATENDIDA">Completado</span></div></div>`).join(''):'<div class="empty-state"><strong>Aún no hay archivos importados</strong>Los cortes diarios se mostrarán aquí.</div>';
  }
  function openOrder(id){const o=db.orders.find(x=>x.order_no===id);if(!o)return;
    activeOrderId=id;$('modal-title').textContent=`Orden ${o.order_no}`;
    $('modal-order-details').innerHTML=[['Clase',o.class_code],['Fecha de creación',dateLabel(o.created_date)],['Cuenta contrato',o.account_no],['Sector',o.sector],['Dirección',o.address],['Descripción',o.description],['Último corte',dateLabel(o.last_seen_date)],['Estado del sistema',o.source_state]].filter(x=>x[1]).map(([label,value])=>`<div><label>${esc(label)}</label><strong>${esc(value)}</strong></div>`).join('');
    $('edit-status').value=o.status||'PENDIENTE';$('edit-assignee').value=o.assigned_to||'';$('edit-due').value=o.due_date||'';$('edit-notes').value=o.notes||'';$('modal-backdrop').classList.remove('hidden');loadOrderLogs(id);
  }
  async function loadOrderLogs(id){
    const target=$('modal-logs');target.innerHTML='<p class="muted small">Consultando gestiones…</p>';
    try{
      let logs=[];
      if(isCloud()){
        const {data,error}=await client.from('work_logs').select('changed_at,old_status,new_status,old_assigned_to,new_assigned_to,notes').eq('order_no',id).order('changed_at',{ascending:false}).limit(12);
        if(error)throw error;logs=data||[];
      }else{logs=(db.logs||[]).filter(x=>x.order_no===id).sort((a,b)=>b.changed_at.localeCompare(a.changed_at)).slice(0,12);}
      if(activeOrderId!==id)return;
      target.innerHTML=logs.length?logs.map(x=>`<div class="log-entry"><div>${esc(new Date(x.changed_at).toLocaleString('es-EC'))}</div><strong>${esc(STATUS[x.old_status]||x.old_status||'—')} → ${esc(STATUS[x.new_status]||x.new_status||'—')}</strong><small>Responsable: ${esc(x.new_assigned_to||'Sin asignar')}</small>${x.notes?`<p>${esc(x.notes)}</p>`:''}</div>`).join(''):'<p class="muted small">Aún no se registran cambios de gestión para esta orden.</p>';
    }catch(err){target.innerHTML=`<p class="muted small">No fue posible recuperar el historial: ${esc(err.message)}</p>`;}
  }
  function closeModal(){activeOrderId=null;$('modal-backdrop').classList.add('hidden');}
  async function saveOrder(event){event.preventDefault();const id=activeOrderId,o=db.orders.find(x=>x.order_no===id);if(!o)return;
    const patch={status:$('edit-status').value,assigned_to:toText($('edit-assignee').value,120),due_date:$('edit-due').value||null,notes:toText($('edit-notes').value,5000),updated_at:new Date().toISOString(),updated_by:user?.id||null};
    setBusy(true);
    try{
      if(isCloud()){const {error}=await client.rpc('update_order_management',{p_order_no:id,p_status:patch.status,p_assigned_to:patch.assigned_to,p_due_date:patch.due_date,p_notes:patch.notes});if(error)throw error;}else{db.logs=db.logs||[];db.logs.push({order_no:id,old_status:o.status,new_status:patch.status,old_assigned_to:o.assigned_to||'',new_assigned_to:patch.assigned_to,notes:patch.notes,changed_at:new Date().toISOString()});Object.assign(o,patch);saveLocal();}
      closeModal();await reloadData();notify(`Orden ${id} actualizada correctamente.`);
    }catch(e){notify('No se pudo guardar: '+e.message,true);}finally{setBusy(false);}
  }
  function detectHeaders(grid){let best=-1,idx=0;for(let i=0;i<Math.min(grid.length,22);i++){let score=0;for(const c of grid[i]){const h=normal(c);for(const [, , aliases] of mapDefs)if(aliases.includes(h))score+=4;else if(aliases.some(a=>h.includes(a)&&a.length>6))score+=1;}if(score>best){best=score;idx=i;}}return idx;}
  function mapHeaders(headers){return Object.fromEntries(mapDefs.map(([key,,aliases])=>{let idx=headers.findIndex(h=>aliases.includes(normal(h)));if(idx<0)idx=headers.findIndex(h=>aliases.some(a=>a.length>8&&normal(h).includes(a)));return [key,idx];}));}
  async function handleFile(file){
    if(!file)return;if(!/\.(xlsx|xls)$/i.test(file.name))return notify('Selecciona un archivo .xlsx o .xls',true);
    if(file.size>35*1024*1024)return notify('El archivo supera el límite sugerido de 35 MB.',true);
    if(!window.XLSX){notify('No se pudo cargar el lector de Excel. Comprueba tu conexión a Internet.',true);return;}
    try{const data=await file.arrayBuffer(),book=window.XLSX.read(data,{type:'array',cellDates:true});let best=null;
      for(const sheetName of book.SheetNames){const grid=window.XLSX.utils.sheet_to_json(book.Sheets[sheetName],{header:1,defval:'',raw:false,blankrows:false});if(!grid.length)continue;const idx=detectHeaders(grid);const mapping=mapHeaders(grid[idx]||[]);const score=Object.values(mapping).filter(x=>x>=0).length+(mapping.order_no>=0?15:0);if(!best||score>best.score)best={grid,idx,mapping,sheetName,score};}
      if(!best)throw new Error('El archivo no contiene filas legibles.');parsedFile={fileName:file.name,...best};
      $('preview-panel').classList.remove('hidden');$('preview-title').textContent=`Vista previa: ${file.name}`;$('preview-caption').textContent=`Hoja: ${best.sheetName} · Encabezados en fila ${best.idx+1}`;
      $('column-mapping').innerHTML=mapDefs.map(([key,label])=>`<label>${label}<select class="map-select" data-field="${key}"><option value="-1">No disponible</option>${(best.grid[best.idx]||[]).map((x,i)=>`<option value="${i}" ${best.mapping[key]===i?'selected':''}>${esc(toText(x,65)||`Columna ${i+1}`)}</option>`).join('')}</select></label>`).join('');
      refreshPreview();$('preview-panel').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){notify('Error al leer el Excel: '+e.message,true);}
  }
  function buildNormalized(){if(!parsedFile)return {rows:[],duplicates:0,blank:0}; const map=Object.fromEntries([...document.querySelectorAll('.map-select')].map(x=>[x.dataset.field,Number(x.value)]));if(map.order_no<0)return {rows:[],duplicates:0,blank:0,error:'Debes elegir la columna Número de orden.'};
    let blank=0,duplicates=0;const seen=new Set(),rows=[];
    for(const line of parsedFile.grid.slice(parsedFile.idx+1)){
      const get=(k,n=250)=>map[k]<0?'':toText(line[map[k]],n);
      const id=trimNumber(get('order_no',70));if(!id){blank++;continue;}if(seen.has(id)){duplicates++;continue;}
      seen.add(id);rows.push({order_no:id,class_code: get('class_code',24).toUpperCase()||'SIN CLASE',created_date:dateISO(get('created_date')),account_no:trimNumber(get('account_no',80)),sector:get('sector',160),address:get('address',250),customer:get('customer',160),description:get('description',500),source_state:get('source_state',100)});
      if(rows.length>20000)return {rows:[],duplicates,blank,error:'Máximo 20.000 órdenes por archivo. Separa el reporte en archivos más pequeños.'};
    }
    return {rows,duplicates,blank};
  }
  function refreshPreview(){const data=buildNormalized();const valid=data.rows.length>0&&!data.error;
    $('confirm-import').disabled=!valid;
    $('preview-validation').textContent=data.error||`${num(data.rows.length)} OT únicas · ${num(data.duplicates)} duplicadas omitidas · ${num(data.blank)} filas sin número`;
    $('preview-table').innerHTML=tableHtml(data.rows.slice(0,5).map(x=>({...x,status:'PENDIENTE',first_seen_date:$('cut-date').value})),false);
  }
  async function confirmImport(){const {rows,duplicates}=buildNormalized();if(!rows.length){notify('No hay órdenes válidas.',true);return;}const cutDate=$('cut-date').value;
    if(!dateISO(cutDate)){notify('Indica una fecha de corte válida.',true);return;}
    const last=currentImport();if(last&&cutDate<last.cut_date){notify(`El corte (${dateLabel(cutDate)}) es anterior al último (${dateLabel(last.cut_date)}). Revisa la fecha.`,true);return;}
    if(!window.confirm(`Se registrarán ${num(rows.length)} órdenes correspondientes al ${dateLabel(cutDate)}. ¿Continuar?`))return;
    setBusy(true,`Importando ${num(rows.length)}…`);let inserted=null;
    try{
      if(isCloud()){
        const response=await client.from('imports').insert({file_name:parsedFile.fileName,cut_date:cutDate,row_count:0,status:'procesando',uploaded_by:user.id}).select('id').single();if(response.error)throw response.error;inserted=response.data.id;
        for(let i=0;i<rows.length;i+=200){const {error}=await client.rpc('ingest_order_batch',{p_import_id:inserted,p_cut_date:cutDate,p_rows:rows.slice(i,i+200)});if(error)throw error;$('confirm-import').textContent=`Importando ${num(Math.min(rows.length,i+200))}/${num(rows.length)}`;}
        const res=await client.rpc('finalize_order_import',{p_import_id:inserted});if(res.error)throw res.error;
      }else{
        const id=uid(),oldMap=new Map(db.orders.map(o=>[o.order_no,o]));
        for(const x of rows){const prev=oldMap.get(x.order_no);if(prev){if(cutDate>=prev.last_seen_date){Object.assign(prev,{...x,created_date:x.created_date||prev.created_date||null,last_seen_date:cutDate,last_import_id:id});}}else{oldMap.set(x.order_no,{...x,first_seen_date:cutDate,last_seen_date:cutDate,last_import_id:id,status:'PENDIENTE',assigned_to:'',notes:'',due_date:null,updated_at:null,updated_by:null});}}
        db.orders=[...oldMap.values()];db.imports.push({id,file_name:parsedFile.fileName,cut_date:cutDate,row_count:rows.length,status:'completada',created_at:new Date().toISOString()});db.snapshots[id]=rows.map(x=>x.order_no);saveLocal();
      }
      parsedFile=null;$('excel-input').value='';$('preview-panel').classList.add('hidden');await reloadData();setPage('dashboard');notify(`Importación realizada: ${num(rows.length)} órdenes del ${dateLabel(cutDate)}${duplicates?` (${duplicates} duplicadas omitidas)`:''}.`);
    }catch(e){if(isCloud()&&inserted){await client.from('imports').update({status:'error'}).eq('id',inserted);}notify('Error durante la carga: '+e.message,true);console.error(e);}finally{setBusy(false);}
  }
  function exportFiltered(){if(!window.XLSX)return notify('Lector de Excel no disponible; verifica Internet.',true);
    const rows=filteredOrders().map(o=>({'Número de orden':o.order_no,'Clase de orden':o.class_code,'Fecha creación':o.created_date,'Cuenta contrato':o.account_no,'Sector':o.sector,'Dirección':o.address,'Descripción':o.description,'Estado gestión':STATUS[o.status]||o.status,'Responsable':o.assigned_to,'Fecha compromiso':o.due_date,'Observaciones':o.notes,'Última aparición':o.last_seen_date}));
    if(!rows.length)return notify('No hay órdenes para exportar.',true);
    const ws=window.XLSX.utils.json_to_sheet(rows),wb=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(wb,ws,'Seguimiento');window.XLSX.writeFile(wb,`Seguimiento_Conocoto_${nowDate()}.xlsx`);
  }
  function bind(){
    for(const x of document.querySelectorAll('.nav-link'))x.addEventListener('click',()=>setPage(x.dataset.page));
    $('menu-toggle').addEventListener('click',()=>$('sidebar').classList.toggle('open'));
    $('refresh-btn').addEventListener('click',reloadData);
    $('quick-upload').addEventListener('click',()=>setPage('imports'));$('see-all').addEventListener('click',()=>setPage('orders'));
    $('open-config').addEventListener('click',()=>{setPage('imports');notify('Para sincronizar iPad y PC: configura Supabase y publica el proyecto en GitHub Pages. Consulta README.md.');});
    $('user-btn').addEventListener('click',async()=>{if(!isCloud())return notify('Estás en modo local. Para compartir la información, configura Supabase.');if(confirm('¿Cerrar sesión de esta cuenta?')){await client.auth.signOut();user=null;db={orders:[],imports:[],snapshots:{},logs:[]};renderAll();$('auth-backdrop').classList.remove('hidden');}});
    ['search','filter-scope','filter-class','filter-status'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',()=>{pageIndex=0;renderOrders();}));
    $('prev-page').addEventListener('click',()=>{pageIndex--;renderOrders();});$('next-page').addEventListener('click',()=>{pageIndex++;renderOrders();});
    document.addEventListener('click',e=>{const btn=e.target.closest('.manage-btn');if(btn)openOrder(btn.dataset.id);});
    $('close-modal').addEventListener('click',closeModal);$('cancel-modal').addEventListener('click',closeModal);$('modal-backdrop').addEventListener('click',e=>{if(e.target===$('modal-backdrop'))closeModal();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});$('edit-form').addEventListener('submit',saveOrder);
    $('excel-input').addEventListener('change',e=>handleFile(e.target.files?.[0]));$('column-mapping').addEventListener('change',refreshPreview);$('cancel-preview').addEventListener('click',()=>{parsedFile=null;$('preview-panel').classList.add('hidden');$('excel-input').value='';});
    $('confirm-import').addEventListener('click',confirmImport);$('export-btn').addEventListener('click',exportFiltered);
    $('auth-form').addEventListener('submit',async e=>{e.preventDefault();if(!client)return;setBusy(true);try{const {data,error}=await client.auth.signInWithPassword({email:$('auth-email').value.trim(),password:$('auth-password').value});if(error)throw error;await onLogin(data.user);}catch(err){notify('No se pudo iniciar sesión: '+err.message,true);}finally{setBusy(false);}});
  }
  async function init(){
    $('cut-date').value=nowDate();$('footer-year').textContent=String(new Date().getFullYear());bind();
    if(isCloud())await initializeCloud();else{db=getLocal();renderAll();}
  }
  window.CONOCOTO_APP_TEST={normal,dateISO,mapHeaders,detectHeaders,buildNormalized};
  init();
})();
