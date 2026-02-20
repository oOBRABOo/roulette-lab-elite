import { analyze, windowSpins, RED_SET } from './analytics.js';

const LS_KEY = "roulette_monitor_pro_state_v1";

const $ = (id)=>document.getElementById(id);

const els = {
  tabs: $("tableTabs"),
  newTableBtn: $("newTableBtn"),
  renameTableBtn: $("renameTableBtn"),
  exportBtn: $("exportBtn"),
  importBtn: $("importBtn"),
  importFile: $("importFile"),
  paste100Btn: $("paste100Btn"),
  pasteModal: $("pasteModal"),
  closePasteBtn: $("closePasteBtn"),
  confirmPasteBtn: $("confirmPasteBtn"),
  clearPasteBtn: $("clearPasteBtn"),
  pasteArea: $("pasteArea"),
  pasteHint: $("pasteHint"),
  windowRange: $("windowRange"),
  windowLabel: $("windowLabel"),
  lastRange: $("lastRange"),
  lastLabel: $("lastLabel"),
  undoBtn: $("undoBtn"),
  clearBtn: $("clearBtn"),
  quickGrid: $("quickGrid"),
  lastRow: $("lastRow"),
  scoreVal: $("scoreVal"),
  scoreLabel: $("scoreLabel"),
  chiVal: $("chiVal"),
  runsVal: $("runsVal"),
  cusumVal: $("cusumVal"),
  statusText: $("statusText"),
  flagsText: $("flagsText"),
  heatmap: $("heatmap"),
  gVal: $("gVal"),
  entVal: $("entVal"),
  runsHLVal: $("runsHLVal"),
  acVal: $("acVal"),
  hotChips: $("hotChips"),
  suggestChips: $("suggestChips")
};

function nowTs(){ return Date.now(); }

function defaultState(){
  return {
    activeTableId: "t1",
    tables: {
      "t1": {
        id:"t1",
        name:"Auto Roulette VIP",
        window:120,
        lastN:12,
        spins:[] // {n, ts}
      }
    }
  };
}

let state = loadState() || defaultState();

function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){ return null; }
}

function activeTable(){
  return state.tables[state.activeTableId];
}

function setActive(id){
  state.activeTableId = id;
  saveState();
  renderAll();
}

function mkId(){
  return "t" + Math.random().toString(16).slice(2,10);
}

// ===== UI: Tabs =====
function renderTabs(){
  els.tabs.innerHTML = "";
  const ids = Object.keys(state.tables);
  ids.forEach(id=>{
    const t=state.tables[id];
    const el=document.createElement("div");
    el.className = "tab" + (id===state.activeTableId ? " active" : "");
    el.textContent = t.name;
    el.onclick = ()=>setActive(id);
    els.tabs.appendChild(el);
  });
}

// ===== Quick Grid 0-36 =====
function ballClass(n){
  if(n===0) return "green";
  return RED_SET.has(n) ? "red" : "black";
}

function renderQuickGrid(){
  els.quickGrid.innerHTML = "";
  for(let n=0;n<=36;n++){
    const d=document.createElement("div");
    d.className="cell";
    d.innerHTML = `${n}<small>${ballClass(n)}</small><div class="bar" style="width:0%"></div>`;
    d.onclick = ()=>addSpin(n);
    els.quickGrid.appendChild(d);
  }
}

// ===== Add / Undo / Clear =====
function addSpin(n){
  const t=activeTable();
  t.spins.push({n, ts: nowTs()});
  saveState();
  renderAll();
}

function undo(){
  const t=activeTable();
  t.spins.pop();
  saveState();
  renderAll();
}

function clearTable(){
  const t=activeTable();
  t.spins = [];
  saveState();
  renderAll();
}

// ===== Sliders =====
function attachSliders(){
  const t=activeTable();
  els.windowRange.value = t.window;
  els.windowLabel.textContent = t.window;

  els.lastRange.value = t.lastN;
  els.lastLabel.textContent = t.lastN;
}

els.windowRange.oninput = ()=>{
  const t=activeTable();
  t.window = parseInt(els.windowRange.value);
  els.windowLabel.textContent = t.window;
  saveState();
  renderAll();
};
els.lastRange.oninput = ()=>{
  const t=activeTable();
  t.lastN = parseInt(els.lastRange.value);
  els.lastLabel.textContent = t.lastN;
  saveState();
  renderAll();
};

// ===== Last Row =====
function renderLast(){
  const t=activeTable();
  const nums = windowSpins(t.spins, t.lastN).slice().reverse();
  els.lastRow.innerHTML = "";
  nums.forEach(n=>{
    const b=document.createElement("div");
    b.className = "ball " + ballClass(n);
    b.textContent = n;
    els.lastRow.appendChild(b);
  });
}

// ===== Heatmap =====
function renderHeatmap(freq, N){
  els.heatmap.innerHTML = "";
  const maxF = Math.max(...freq, 1);
  for(let n=0;n<=36;n++){
    const f=freq[n];
    const pct = Math.round(100*(f/maxF));
    const d=document.createElement("div");
    d.className="cell";
    d.innerHTML = `${n}<small>${f}x</small>`;
    const bar=document.createElement("div");
    bar.className="bar";
    bar.style.width = pct + "%";
    d.appendChild(bar);
    els.heatmap.appendChild(d);
  }
}

// ===== Suggestions (observations) =====
function renderSuggestions(metrics){
  els.suggestChips.innerHTML = "";
  const chips = [];

  // Recent vs posterior deltas (heuristic)
  const delta = metrics.ew.map((p,i)=>p - metrics.post[i]);
  const topUp = [...delta.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([n,d])=>({n, d}));
  const topDown = [...delta.entries()].sort((a,b)=>a[1]-b[1]).slice(0,3)
    .map(([n,d])=>({n, d}));

  chips.push({txt:`Recência↑: ${topUp.map(x=>x.n).join(", ")}`});
  chips.push({txt:`Recência↓: ${topDown.map(x=>x.n).join(", ")}`});

  // If flags exist, show cautionary chips
  if(Math.abs(metrics.cusum)>2.0) chips.push({txt:"Regime mudou: aumente observação (CUSUM)"});
  if(Math.abs(metrics.runsColor)>2.0) chips.push({txt:"Sequência de cor incomum (Runs)"});
  if(metrics.ac.map(Math.abs).reduce((s,x)=>s+x,0)/metrics.ac.length>0.14) chips.push({txt:"Dependência temporal acima do normal (ACF)"});

  // Always a neutrality reminder
  chips.push({txt:"Roleta justa = giros independentes. Use como diagnóstico."});

  chips.forEach(c=>{
    const el=document.createElement("span");
    el.className="chip";
    el.textContent=c.txt;
    els.suggestChips.appendChild(el);
  });
}

// ===== Hot Chips =====
function renderHot(topHot){
  els.hotChips.innerHTML = "";
  topHot.forEach(({n,c})=>{
    const el=document.createElement("span");
    el.className="chip";
    el.textContent = `${n} (${c})`;
    els.hotChips.appendChild(el);
  });
}

// ===== KPIs =====
function renderKPIs(){
  const t=activeTable();
  const nums = windowSpins(t.spins, t.window);
  if(nums.length<20){
    els.scoreVal.textContent="-";
    els.scoreLabel.textContent="(dados insuficientes)";
    els.chiVal.textContent="-";
    els.runsVal.textContent="-";
    els.cusumVal.textContent="-";
    els.statusText.textContent="—";
    els.flagsText.textContent="—";
    els.gVal.textContent="-";
    els.entVal.textContent="-";
    els.runsHLVal.textContent="-";
    els.acVal.textContent="-";
    renderHeatmap(Array(37).fill(0), 0);
    els.hotChips.innerHTML="";
    els.suggestChips.innerHTML="";
    return;
  }

  const {metrics, score, label, flags} = analyze(nums, {
    maxLag: 8,
    lambda: 0.08,
    alpha: 1,
    hotWindow: Math.min(60, nums.length),
    neighborK: 2
  });

  els.scoreVal.textContent = score;
  els.scoreLabel.textContent = `(${label})`;

  els.chiVal.textContent = metrics.chi.toFixed(2);
  els.runsVal.textContent = metrics.runsColor.toFixed(2);
  els.cusumVal.textContent = metrics.cusum.toFixed(2);

  els.gVal.textContent = metrics.g.toFixed(2);
  els.entVal.textContent = metrics.entropy.toFixed(3);
  els.runsHLVal.textContent = metrics.runsHighLow.toFixed(2);
  const acMean = metrics.ac.map(Math.abs).reduce((s,x)=>s+x,0)/metrics.ac.length;
  els.acVal.textContent = acMean.toFixed(3);

  const status = score>=70 ? "Desvio forte / regime" : (score>=45 ? "Leve desvio" : "Normal");
  els.statusText.textContent = status;
  els.statusText.className = score>=70 ? "bad" : (score>=45 ? "warn" : "good");

  els.flagsText.textContent = flags.length ? flags.join(" | ") : "—";

  renderHeatmap(metrics.freq, metrics.N);
  renderHot(metrics.topHot);
  renderSuggestions(metrics);

  // also update quick grid bars (freq in window)
  const q = els.quickGrid.children;
  const maxF = Math.max(...metrics.freq, 1);
  for(let i=0;i<q.length;i++){
    const n=i;
    const bar = q[i].querySelector(".bar");
    const pct = Math.round(100*(metrics.freq[n]/maxF));
    bar.style.width = pct + "%";
  }
}

// ===== Export/Import JSON =====
function exportJSON(){
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const a=document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "roulette-monitor-pro.json";
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 200);
}

function importJSONFile(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const obj = JSON.parse(reader.result);
      if(!obj || !obj.tables || !obj.activeTableId) throw new Error("Formato inválido");
      state = obj;
      saveState();
      renderAll();
      alert("Importado com sucesso!");
    }catch(e){
      alert("Falha ao importar: " + e.message);
    }
  };
  reader.readAsText(file);
}

// ===== Paste 100 =====
function openPasteModal(){
  els.pasteArea.value = "";
  els.pasteHint.textContent = "Cole os números e clique Importar.";
  els.pasteModal.style.display = "block";
}
function closePasteModal(){
  els.pasteModal.style.display = "none";
}
function parseNums(raw){
  const matches = raw.match(/\b([0-9]|[1-2][0-9]|3[0-6])\b/g);
  if(!matches) return [];
  return matches.map(x=>parseInt(x,10));
}

els.pasteArea.addEventListener("input", ()=>{
  const nums = parseNums(els.pasteArea.value.trim());
  els.pasteHint.textContent = nums.length ? `Detectei ${nums.length} números.` : "—";
});

function import100FromText(){
  const raw = els.pasteArea.value.trim();
  if(!raw){ alert("Cole os números primeiro."); return; }
  const nums = parseNums(raw);
  if(nums.length !== 100){
    alert(`Foram encontrados ${nums.length} números. Precisa exatamente 100.`);
    return;
  }
  const t=activeTable();
  const baseTime = nowTs();
  t.spins = nums.map((n,i)=>({n, ts: baseTime - (100-i)*1000}));
  saveState();
  closePasteModal();
  renderAll();
  alert("100 números importados com sucesso!");
}

// ===== Buttons Wiring =====
els.newTableBtn.onclick = ()=>{
  const name = prompt("Nome da nova mesa:", "Nova mesa");
  if(!name) return;
  const id = mkId();
  state.tables[id] = {id, name, window:120, lastN:12, spins:[]};
  setActive(id);
};

els.renameTableBtn.onclick = ()=>{
  const t=activeTable();
  const name = prompt("Novo nome da mesa:", t.name);
  if(!name) return;
  t.name = name;
  saveState();
  renderTabs();
};

els.exportBtn.onclick = exportJSON;

els.importBtn.onclick = ()=>els.importFile.click();
els.importFile.onchange = (e)=>{
  const f = e.target.files?.[0];
  if(f) importJSONFile(f);
  els.importFile.value = "";
};

els.paste100Btn.onclick = openPasteModal;
els.closePasteBtn.onclick = closePasteModal;
els.clearPasteBtn.onclick = ()=>{ els.pasteArea.value=""; els.pasteHint.textContent="—"; };
els.confirmPasteBtn.onclick = import100FromText;

els.undoBtn.onclick = undo;
els.clearBtn.onclick = ()=>{
  if(confirm("Limpar todos os giros desta mesa?")) clearTable();
};

// quick add by color buttons
document.querySelectorAll('[data-add]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const kind = btn.getAttribute('data-add');
    if(kind==="green") addSpin(0);
    else if(kind==="red"){
      // default: add last red? we ask quick
      const n = prompt("Digite um número vermelho (1..36):","");
      if(!n) return;
      const v = parseInt(n,10);
      if(!RED_SET.has(v)) return alert("Esse número não é vermelho (na roleta EU).");
      addSpin(v);
    }else if(kind==="black"){
      const n = prompt("Digite um número preto (1..36):","");
      if(!n) return;
      const v = parseInt(n,10);
      if(v===0 || RED_SET.has(v)) return alert("Esse número não é preto (na roleta EU).");
      addSpin(v);
    }
  });
});

// ===== Render All =====
function renderAll(){
  renderTabs();
  attachSliders();
  renderQuickGrid();
  renderLast();
  renderKPIs();
}

renderAll();

// ===== PWA Service Worker =====
if("serviceWorker" in navigator){
  window.addEventListener("load", async ()=>{
    try{
      await navigator.serviceWorker.register("./sw.js");
    }catch(e){}
  });
}
