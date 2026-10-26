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
  // Exclusión permanente, también sobre registros de versiones anteriores.
  const EXCLUDED_CLASSES = new Set(['DC01','CADE','RC01','EMER']);
  const allowed = (o) => !EXCLUDED_CLASSES.has(String(o?.class_code ?? o ?? '').trim().toUpperCase());
  // Coincidencia de vía solo aproximada: sin geocodificación no implica proximidad real.
  function streetKey(value){return normal(value).replace(/\b(?:s n|sn|casa|cs|lote|lt|nro|numero|num)\s*\d*[a-z]*\b/g,' ').replace(/\s+[a-z]?\d+[a-z]*(?:\s*[-/]\s*\d+)?\s*$/g,'').replace(/\s+/g,' ').trim().toUpperCase()||'CALLE SIN IDENTIFICAR';}
  const hasRealSourceAssignee = o => Boolean(toText(o?.source_workplace||'').trim() && !/^(DUMMY|SIN ASIGNAR|N\/A)$/i.test(toText(o?.source_workplace||'').trim()));
  const displayAssignee = o => o.assigned_to|| (hasRealSourceAssignee(o)?`Sistema: ${o.source_workplace}`:'Sin asignar');
  const STORE_KEY = 'conocoto-control-v1';
  let client=null, user=null, activeOrderId=null, currentPage='dashboard', pageIndex=0, toastTimer=null;
  let db={orders:[],imports:[],snapshots:{},logs:[]};
  let parsedFile=null;
  let pageSize=30;
  const mapDefs = [
    ['order_no','Número de orden *',['numero de orden','n orden','nro orden','no orden','num orden','orden','orden de trabajo','ot','numero ot','numero orden','n de orden','nº orden','n° orden']],
    ['class_code','Clase de orden',['clase de orden','clase orden','clase','tipo de orden','tipo de ot','clase ot']],
    ['created_date','Fecha de creación',['fecha de creacion','fecha creacion','fecha de la orden','fecha orden','fecha solicitud','fecha de entrada','fecha entrada','f creacion','fecha registro']],
    ['account_no','Cuenta contrato',['cuenta contrato','cuenta contractual','cuenta','contrato','nro cuenta','numero de cuenta']],
    ['sector','Distrito / parroquia',['distrito','sector','parroquia','localidad','barrio','zona','ubicacion','sector de trabajo']],
    ['area_name','Descripción de Área',['descripcion de area','area de empresa','area operativa']],
    ['pm_activity','Descrip. Act.PM.',['desc act pm','descripcion act pm','descripcion actividad pm','actividad pm','desc act p m','descripcion de actividad pm']],
    ['source_workplace','Pto.tbjo.resp.',['pto tbjo resp','puesto trabajo responsable','puesto de trabajo responsable','puesto trabajo resp']],
    ['source_user_status','Status usuario',['status usuario','estado usuario','estatus usuario']],
    ['source_system_status','Status sistema',['status sistema','estado sistema','estatus sistema']],
    ['source_extreme_start','Fe.inic.extrema',['fe inic extrema','fecha inicio extrema','fe inicio extrema']],
    ['source_extreme_end','Fe.fin extrema',['fe fin extrema','fecha fin extrema']],
    ['source_execution_date','Fecha EjecuciónTrab',['fecha ejecuciontrab','fecha ejecucion trab','fecha ejecucion trabajo']],
    ['source_priority','Prioridad de origen',['prioridad']],
    ['address','Dirección',['direccion','direccion servicio','direccion del cliente','calle','direccion instalacion']],
    ['customer','Cliente',['cliente','nombre cliente','nombre del cliente','abonado','interesado']],
    ['description','Descripción / texto',['texto breve','descripcion','texto orden','detalle','motivo','observacion','descripcion de orden']],
    ['source_state','Estado en el Excel',['estado','estatus','estado de la orden','estatus de orden']]
  ];
  const normal = (x) => toText(x,160).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const dateISO = (v) => {
    if (v===null || v===undefined || v==='') return null;
    if (v instanceof Date && !isNaN(+v)) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
    if(typeof v==='number' && Number.isFinite(v) && v>20000 && v<100000){const d=new Date(Date.UTC(1899,11,30)+Math.round(v)*86400000);return d.toISOString().slice(0,10);}
    const s=String(v).trim();
    if(/^\d{5}(?:\.0+)?$/.test(s) && Number(s)>20000 && Number(s)<100000){const d=new Date(Date.UTC(1899,11,30)+Math.round(Number(s))*86400000);return d.toISOString().slice(0,10);}
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
        db={orders:all.filter(allowed),imports:imports||[],snapshots:{},logs:[]};
        const sorted=sortedImports();
        for(const imp of sorted.slice(0,2)) db.snapshots[imp.id]=await fetchSnapshot(imp.id);
      }else{db=getLocal();db.orders=db.orders.filter(allowed);}
      renderAll();
    }catch(err){console.error(err);notify('No se pudieron consultar los datos: '+err.message,true);}
  }
  async function fetchSnapshot(id){let ids=[],pos=0;while(true){const {data,error}=await client.from('import_lines').select('order_no').eq('import_id',id).range(pos,pos+999);if(error)throw error;ids.push(...data.map(x=>x.order_no));if(data.length<1000)break;pos+=1000;}const allowedIds=new Set(db.orders.map(o=>o.order_no));return ids.filter(x=>allowedIds.has(x));}
  function sortedImports(){return [...db.imports].filter(x=>x.status==='completada').sort((a,b)=>b.created_at.localeCompare(a.created_at));}
  function currentImport(){return sortedImports()[0]||null;}
  function beforeImport(){return sortedImports()[1]||null;}
  function currentOrders(){const latest=currentImport();return latest?db.orders.filter(o=>allowed(o)&&o.last_import_id===latest.id):[];}
  function comparative(){const a=currentImport(), b=beforeImport();if(!a||!b)return {newCount:null,missingCount:null};const included=new Set(db.orders.filter(allowed).map(o=>o.order_no));const now=new Set((db.snapshots[a.id]||[]).filter(x=>included.has(x))),prev=new Set((db.snapshots[b.id]||[]).filter(x=>included.has(x)));let n=0,m=0;for(const x of now)if(!prev.has(x))n++;for(const x of prev)if(!now.has(x))m++;return {newCount:n,missingCount:m};}
  function orderDays(o){return daysDiff(o.created_date||o.first_seen_date,currentImport()?.cut_date||nowDate());}
  function setPage(name){currentPage=name;pageIndex=0;document.querySelectorAll('.nav-link').forEach(x=>x.classList.toggle('active',x.dataset.page===name));document.querySelectorAll('.page').forEach(x=>x.classList.toggle('hidden',x.id!==`page-${name}`));$('page-title').textContent=({dashboard:'Resumen de pendientes',orders:'Órdenes de trabajo',activities:'Clases y actividades',planning:'Planificación por sector',imports:'Actualización de datos',history:'Historial de importaciones'})[name];$('sidebar').classList.remove('open');renderAll();}
  function renderAll(){const latest=currentImport();$('cutoff-label').textContent=latest?`Corte: ${dateLabel(latest.cut_date)}`:'Sin corte cargado';renderDashboard();renderOrders();renderActivities();renderPlanning();renderHistory();}
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
    switch($('filter-scope').value){case 'missing':list=db.orders.filter(o=>last && o.last_import_id!==last.id);break;case 'all':list=db.orders.filter(allowed);break;default:list=currentOrders();}
    const q=normal($('search').value),cls=$('filter-class').value,st=$('filter-status').value,act=$('filter-activity').value,district=$('filter-district').value,assigned=$('filter-assigned').value;
    return list.filter(o=>allowed(o)&&(!cls||o.class_code===cls)&&(!act||(act==='__SIN_ACTIVIDAD__'?!o.pm_activity:o.pm_activity===act))&&(!district||o.sector===district)&&(!assigned||(assigned==='yes'?(Boolean(o.assigned_to)||hasRealSourceAssignee(o)):(!o.assigned_to&&!hasRealSourceAssignee(o))))&&(!st||o.status===st)&&(!q||normal([o.order_no,o.account_no,o.sector,o.address,o.customer,o.description,o.pm_activity,o.assigned_to,o.source_workplace].join(' ')).includes(q))).sort((a,b)=>{const aDone=a.status==='ATENDIDA'?1:0,bDone=b.status==='ATENDIDA'?1:0;return aDone-bDone||orderDays(b)-orderDays(a)||String(a.order_no).localeCompare(String(b.order_no));});
  }
  function tableHtml(rows,includeAssigned=true){
    if(!rows.length)return '<div class="empty-state"><strong>Sin órdenes para mostrar</strong>Carga un Excel o modifica los filtros.</div>';
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>N.º ORDEN</th><th>CLASE</th><th>DISTRITO / CALLE</th><th>ACTIVIDAD PM</th>${includeAssigned?'<th>RESPONSABLE</th>':''}<th>ANTIGÜEDAD</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>${rows.map(o=>`<tr><td><span class="ot">${esc(o.order_no)}</span></td><td><span class="tag class">${esc(o.class_code||'—')}</span></td><td>${esc(o.sector||'—')}<br><small>${esc(o.address||'—')}</small></td><td>${esc(o.pm_activity||o.description||'—')}</td>${includeAssigned?`<td>${esc(displayAssignee(o))}</td>`:''}<td>${num(orderDays(o))} días</td><td><span class="tag ${esc(o.status)}">${esc(STATUS[o.status]||o.status)}</span></td><td><button class="row-btn manage-btn" data-id="${esc(o.order_no)}">Gestionar →</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  function renderOrders(){
    const classes=[...new Set(db.orders.filter(allowed).map(o=>o.class_code).filter(Boolean))].sort(); const sel=$('filter-class'),prior=sel.value;
    sel.innerHTML='<option value="">Todas las clases</option>'+classes.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');if(classes.includes(prior))sel.value=prior;
    const refreshSel=(id,values,label)=>{const el=$(id),v=el.value;el.innerHTML=`<option value="">${esc(label)}</option>`+values.map(x=>`<option value="${esc(x)}">${esc(x==='__SIN_ACTIVIDAD__'?'Sin descripción Act.PM':x)}</option>`).join('');if(values.includes(v))el.value=v;};
    const sourceList=db.orders.filter(allowed);
    refreshSel('filter-activity',[...new Set(sourceList.map(o=>o.pm_activity).filter(Boolean))].sort().concat(sourceList.some(o=>!o.pm_activity)?['__SIN_ACTIVIDAD__']:[]),'Todas las actividades PM');
    refreshSel('filter-district',[...new Set(sourceList.map(o=>o.sector).filter(Boolean))].sort(),'Todos los distritos');
    const list=filteredOrders(),pages=Math.max(1,Math.ceil(list.length/pageSize));pageIndex=Math.min(pageIndex,pages-1);
    $('orders-count').textContent=`${num(list.length)} órdenes · ${num(currentOrders().length)} en último corte`;
    $('orders-table').innerHTML=tableHtml(list.slice(pageIndex*pageSize,(pageIndex+1)*pageSize));$('pagination-label').textContent=`Página ${pageIndex+1} de ${pages}`;
    $('prev-page').disabled=pageIndex===0;$('next-page').disabled=pageIndex>=pages-1;
  }
  // Vista jerárquica por clase y Descrip. Act.PM; cada grupo abre OT gestionables.
  function renderActivities(){
    const base=currentOrders().filter(allowed),byClass=new Map();
    for(const o of base){const cls=o.class_code||'SIN CLASE',activity=o.pm_activity||'SIN DESCRIPCIÓN ACT.PM';if(!byClass.has(cls))byClass.set(cls,new Map());const x=byClass.get(cls);x.set(activity,(x.get(activity)||0)+1);}
    $('activities-summary').textContent=`${num(base.length)} órdenes internas · ${byClass.size} clases`;
    $('activity-groups').innerHTML=[...byClass.entries()].sort((a,b)=>[...b[1].values()].reduce((s,x)=>s+x,0)-[...a[1].values()].reduce((s,x)=>s+x,0)).map(([cls,acts])=>{
      const count=[...acts.values()].reduce((s,n)=>s+n,0);
      return `<details class="activity-block" open><summary><strong>${esc(cls)}</strong><span>${num(count)} OT · ${acts.size} actividades</span></summary><div class="activity-items">${[...acts.entries()].sort((a,b)=>b[1]-a[1]).map(([act,n])=>`<div class="activity-item"><div><b>${esc(act)}</b><small>${num(n)} órdenes</small></div><button class="outline-btn view-activity" data-cls="${esc(cls)}" data-act="${esc(act==='SIN DESCRIPCIÓN ACT.PM'?'__SIN_ACTIVIDAD__':act)}">Ver y gestionar</button></div>`).join('')}</div></details>`;
    }).join('') || '<div class="empty-state">Importa un archivo Excel para consultar clases y actividades PM.</div>';
  }
  // Agrupar por distrito y nombre de calle; NO calcula coordenadas/distancias ni garantiza calles adyacentes.
  function planningGroups(){
    const groups=new Map();for(const o of currentOrders().filter(allowed).filter(o=>o.status!=='ATENDIDA')){
      const key=`${o.sector||'SIN DISTRITO'}|${streetKey(o.address)}`;
      if(!groups.has(key))groups.set(key,{key,district:o.sector||'SIN DISTRITO',street:streetKey(o.address),orders:[]});groups.get(key).orders.push(o);
    }return [...groups.values()].sort((a,b)=>b.orders.length-a.orders.length||a.district.localeCompare(b.district)||a.street.localeCompare(b.street));
  }
  function renderPlanning(){
    const all=planningGroups(),districts=[...new Set(all.map(x=>x.district))].sort(),sel=$('plan-district'),prev=sel.value;
    sel.innerHTML='<option value="">Todos los distritos</option>'+districts.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');if(districts.includes(prev))sel.value=prev;
    const q=normal($('plan-search').value),filtered=all.filter(g=>(!sel.value||g.district===sel.value)&&(!q||normal(g.district+' '+g.street).includes(q)));
    $('plan-count').textContent=`${num(filtered.length)} grupos · ${num(filtered.reduce((s,g)=>s+g.orders.length,0))} órdenes por organizar`;
    $('planning-groups').innerHTML=filtered.slice(0,150).map(g=>`<article class="plan-group"><div><div class="plan-area">${esc(g.district)}</div><h3>${esc(g.street)}</h3><p class="muted small">${num(g.orders.length)} OT · ${num(g.orders.filter(x=>!x.assigned_to&&!hasRealSourceAssignee(x)).length)} sin asignación</p><div class="plan-activities">${esc([...new Set(g.orders.map(o=>o.pm_activity).filter(Boolean))].slice(0,3).join(' · ')||'Varias actividades')}</div></div><div class="plan-actions"><button class="outline-btn plan-view" data-key="${esc(g.key)}">Ver OT</button><button class="primary-btn plan-assign" data-key="${esc(g.key)}">Planificar</button></div></article>`).join('')||'<div class="empty-state">No hay grupos de trabajo para estos filtros.</div>';
  }
  let activePlanKey=null;
  function openPlan(key){const group=planningGroups().find(g=>g.key===key);if(!group)return;
    activePlanKey=key;$('plan-modal-title').textContent=`Planificar: ${group.district} / ${group.street}`;
    $('plan-modal-desc').textContent=`${group.orders.length} órdenes en la misma vía normalizada. Verifica las direcciones antes del recorrido; no es una ruta geográfica optimizada.`;
    $('plan-assignee').value='';$('plan-date').value=nowDate();$('plan-group-name').value=`${group.district} · ${group.street}`.slice(0,120);
    $('plan-modal-backdrop').classList.remove('hidden');
  }
  async function savePlan(e){e.preventDefault();const group=planningGroups().find(g=>g.key===activePlanKey);if(!group)return;
    const assigned=toText($('plan-assignee').value,120),planned=$('plan-date').value,route=toText($('plan-group-name').value,120);
    if(!assigned||!planned)return notify('Indica responsable y fecha de planificación.',true);
    if(!confirm(`¿Planificar ${group.orders.length} órdenes para ${assigned} el ${dateLabel(planned)}?`))return;
    $('plan-save').disabled=true;
    try{
      for(const o of group.orders){
        if(isCloud()){
          const {error}=await client.rpc('update_order_management_v2',{p_order_no:o.order_no,p_status:o.status||'PENDIENTE',p_assigned_to:assigned,p_due_date:o.due_date||null,p_notes:o.notes||'',p_start_date:o.start_date||null,p_end_date:o.end_date||null,p_planned_date:planned,p_route_group:route});if(error)throw error;
        }else{const oldAssign=o.assigned_to||'';Object.assign(o,{assigned_to:assigned,planned_date:planned,route_group:route,updated_at:new Date().toISOString()});db.logs.push({order_no:o.order_no,old_status:o.status,new_status:o.status,old_assigned_to:oldAssign,new_assigned_to:assigned,new_planned_date:planned,notes:`Planificación: ${dateLabel(planned)} · ${route}`,changed_at:new Date().toISOString()});}
      }
      if(!isCloud())saveLocal();$('plan-modal-backdrop').classList.add('hidden');activePlanKey=null;await reloadData();notify(`Se planificaron ${group.orders.length} órdenes para ${assigned}.`);
    }catch(err){notify('No se pudo guardar la planificación completa: '+err.message,true);}finally{$('plan-save').disabled=false;}
  }
  function renderHistory(){const imports=sortedImports();const allowedIds=new Set(db.orders.filter(allowed).map(o=>o.order_no));$('history-total').textContent=`${imports.length} CORTE(S)`;
    $('history-table').innerHTML=imports.length?imports.map((x,i)=>`<div class="history-row"><div><div class="history-date">${dateLabel(x.cut_date)}</div><div class="history-meta">${i===0?'ÚLTIMO CORTE':'HISTÓRICO'}</div></div><div><strong>${esc(x.file_name)}</strong><div class="history-meta">Cargado: ${new Date(x.created_at).toLocaleString('es-EC')}</div></div><div><strong>${db.snapshots[x.id]?num(db.snapshots[x.id].filter(id=>allowedIds.has(id)).length)+' OT incluidas':'Corte cargado'}</strong></div><div><span class="tag ATENDIDA">Completado</span></div></div>`).join(''):'<div class="empty-state"><strong>Aún no hay archivos importados</strong>Los cortes diarios se mostrarán aquí.</div>';
  }
  function openOrder(id){const o=db.orders.find(x=>x.order_no===id);if(!o||!allowed(o))return;
    activeOrderId=id;$('modal-title').textContent=`Orden ${o.order_no}`;
    $('modal-order-details').innerHTML=[['Clase',o.class_code],['Fecha de creación',dateLabel(o.created_date)],['Cuenta contrato',o.account_no],['Sector',o.sector],['Dirección',o.address],['Descripción Act.PM',o.pm_activity],['Texto breve',o.description],['Puesto responsable del sistema',hasRealSourceAssignee(o)?o.source_workplace:'Sin asignar / DUMMY'],['Status usuario',o.source_user_status],['Status sistema',o.source_system_status],['Fecha límite inicio (SAP)',dateLabel(o.source_extreme_start)],['Fecha límite fin (SAP)',dateLabel(o.source_extreme_end)],['Fecha ejecución sistema',dateLabel(o.source_execution_date)],['Prioridad SAP',o.source_priority],['Último corte',dateLabel(o.last_seen_date)],['Estado del sistema',o.source_state]].filter(x=>x[1]).map(([label,value])=>`<div><label>${esc(label)}</label><strong>${esc(value)}</strong></div>`).join('');
    $('edit-status').value=o.status||'PENDIENTE';$('edit-assignee').value=o.assigned_to||'';$('edit-due').value=o.due_date||'';$('edit-notes').value=o.notes||'';$('edit-start').value=o.start_date||'';$('edit-end').value=o.end_date||'';$('edit-planned').value=o.planned_date||'';$('edit-route-group').value=o.route_group||'';$('modal-backdrop').classList.remove('hidden');loadOrderLogs(id);
  }
  async function loadOrderLogs(id){
    const target=$('modal-logs');target.innerHTML='<p class="muted small">Consultando gestiones…</p>';
    try{
      let logs=[];
      if(isCloud()){
        const {data,error}=await client.from('work_logs').select('changed_at,old_status,new_status,old_assigned_to,new_assigned_to,notes,old_start_date,new_start_date,old_end_date,new_end_date,old_planned_date,new_planned_date').eq('order_no',id).order('changed_at',{ascending:false}).limit(12);
        if(error)throw error;logs=data||[];
      }else{logs=(db.logs||[]).filter(x=>x.order_no===id).sort((a,b)=>b.changed_at.localeCompare(a.changed_at)).slice(0,12);}
      if(activeOrderId!==id)return;
      target.innerHTML=logs.length?logs.map(x=>`<div class="log-entry"><div>${esc(new Date(x.changed_at).toLocaleString('es-EC'))}</div><strong>${esc(STATUS[x.old_status]||x.old_status||'—')} → ${esc(STATUS[x.new_status]||x.new_status||'—')}</strong><small>Responsable: ${esc(x.new_assigned_to||'Sin asignar')}</small>${x.new_start_date?`<small>Inicio: ${dateLabel(x.new_start_date)}</small>`:''}${x.new_end_date?`<small>Fin: ${dateLabel(x.new_end_date)}</small>`:''}${x.new_planned_date?`<small>Planificada: ${dateLabel(x.new_planned_date)}</small>`:''}${x.notes?`<p>${esc(x.notes)}</p>`:''}</div>`).join(''):'<p class="muted small">Aún no se registran cambios de gestión para esta orden.</p>';
    }catch(err){target.innerHTML=`<p class="muted small">No fue posible recuperar el historial: ${esc(err.message)}</p>`;}
  }
  function closeModal(){activeOrderId=null;$('modal-backdrop').classList.add('hidden');}
  async function saveOrder(event){event.preventDefault();const id=activeOrderId,o=db.orders.find(x=>x.order_no===id);if(!o)return;
    const patch={status:$('edit-status').value,assigned_to:toText($('edit-assignee').value,120),due_date:$('edit-due').value||null,start_date:$('edit-start').value||null,end_date:$('edit-end').value||null,planned_date:$('edit-planned').value||null,route_group:toText($('edit-route-group').value,120),notes:toText($('edit-notes').value,5000),updated_at:new Date().toISOString(),updated_by:user?.id||null};
    if(patch.start_date&&patch.end_date&&patch.end_date<patch.start_date)return notify('Fecha fin no puede ser anterior a fecha inicio.',true);
    setBusy(true);
    try{
      if(isCloud()){const {error}=await client.rpc('update_order_management_v2',{p_order_no:id,p_status:patch.status,p_assigned_to:patch.assigned_to,p_due_date:patch.due_date,p_notes:patch.notes,p_start_date:patch.start_date,p_end_date:patch.end_date,p_planned_date:patch.planned_date,p_route_group:patch.route_group});if(error)throw error;}else{db.logs=db.logs||[];db.logs.push({order_no:id,old_status:o.status,new_status:patch.status,old_assigned_to:o.assigned_to||'',new_assigned_to:patch.assigned_to,notes:patch.notes,new_start_date:patch.start_date,new_end_date:patch.end_date,new_planned_date:patch.planned_date,changed_at:new Date().toISOString()});Object.assign(o,patch);saveLocal();}
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
      for(const sheetName of book.SheetNames){const grid=window.XLSX.utils.sheet_to_json(book.Sheets[sheetName],{header:1,defval:'',raw:true,blankrows:false});if(!grid.length)continue;const idx=detectHeaders(grid);const mapping=mapHeaders(grid[idx]||[]);const score=Object.values(mapping).filter(x=>x>=0).length+(mapping.order_no>=0?15:0);if(!best||score>best.score)best={grid,idx,mapping,sheetName,score};}
      if(!best)throw new Error('El archivo no contiene filas legibles.');parsedFile={fileName:file.name,...best};
      $('preview-panel').classList.remove('hidden');$('preview-title').textContent=`Vista previa: ${file.name}`;$('preview-caption').textContent=`Hoja: ${best.sheetName} · Encabezados en fila ${best.idx+1}`;
      $('column-mapping').innerHTML=mapDefs.map(([key,label])=>`<label>${label}<select class="map-select" data-field="${key}"><option value="-1">No disponible</option>${(best.grid[best.idx]||[]).map((x,i)=>`<option value="${i}" ${best.mapping[key]===i?'selected':''}>${esc(toText(x,65)||`Columna ${i+1}`)}</option>`).join('')}</select></label>`).join('');
      refreshPreview();$('preview-panel').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){notify('Error al leer el Excel: '+e.message,true);}
  }
  function buildNormalized(){if(!parsedFile)return {rows:[],duplicates:0,blank:0,excluded:0}; const map=Object.fromEntries([...document.querySelectorAll('.map-select')].map(x=>[x.dataset.field,Number(x.value)]));if(map.order_no<0)return {rows:[],duplicates:0,blank:0,error:'Debes elegir la columna Número de orden.'};
    let blank=0,duplicates=0,excluded=0;const seen=new Set(),rows=[];
    for(const line of parsedFile.grid.slice(parsedFile.idx+1)){
      const get=(k,n=250)=>map[k]<0?'':toText(line[map[k]],n);
      const id=trimNumber(get('order_no',70));if(!id){blank++;continue;}
      const class_code=get('class_code',24).toUpperCase()||'SIN CLASE';
      if(!allowed(class_code)){excluded++;continue;}
      if(seen.has(id)){duplicates++;continue;}
      seen.add(id);rows.push({order_no:id,class_code,created_date:dateISO(map.created_date>=0?line[map.created_date]:null),account_no:trimNumber(get('account_no',80)),sector:get('sector',160),area_name:get('area_name',160),address:get('address',250),customer:get('customer',160),description:get('description',500),pm_activity:get('pm_activity',220),source_workplace:get('source_workplace',100),source_user_status:get('source_user_status',100),source_system_status:get('source_system_status',100),source_extreme_start:dateISO(map.source_extreme_start>=0?line[map.source_extreme_start]:null),source_extreme_end:dateISO(map.source_extreme_end>=0?line[map.source_extreme_end]:null),source_execution_date:dateISO(map.source_execution_date>=0?line[map.source_execution_date]:null),source_priority:get('source_priority',100),source_state:get('source_state',100)});
      if(rows.length>20000)return {rows:[],duplicates,blank,error:'Máximo 20.000 órdenes por archivo. Separa el reporte en archivos más pequeños.'};
    }
    return {rows,duplicates,blank,excluded};
  }
  function refreshPreview(){const data=buildNormalized();const valid=data.rows.length>0&&!data.error;
    $('confirm-import').disabled=!valid;
    $('preview-validation').textContent=data.error||`${num(data.rows.length)} OT internas · ${num(data.excluded)} OT excluidas (DC01, CADE, RC01, EMER) · ${num(data.duplicates)} duplicadas · ${num(data.blank)} sin número`;
    $('preview-table').innerHTML=tableHtml(data.rows.slice(0,5).map(x=>({...x,status:'PENDIENTE',first_seen_date:$('cut-date').value})),false);
  }
  async function confirmImport(){const {rows,duplicates,excluded}=buildNormalized();if(!rows.length){notify('No hay órdenes válidas.',true);return;}const cutDate=$('cut-date').value;
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
        for(const x of rows){const prev=oldMap.get(x.order_no);if(prev){if(cutDate>=prev.last_seen_date){Object.assign(prev,{...x,created_date:x.created_date||prev.created_date||null,last_seen_date:cutDate,last_import_id:id});}}else{oldMap.set(x.order_no,{...x,first_seen_date:cutDate,last_seen_date:cutDate,last_import_id:id,status:'PENDIENTE',assigned_to:'',notes:'',start_date:null,end_date:null,planned_date:null,route_group:'',due_date:null,updated_at:null,updated_by:null});}}
        db.orders=[...oldMap.values()];db.imports.push({id,file_name:parsedFile.fileName,cut_date:cutDate,row_count:rows.length,status:'completada',created_at:new Date().toISOString()});db.snapshots[id]=rows.map(x=>x.order_no);saveLocal();
      }
      parsedFile=null;$('excel-input').value='';$('preview-panel').classList.add('hidden');await reloadData();setPage('dashboard');notify(`Importación realizada: ${num(rows.length)} órdenes del ${dateLabel(cutDate)}${duplicates?` (${duplicates} duplicadas omitidas)`:''}${excluded?` · ${excluded} excluidas automáticamente`:''}.`);
    }catch(e){if(isCloud()&&inserted){await client.from('imports').update({status:'error'}).eq('id',inserted);}notify('Error durante la carga: '+e.message,true);console.error(e);}finally{setBusy(false);}
  }
  function exportFiltered(){if(!window.XLSX)return notify('Lector de Excel no disponible; verifica Internet.',true);
    const rows=filteredOrders().filter(allowed).map(o=>({'Número de orden':o.order_no,'Clase de orden':o.class_code,'Fecha creación':o.created_date,'Cuenta contrato':o.account_no,'Distrito':o.sector,'Calle':o.address,'Desc.Act.PM':o.pm_activity,'Texto breve':o.description,'Status usuario':o.source_user_status,'Puesto tbjo. resp.':o.source_workplace,'Estado gestión':STATUS[o.status]||o.status,'Responsable gestión':o.assigned_to,'Fecha inicio real':o.start_date,'Fecha fin real':o.end_date,'Planificación':o.planned_date,'Grupo recorrido':o.route_group,'Fecha compromiso':o.due_date,'Observaciones':o.notes,'Última aparición':o.last_seen_date}));
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
    ['search','filter-scope','filter-class','filter-status','filter-activity','filter-district','filter-assigned'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',()=>{pageIndex=0;renderOrders();}));
    $('prev-page').addEventListener('click',()=>{pageIndex--;renderOrders();});$('next-page').addEventListener('click',()=>{pageIndex++;renderOrders();});
    document.addEventListener('click',e=>{const btn=e.target.closest('.manage-btn');if(btn)openOrder(btn.dataset.id);});
    $('close-modal').addEventListener('click',closeModal);$('cancel-modal').addEventListener('click',closeModal);$('modal-backdrop').addEventListener('click',e=>{if(e.target===$('modal-backdrop'))closeModal();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});$('edit-form').addEventListener('submit',saveOrder);
    $('excel-input').addEventListener('change',e=>handleFile(e.target.files?.[0]));$('column-mapping').addEventListener('change',refreshPreview);$('cancel-preview').addEventListener('click',()=>{parsedFile=null;$('preview-panel').classList.add('hidden');$('excel-input').value='';});
    $('activity-groups').addEventListener('click',e=>{const b=e.target.closest('.view-activity');if(!b)return;setPage('orders');$('filter-class').value=b.dataset.cls;$('filter-activity').value=b.dataset.act;renderOrders();});
    $('plan-district').addEventListener('change',renderPlanning);$('plan-search').addEventListener('input',renderPlanning);
    $('planning-groups').addEventListener('click',e=>{const b=e.target.closest('.plan-view,.plan-assign');if(!b)return;const g=planningGroups().find(x=>x.key===b.dataset.key);if(!g)return;
      if(b.classList.contains('plan-assign'))openPlan(g.key);else{setPage('orders');$('filter-district').value=g.district;$('search').value=g.street==='CALLE SIN IDENTIFICAR'?'':g.street;renderOrders();}
    });
    $('plan-form').addEventListener('submit',savePlan);$('plan-close').addEventListener('click',()=>{$('plan-modal-backdrop').classList.add('hidden');});$('plan-cancel').addEventListener('click',()=>{$('plan-modal-backdrop').classList.add('hidden');});
    $('confirm-import').addEventListener('click',confirmImport);$('export-btn').addEventListener('click',exportFiltered);
    $('auth-form').addEventListener('submit',async e=>{e.preventDefault();if(!client)return;setBusy(true);try{const {data,error}=await client.auth.signInWithPassword({email:$('auth-email').value.trim(),password:$('auth-password').value});if(error)throw error;await onLogin(data.user);}catch(err){notify('No se pudo iniciar sesión: '+err.message,true);}finally{setBusy(false);}});
  }
  async function init(){
    $('cut-date').value=nowDate();$('footer-year').textContent=String(new Date().getFullYear());bind();
    if(isCloud())await initializeCloud();else{db=getLocal();db.orders=db.orders.filter(allowed);renderAll();}
  }
  window.CONOCOTO_APP_TEST={normal,dateISO,mapHeaders,detectHeaders,buildNormalized,allowed,streetKey,hasRealSourceAssignee};
  init();
})();
