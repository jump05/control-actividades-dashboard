(function(){
"use strict";
const D = DASH_DATA;
const REG = D.registros;

const ESTADOS = {
  confirmado:            {label:"Confirmado",                 pill:"good",    color:"var(--good)",    group:"ok"},
  ausencia_ok:           {label:"Ausencia confirmada",         pill:"good",    color:"var(--good)",    group:"ok"},
  alerta_sede:           {label:"Marcó en otra sede",          pill:"warn",    color:"var(--warn)",    group:"alerta"},
  ausencia_sin_verificar:{label:"Ausencia sin verificar",      pill:"warn",    color:"var(--warn)",    group:"alerta"},
  ausencia_pero_marco:   {label:"Ausencia pero sí marcó",      pill:"serious", color:"var(--serious)", group:"alerta"},
  critico_sin_marcacion: {label:"Sin marcación ese día",       pill:"crit",    color:"var(--crit)",    group:"critico"},
  no_verificable:        {label:"Sede sin biométrico",         pill:"muted",   color:"var(--ink-3)",   group:"info"},
  sin_dni:               {label:"Colaborador no identificado", pill:"muted",   color:"var(--ink-3)",   group:"info"},
  fuera_rango:           {label:"Fuera de rango de marcaciones",pill:"muted",  color:"var(--ink-3)",   group:"info"},
};
const VERIF = new Set(["confirmado","alerta_sede","critico_sin_marcacion"]);
const MESES_ORDEN = ["mayo","junio","julio","agosto","septiembre"];

const fmtInt = n => n.toLocaleString("es-PE");
const fmtPct = n => (isFinite(n) ? n.toFixed(0) : "0") + "%";
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const sedeLabel = r => r.sede || "(sin sede especificada)";
const pillHtml = est => { const e = ESTADOS[est] || {label:est,pill:"muted"}; return `<span class="pill ${e.pill}">${esc(e.label)}</span>`; };

// ---------------------------------------------------------------- filtros
const state = { area:"", colab:"", mes:"", sede:"", estado:"", q:"" };

function uniqueSorted(arr){ return [...new Set(arr)].filter(Boolean).sort((a,b)=>a.localeCompare(b,"es")); }

function fillSelect(sel, values, allLabel){
  sel.innerHTML = `<option value="">${allLabel}</option>` + values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
}

const areas = uniqueSorted(REG.map(r=>r.area));
const colabs = uniqueSorted(REG.map(r=>r.colaborador));
const meses = uniqueSorted(REG.map(r=>r.mesLabel)).sort((a,b)=>MESES_ORDEN.indexOf(a)-MESES_ORDEN.indexOf(b));
const sedes = uniqueSorted(REG.map(sedeLabel));
const estadosPresentes = uniqueSorted(REG.map(r=>r.estado));

fillSelect(document.getElementById("fArea"), areas, "Todas las áreas");
fillSelect(document.getElementById("fColab"), colabs, "Todos");
fillSelect(document.getElementById("fMes"), meses, "Todos los meses");
fillSelect(document.getElementById("fSede"), sedes, "Todas las sedes");
document.getElementById("fEstado").innerHTML = `<option value="">Todos los estados</option>` +
  estadosPresentes.map(k=>`<option value="${k}">${esc((ESTADOS[k]||{label:k}).label)}</option>`).join("");

function applyFilters(){
  return REG.filter(r =>
    (!state.area || r.area===state.area) &&
    (!state.colab || r.colaborador===state.colab) &&
    (!state.mes || r.mesLabel===state.mes) &&
    (!state.sede || sedeLabel(r)===state.sede) &&
    (!state.estado || r.estado===state.estado) &&
    (!state.q || (r.colaborador+" "+sedeLabel(r)+" "+(r.detalle||"")).toLowerCase().includes(state.q))
  );
}

function renderChips(){
  const map = [["area","Área"],["colab","Colaborador"],["mes","Mes"],["sede","Sede"],["estado","Estado"]];
  const box = document.getElementById("activeF");
  box.innerHTML = map.filter(([k])=>state[k]).map(([k,l])=>
    `<span class="chipf" data-clear="${k}">${l}: <b>${esc(k==="estado"?(ESTADOS[state[k]]||{label:state[k]}).label:state[k])}</b> ✕</span>`
  ).join("");
  box.querySelectorAll("[data-clear]").forEach(el=>el.addEventListener("click",()=>{
    state[el.dataset.clear]=""; syncSelects(); renderAll();
  }));
}
function syncSelects(){
  document.getElementById("fArea").value = state.area;
  document.getElementById("fColab").value = state.colab;
  document.getElementById("fMes").value = state.mes;
  document.getElementById("fSede").value = state.sede;
  document.getElementById("fEstado").value = state.estado;
}
["fArea","fColab","fMes","fSede","fEstado"].forEach(id=>{
  const key = id.slice(1).toLowerCase();
  document.getElementById(id).addEventListener("change", e=>{ state[key]=e.target.value; renderAll(); });
});
document.getElementById("buscar").addEventListener("input", e=>{ state.q = e.target.value.trim().toLowerCase(); renderAll(); });
document.getElementById("reset").addEventListener("click", ()=>{ Object.keys(state).forEach(k=>state[k]=""); syncSelects(); document.getElementById("buscar").value=""; renderAll(); });

// ---------------------------------------------------------------- nav
document.querySelectorAll(".navitem[data-page]").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".navitem[data-page]").forEach(b=>b.classList.remove("on"));
    document.querySelectorAll(".page").forEach(p=>p.classList.remove("on"));
    btn.classList.add("on");
    document.getElementById(btn.dataset.page).classList.add("on");
  });
});

// ---------------------------------------------------------------- tema
const themeBtn = document.getElementById("theme");
function setTheme(t){
  document.documentElement.setAttribute("data-theme", t);
  themeBtn.textContent = t==="dark" ? "☀️" : "🌙";
  localStorage.setItem("ca-theme", t);
}
setTheme(localStorage.getItem("ca-theme") || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark":"light"));
themeBtn.addEventListener("click", ()=> setTheme(document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark"));

// ---------------------------------------------------------------- render
function kpiCard(label, value, sub, cls, pct){
  return `<div class="kcard ${cls||""}"><div class="kl">${esc(label)}</div><div class="kv num">${value}</div><div class="ks">${sub||""}</div>
    ${pct!=null?`<div class="bar"><i style="width:${Math.max(0,Math.min(100,pct))}%;background:${cls==="crit"?"var(--crit)":cls==="warn"?"var(--warn)":"var(--good)"}"></i></div>`:""}</div>`;
}

function renderKPIs(rows){
  const verif = rows.filter(r=>VERIF.has(r.estado));
  const conf = rows.filter(r=>r.estado==="confirmado").length;
  const alerta = rows.filter(r=>r.estado==="alerta_sede").length;
  const crit = rows.filter(r=>r.estado==="critico_sin_marcacion").length;
  const noverif = rows.filter(r=>r.estado==="no_verificable").length;
  const pend = rows.filter(r=>r.estado==="sin_dni"||r.estado==="fuera_rango").length;
  const pctConf = verif.length ? conf/verif.length*100 : 0;

  const box = document.getElementById("kpibar");
  box.innerHTML = [
    kpiCard("Actividades reportadas", fmtInt(rows.length), "en el periodo filtrado"),
    kpiCard("Verificables", fmtInt(verif.length), "con datos suficientes para cruzar"),
    kpiCard("% Sede confirmada", fmtPct(pctConf), `${fmtInt(conf)} de ${fmtInt(verif.length)}`, pctConf>=80?"good":pctConf>=60?"warn":"crit", pctConf),
    kpiCard("Alertas de sede", fmtInt(alerta), "marcó, pero en otro local", alerta>0?"warn":"", null),
    kpiCard("Críticos", fmtInt(crit), "sin marcación ese día", crit>0?"crit":"", null),
    kpiCard("Pendientes de dato", fmtInt(pend+noverif), "sin DNI, fuera de rango o sin biométrico"),
  ].join("");
  document.getElementById("navCasosCnt").textContent = fmtInt(alerta+crit);
}

function renderEstadoBar(rows){
  const order = ["confirmado","ausencia_ok","alerta_sede","ausencia_sin_verificar","ausencia_pero_marco","critico_sin_marcacion","no_verificable","sin_dni","fuera_rango"];
  const counts = order.map(k=>({k, n: rows.filter(r=>r.estado===k).length})).filter(x=>x.n>0);
  const max = Math.max(1, ...counts.map(c=>c.n));
  const box = document.getElementById("estadoBar");
  box.innerHTML = `<div class="blist">${counts.map(c=>{
    const e = ESTADOS[c.k];
    return `<div class="brow"><div class="bn">${esc(e.label)}</div>
      <div class="btrack"><span class="bseg" style="width:${c.n/max*100}%;background:${e.color}"></span></div>
      <div class="bv num">${fmtInt(c.n)}</div></div>`;
  }).join("")}</div>`;
}

function renderMesChart(rows){
  const byMes = {};
  rows.filter(r=>VERIF.has(r.estado)).forEach(r=>{
    byMes[r.mesLabel] = byMes[r.mesLabel] || {conf:0,tot:0};
    byMes[r.mesLabel].tot++;
    if(r.estado==="confirmado") byMes[r.mesLabel].conf++;
  });
  const mesesConDatos = MESES_ORDEN.filter(m=>byMes[m]);
  const box = document.getElementById("mesChart");
  document.getElementById("mesTag").textContent = D.rangoMarcaciones.min ? `marcaciones desde ${D.rangoMarcaciones.min} hasta ${D.rangoMarcaciones.max}` : "";
  if(!mesesConDatos.length){ box.innerHTML = `<div class="empty"><h4>Sin datos verificables</h4><p>No hay actividades con marcación cruzada para este filtro.</p></div>`; return; }
  box.innerHTML = `<div class="blist">${mesesConDatos.map(m=>{
    const {conf,tot} = byMes[m]; const pct = tot? conf/tot*100:0;
    return `<div class="brow"><div class="bn">${esc(m[0].toUpperCase()+m.slice(1))}<small>${fmtInt(tot)} verificables</small></div>
      <div class="btrack"><span class="bseg" style="width:${pct}%;background:${pct>=80?"var(--good)":pct>=60?"var(--warn)":"var(--crit)"}"></span></div>
      <div class="bv num">${fmtPct(pct)}</div></div>`;
  }).join("")}</div>`;
}

function groupCounts(rows, keyFn, estadoFilter){
  const m = new Map();
  rows.forEach(r=>{
    if(estadoFilter && r.estado!==estadoFilter) return;
    const k = keyFn(r);
    m.set(k, (m.get(k)||0)+1);
  });
  return [...m.entries()].sort((a,b)=>b[1]-a[1]);
}

function renderTopColabCrit(rows){
  const top = groupCounts(rows, r=>r.colaborador, "critico_sin_marcacion").slice(0,8);
  const box = document.getElementById("topColabCrit");
  if(!top.length){ box.innerHTML = `<div class="empty"><h4>Sin casos críticos</h4><p>Ningún colaborador tiene actividades reportadas sin marcación ese día, con los filtros actuales.</p></div>`; return; }
  const max = top[0][1];
  box.innerHTML = top.map(([name,n])=>`<div class="brow" data-colab="${esc(name)}"><div class="bn">${esc(name)}</div>
    <div class="btrack"><span class="bseg" style="width:${n/max*100}%;background:var(--crit)"></span></div>
    <div class="bv num">${fmtInt(n)}</div></div>`).join("");
  box.querySelectorAll("[data-colab]").forEach(el=>el.addEventListener("click",()=>{
    state.colab = el.dataset.colab; state.estado="critico_sin_marcacion"; syncSelects(); renderAll();
  }));
}

function renderTopSedeAlert(rows){
  const top = groupCounts(rows, sedeLabel, "alerta_sede").slice(0,8);
  const box = document.getElementById("topSedeAlert");
  if(!top.length){ box.innerHTML = `<div class="empty"><h4>Sin alertas de sede</h4><p>No hay actividades donde la sede reportada no coincida con la marcación, con los filtros actuales.</p></div>`; return; }
  const max = top[0][1];
  box.innerHTML = top.map(([name,n])=>`<div class="brow" data-sede="${esc(name)}"><div class="bn">${esc(name)}</div>
    <div class="btrack"><span class="bseg" style="width:${n/max*100}%;background:var(--warn)"></span></div>
    <div class="bv num">${fmtInt(n)}</div></div>`).join("");
  box.querySelectorAll("[data-sede]").forEach(el=>el.addEventListener("click",()=>{
    state.sede = el.dataset.sede; state.estado="alerta_sede"; syncSelects(); renderAll();
  }));
}

function renderCasos(rows){
  const casos = rows.filter(r=>r.estado==="critico_sin_marcacion"||r.estado==="alerta_sede"||r.estado==="ausencia_pero_marco")
    .sort((a,b)=> b.fecha.localeCompare(a.fecha)).slice(0,40);
  document.getElementById("casosTag").textContent = `${fmtInt(casos.length)} mostrados`;
  const t = document.getElementById("tablaCasos");
  if(!casos.length){ t.innerHTML = `<tr><td><div class="empty"><h4>Sin casos</h4><p>No hay críticos ni alertas con los filtros actuales.</p></div></td></tr>`; return; }
  t.innerHTML = `<thead><tr><th>Fecha</th><th>Colaborador</th><th>Área</th><th>Sede reportada</th><th>Estado</th><th>Detalle</th></tr></thead>
    <tbody>${casos.map(r=>`<tr><td class="num">${r.fecha}</td><td>${esc(r.colaborador)}</td><td>${esc(r.area)}</td><td>${esc(sedeLabel(r))}</td><td>${pillHtml(r.estado)}</td><td>${esc(r.detalle||"")}</td></tr>`).join("")}</tbody>`;
}

function renderColabTable(rows){
  const byColab = new Map();
  rows.forEach(r=>{
    if(!byColab.has(r.colaborador)) byColab.set(r.colaborador, {area:r.area, conf:0, alerta:0, crit:0, verif:0, otros:0});
    const o = byColab.get(r.colaborador);
    if(VERIF.has(r.estado)){
      o.verif++;
      if(r.estado==="confirmado") o.conf++;
      else if(r.estado==="alerta_sede") o.alerta++;
      else if(r.estado==="critico_sin_marcacion") o.crit++;
    } else o.otros++;
  });
  const list = [...byColab.entries()].map(([name,o])=>({name,...o,pct: o.verif? o.conf/o.verif*100:null}))
    .sort((a,b)=> (a.pct==null?101:a.pct) - (b.pct==null?101:b.pct));
  const t = document.getElementById("tablaColab");
  if(!list.length){ t.innerHTML = `<tr><td><div class="empty"><h4>Sin datos</h4><p>Ningún colaborador coincide con los filtros actuales.</p></div></td></tr>`; return; }
  t.innerHTML = `<thead><tr><th>Colaborador</th><th>Área</th><th class="r">Verificables</th><th class="r">Confirmado</th><th class="r">Alertas</th><th class="r">Críticos</th><th style="width:160px">% Sede confirmada</th></tr></thead>
    <tbody>${list.map(o=>`<tr><td>${esc(o.name)}</td><td>${esc(o.area)}</td><td class="r num">${fmtInt(o.verif)}</td><td class="r num">${fmtInt(o.conf)}</td><td class="r num">${fmtInt(o.alerta)}</td><td class="r num">${fmtInt(o.crit)}</td>
      <td>${o.pct==null?`<span class="pill muted">sin datos</span>`:`<div class="btrack"><span class="bseg" style="width:${o.pct}%;background:${o.pct>=80?"var(--good)":o.pct>=60?"var(--warn)":"var(--crit)"}"></span></div><div style="text-align:right;font-weight:700;margin-top:2px">${fmtPct(o.pct)}</div>`}</td></tr>`).join("")}</tbody>`;
}

function renderSedeTable(rows){
  const byS = new Map();
  rows.forEach(r=>{
    const sk = sedeLabel(r);
    if(!byS.has(sk)) byS.set(sk, {conf:0, alerta:0, crit:0, verif:0});
    const o = byS.get(sk);
    if(VERIF.has(r.estado)){
      o.verif++;
      if(r.estado==="confirmado") o.conf++;
      else if(r.estado==="alerta_sede") o.alerta++;
      else if(r.estado==="critico_sin_marcacion") o.crit++;
    }
  });
  const list = [...byS.entries()].map(([name,o])=>({name,...o,pct: o.verif? o.conf/o.verif*100:null})).filter(o=>o.verif>0)
    .sort((a,b)=>(a.pct??101)-(b.pct??101));
  const t = document.getElementById("tablaSedes");
  if(!list.length){ t.innerHTML = `<tr><td><div class="empty"><h4>Sin datos</h4><p>Ninguna sede verificable coincide con los filtros actuales.</p></div></td></tr>`; return; }
  t.innerHTML = `<thead><tr><th>Sede</th><th class="r">Verificables</th><th class="r">Confirmado</th><th class="r">Alertas</th><th class="r">Críticos</th><th style="width:160px">% Sede confirmada</th></tr></thead>
    <tbody>${list.map(o=>`<tr><td>${esc(o.name)}</td><td class="r num">${fmtInt(o.verif)}</td><td class="r num">${fmtInt(o.conf)}</td><td class="r num">${fmtInt(o.alerta)}</td><td class="r num">${fmtInt(o.crit)}</td>
      <td><div class="btrack"><span class="bseg" style="width:${o.pct}%;background:${o.pct>=80?"var(--good)":o.pct>=60?"var(--warn)":"var(--crit)"}"></span></div><div style="text-align:right;font-weight:700;margin-top:2px">${fmtPct(o.pct)}</div></td></tr>`).join("")}</tbody>`;
}

function renderDetalle(rows){
  const list = [...rows].sort((a,b)=> b.fecha.localeCompare(a.fecha)).slice(0,500);
  document.getElementById("detalleTag").textContent = `${fmtInt(rows.length)} filas · mostrando ${fmtInt(list.length)}`;
  const t = document.getElementById("tablaDetalle");
  if(!list.length){ t.innerHTML = `<tr><td><div class="empty"><h4>Sin resultados</h4><p>Ajusta los filtros o el buscador.</p></div></td></tr>`; return; }
  t.innerHTML = `<thead><tr><th>Fecha</th><th>Colaborador</th><th>Área</th><th>Sede</th><th>Detalle</th><th class="r">Horas</th><th>Estado</th></tr></thead>
    <tbody>${list.map(r=>`<tr><td class="num">${r.fecha}</td><td>${esc(r.colaborador)}</td><td>${esc(r.area)}</td><td>${esc(sedeLabel(r))}</td><td>${esc(r.detalle||"")}</td><td class="r num">${r.horas??""}</td><td>${pillHtml(r.estado)}</td></tr>`).join("")}</tbody>`;
}

function renderAll(){
  const rows = applyFilters();
  renderChips();
  renderKPIs(rows);
  renderEstadoBar(rows);
  renderMesChart(rows);
  renderTopColabCrit(rows);
  renderTopSedeAlert(rows);
  renderCasos(rows);
  renderColabTable(rows);
  renderSedeTable(rows);
  renderDetalle(rows);
}

document.getElementById("period").innerHTML = `<b>${fmtInt(REG.length)}</b> actividades reportadas<br>Marcaciones: ${D.rangoMarcaciones.min||"—"} a ${D.rangoMarcaciones.max||"—"}`;
document.getElementById("foot").innerHTML = `Generado ${esc(D.generatedAt)} · Fuente: Control de Actividades (Mtto/TI) cruzado con Marcaciones biométricas · Datos sin marcación de mayo-junio 2026 quedan fuera de rango.`;

renderAll();
})();
