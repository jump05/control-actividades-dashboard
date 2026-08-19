(function(){
"use strict";
const D = DASH_DATA;
const REG = D.registros;

const fmtInt = n => n.toLocaleString("es-PE");
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pctColor = p => p>=50 ? "var(--crit)" : p>=25 ? "var(--warn)" : "var(--good)";
const MESES_ORDEN = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const state = { mes:"", dni:"" };

// ---------------------------------------------------------------- filtro de mes
const meses = [...new Set(REG.map(r=>r.mesLabel))].sort((a,b)=>MESES_ORDEN.indexOf(a)-MESES_ORDEN.indexOf(b));
const fMes = document.getElementById("fMes");
fMes.innerHTML = `<option value="">Todos los meses</option>` + meses.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join("");
fMes.addEventListener("change", e=>{ state.mes = e.target.value; renderAll(); });

function filtered(){
  return state.mes ? REG.filter(r=>r.mesLabel===state.mes) : REG;
}

// ---------------------------------------------------------------- tema
const themeBtn = document.getElementById("theme");
function setTheme(t){
  document.documentElement.setAttribute("data-theme", t);
  themeBtn.textContent = t==="dark" ? "☀️" : "🌙";
  localStorage.setItem("ca-theme", t);
}
setTheme(localStorage.getItem("ca-theme") || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark":"light"));
themeBtn.addEventListener("click", ()=> setTheme(document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark"));

// ---------------------------------------------------------------- tabla resumen
function buildResumen(rows){
  const by = new Map();
  rows.forEach(r=>{
    if(!by.has(r.dni)) by.set(r.dni, {area:r.area, personal:r.personal, dias:0, incidencia:0});
    const o = by.get(r.dni);
    o.dias++;
    if(r.status==="incorrecto") o.incidencia++;
  });
  const list = [...by.entries()].map(([dni,o])=>({dni, ...o, porcentaje: o.dias? Math.round(o.incidencia/o.dias*100):0}));
  list.sort((a,b)=> b.porcentaje-a.porcentaje || a.personal.localeCompare(b.personal,"es"));
  return list;
}

function renderTabla(rows){
  const list = buildResumen(rows);
  document.getElementById("tablaTag").textContent = `${fmtInt(list.length)} colaboradores`;
  const t = document.getElementById("tablaResumen");
  if(!list.length){ t.innerHTML = `<tr><td>Sin datos para este filtro.</td></tr>`; return; }
  t.innerHTML = `<thead><tr><th>Área</th><th>DNI</th><th>Personal</th><th class="r">Cantidad de días</th><th class="r">Días con incidencia</th><th class="r" style="width:170px">Porcentaje</th></tr></thead>
    <tbody>${list.map(r=>`<tr class="clickable${r.dni===state.dni?" rowsel":""}" data-dni="${esc(r.dni)}">
      <td class="area">${esc(r.area)}</td>
      <td class="num">${esc(r.dni)}</td>
      <td class="personal">${esc(r.personal)}</td>
      <td class="r num">${fmtInt(r.dias)}</td>
      <td class="r num">${fmtInt(r.incidencia)}</td>
      <td><div class="pctcell"><div class="pcttrack"><span class="pctfill" style="width:${r.porcentaje}%;background:${pctColor(r.porcentaje)}"></span></div><span class="pctnum num" style="color:${pctColor(r.porcentaje)}">${r.porcentaje}%</span></div></td>
    </tr>`).join("")}</tbody>`;
  t.querySelectorAll("tr[data-dni]").forEach(tr=>tr.addEventListener("click", ()=> openDetalle(tr.dataset.dni)));
}

// ---------------------------------------------------------------- detalle por persona
function openDetalle(dni){
  state.dni = dni;
  const panel = document.getElementById("panelDetalle");
  const rows = filtered().filter(r=>r.dni===dni).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  if(!rows.length){ panel.classList.remove("on"); return; }
  const first = rows[0];
  document.getElementById("dName").textContent = first.personal;
  document.getElementById("dArea").textContent = first.area;
  document.getElementById("dSub").textContent = `${fmtInt(rows.length)} días · ${state.mes||"todo el periodo"} · ordenado por fecha`;
  const t = document.getElementById("tablaDetalle");
  t.innerHTML = `<thead><tr><th>Fecha</th><th>Hora inicio marcación</th><th>Sede formato</th><th>Sede real marcación</th><th>Estado</th></tr></thead>
    <tbody>${rows.map(r=>`<tr>
      <td class="num">${r.fecha}</td>
      <td class="num">${esc(r.hora||"Sin marcación")}</td>
      <td>${esc(r.sedeFormatoAbrev)} <span style="color:var(--ink-3)">· ${esc(r.sedeFormato)}</span></td>
      <td>${r.sedeReal? `${esc(r.sedeRealAbrev)} <span style="color:var(--ink-3)">· ${esc(r.sedeReal)}</span>` : `<span style="color:var(--ink-3)">— sin marcación</span>`}</td>
      <td>${r.status==="correcto" ? `<span class="pill ok">Correcto</span>` : `<span class="pill bad">Incorrecto</span>`}</td>
    </tr>`).join("")}</tbody>`;
  panel.classList.add("on");
  panel.scrollIntoView({behavior:"smooth", block:"start"});
}
document.getElementById("dClose").addEventListener("click", ()=>{
  state.dni = "";
  document.getElementById("panelDetalle").classList.remove("on");
  renderTabla(filtered());
});

// ---------------------------------------------------------------- pivote / heatmap de sedes
function renderPivot(rows){
  const marcados = rows.filter(r=>r.sedeRealAbrev);
  const personas = new Map(); // dni -> {personal, area}
  const colTotals = new Map(); // sedeAbrev -> total
  const cells = new Map(); // dni|sede -> count

  marcados.forEach(r=>{
    if(!personas.has(r.dni)) personas.set(r.dni, {personal:r.personal, area:r.area});
    colTotals.set(r.sedeRealAbrev, (colTotals.get(r.sedeRealAbrev)||0)+1);
    const k = r.dni+"|"+r.sedeRealAbrev;
    cells.set(k, (cells.get(k)||0)+1);
  });

  const cols = [...colTotals.entries()].sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
  const personList = [...personas.entries()].map(([dni,o])=>({dni,...o}))
    .sort((a,b)=>a.personal.localeCompare(b.personal,"es"));

  document.getElementById("pivotTag").textContent = cols.length ? `según los días con actividad reportada, primera marcación de cada día` : "";
  const t = document.getElementById("tablaPivot");
  if(!personList.length || !cols.length){ t.innerHTML = `<tr><td>Sin marcaciones para este filtro.</td></tr>`; return; }

  let maxCell = 1;
  cells.forEach(v=>{ if(v>maxCell) maxCell = v; });

  const thead = `<thead><tr><th>Personal</th>${cols.map(c=>`<th class="hcol">${esc(c)}</th>`).join("")}</tr></thead>`;
  const tbody = personList.map(p=>{
    const rowCells = cols.map(c=>{
      const n = cells.get(p.dni+"|"+c) || 0;
      if(!n) return `<td class="hcell" style="background:transparent;color:var(--ink-3)">–</td>`;
      const pct = Math.round(n/maxCell*100);
      const bg = `color-mix(in srgb, var(--s1) ${Math.max(pct,10)}%, var(--panel))`;
      const fg = pct>=55 ? "#ffffff" : "var(--ink)";
      return `<td class="hcell" style="background:${bg};color:${fg}">${n}</td>`;
    }).join("");
    return `<tr class="clickable${p.dni===state.dni?" rowsel":""}" data-dni="${esc(p.dni)}"><td class="hname personal">${esc(p.personal)}<br><small style="color:var(--ink-3);font-weight:600">${esc(p.area)}</small></td>${rowCells}</tr>`;
  }).join("");
  t.innerHTML = thead + `<tbody>${tbody}</tbody>`;
  t.querySelectorAll("tr[data-dni]").forEach(tr=>tr.addEventListener("click", ()=> openDetalle(tr.dataset.dni)));
}

function renderAll(){
  const rows = filtered();
  renderTabla(rows);
  renderPivot(rows);
  if(state.dni) openDetalle(state.dni);
}

document.getElementById("period").innerHTML = `Marcaciones: ${D.rangoMarcaciones.min||"—"} a ${D.rangoMarcaciones.max||"—"}`;
document.getElementById("foot").innerHTML = `Generado ${esc(D.generatedAt)} · Cruce entre Control de Actividades (Mtto/TI) y Marcaciones biométricas, usando solo la primera marcación de cada día · Días de ausencia (Vacaciones/Feriado/Licencia/Falta), fuera del rango de Marcaciones, o en sedes sin dispositivo biométrico no se cuentan.`;

renderAll();
})();
