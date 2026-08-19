(function(){
"use strict";
const D = DASH_DATA;
const SLOTS = ["var(--s1)","var(--s2)","var(--s3)","var(--s4)","var(--s5)","var(--s6)","var(--s7)","var(--s8)"];

const fmtInt = n => n.toLocaleString("es-PE");
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pctColor = p => p>=50 ? "var(--crit)" : p>=25 ? "var(--warn)" : "var(--good)";

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
function renderTabla(){
  const rows = D.resumen;
  document.getElementById("tablaTag").textContent = `${fmtInt(rows.length)} colaboradores`;
  const t = document.getElementById("tablaResumen");
  t.innerHTML = `<thead><tr><th>Área</th><th>DNI</th><th>Personal</th><th class="r">Cantidad de días</th><th class="r">Días con incidencia</th><th class="r" style="width:170px">Porcentaje</th></tr></thead>
    <tbody>${rows.map(r=>`<tr>
      <td class="area">${esc(r.area)}</td>
      <td class="num">${esc(r.dni)}</td>
      <td class="personal">${esc(r.personal)}</td>
      <td class="r num">${fmtInt(r.dias)}</td>
      <td class="r num">${fmtInt(r.incidencia)}</td>
      <td><div class="pctcell"><div class="pcttrack"><span class="pctfill" style="width:${r.porcentaje}%;background:${pctColor(r.porcentaje)}"></span></div><span class="pctnum num" style="color:${pctColor(r.porcentaje)}">${r.porcentaje}%</span></div></td>
    </tr>`).join("")}</tbody>`;
}

// ---------------------------------------------------------------- grafica: sede donde mas marca
function renderChart(){
  const rows = D.sedeChart;
  const colorOf = (()=>{
    const map = new Map();
    return sede => {
      if(!map.has(sede)) map.set(sede, SLOTS[map.size % SLOTS.length]);
      return map.get(sede);
    };
  })();

  const box = document.getElementById("chartSedes");
  box.innerHTML = rows.map(r=>{
    const top = r.sedes[0];
    if(!top) return `<div class="brow"><div class="bn">${esc(r.personal)}<small>${esc(r.area)}</small></div><div class="btrack"></div><div class="bv">sin marcaciones</div></div>`;
    const color = colorOf(top.sede);
    return `<div class="brow"><div class="bn">${esc(r.personal)}<small>${esc(r.area)}</small></div>
      <div class="btrack"><span class="bseg" style="width:${top.pct}%;background:${color}"></span></div>
      <div class="bv">${esc(top.sede)} <small>· ${top.pct}% (${fmtInt(top.dias)}/${fmtInt(r.total)} días)</small></div></div>`;
  }).join("");

  // leyenda: sedes que aparecen como "top" de al menos una persona
  const seen = [];
  rows.forEach(r=>{ const s = r.sedes[0] && r.sedes[0].sede; if(s && !seen.includes(s)) seen.push(s); });
  document.getElementById("legendSedes").innerHTML = seen.map(s=>`<span><i class="sw" style="background:${colorOf(s)}"></i>${esc(s)}</span>`).join("");
}

document.getElementById("period").innerHTML = `Marcaciones: ${D.rangoMarcaciones.min||"—"} a ${D.rangoMarcaciones.max||"—"}`;
document.getElementById("foot").innerHTML = `Generado ${esc(D.generatedAt)} · Cruce entre Control de Actividades (Mtto/TI) y Marcaciones biométricas, usando solo la primera marcación de cada día · Días de ausencia (Vacaciones/Feriado/Licencia/Falta), fuera del rango de Marcaciones, o en sedes sin dispositivo biométrico no se cuentan.`;

renderTabla();
renderChart();
})();
