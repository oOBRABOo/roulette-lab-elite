// Roulette Monitor Pro (PWA)
// - Multi-table, OCR hybrid 100 numbers, Bayes, chi²(p approx), runs test, hot/cold(age), charts, Monte Carlo.
// NOTE: Diagnóstico/simulação. Não é "sinal".

const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const BLACK = new Set([2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35]);

function colorOf(n){
  if (n === 0) return "GREEN";
  if (RED.has(n)) return "RED";
  return "BLACK";
}
function dozenOf(n){
  if (n === 0) return "0";
  if (n <= 12) return "D1";
  if (n <= 24) return "D2";
  return "D3";
}
function columnOf(n){
  if (n === 0) return "0";
  const r = n % 3;
  return r === 1 ? "C1" : (r === 2 ? "C2" : "C3");
}
function fmtTime(ts){
  const d = new Date(ts);
  return d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"});
}

// ===== Storage (multi tables) =====
const KEY = "roulette_monitor_pro_full_v1";
function loadState(){
  const raw = localStorage.getItem(KEY);
  if (!raw){
    return { activeId:"t1", tables:{ "t1": { name:"Auto Roulette VIP", spins:[] } } };
  }
  try { return JSON.parse(raw); } catch { return null; }
}
function saveState(s){ localStorage.setItem(KEY, JSON.stringify(s)); }

let state = loadState();
if (!state){ state = { activeId:"t1", tables:{ "t1": { name:"Auto Roulette VIP", spins:[] } } }; saveState(state); }

function activeTable(){ return state.tables[state.activeId]; }

// ===== UI refs =====
const tabsEl = document.getElementById("tabs");
const numgridEl = document.getElementById("numgrid");
const windowRange = document.getElementById("windowRange");
const windowLabel = document.getElementById("windowLabel");
const lastRange = document.getElementById("lastRange");
const lastLabel = document.getElementById("lastLabel");

const kTotal = document.getElementById("kTotal");
const kLast = document.getElementById("kLast");
const kColors = document.getElementById("kColors");
const kZero = document.getElementById("kZero");

const statusDot = document.getElementById("statusDot");
const statusTitle = document.getElementById("statusTitle");
const statusText = document.getElementById("statusText");
const chi2El = document.getElementById("chi2");
const pvalEl = document.getElementById("pval");
const runsEl = document.getElementById("runsz");

const hotList = document.getElementById("hotList");
const coldAgeList = document.getElementById("coldAgeList");
const bayesList = document.getElementById("bayesList");
const lastTable = document.getElementById("lastTable");

const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const fileInput = document.getElementById("fileInput");

const addTableBtn = document.getElementById("addTableBtn");
const renameTableBtn = document.getElementById("renameTableBtn");
const undoBtn = document.getElementById("undoBtn");
const clearBtn = document.getElementById("clearBtn");

// OCR modal refs
const importImageBtn = document.getElementById("importImageBtn");
const imageInput = document.getElementById("imageInput");
const ocrModalWrap = document.getElementById("ocrModalWrap");
const ocrClose = document.getElementById("ocrClose");
const ocrCanvas = document.getElementById("ocrCanvas");
const ocrRun = document.getElementById("ocrRun");
const ocrMaybeInvert = document.getElementById("ocrMaybeInvert");
const ocrCountEl = document.getElementById("ocrCount");
const ocrGridEl = document.getElementById("ocrGrid");
const ocrConfirm = document.getElementById("ocrConfirm");
const ocrCancel = document.getElementById("ocrCancel");

let ocrImageFile = null;
let ocrNumbersTemp = []; // length 100 expected

// Monte Carlo refs
const mcSims = document.getElementById("mcSims");
const mcH = document.getElementById("mcH");
const mcStake = document.getElementById("mcStake");
const mcSimsLabel = document.getElementById("mcSimsLabel");
const mcHLabel = document.getElementById("mcHLabel");
const mcStakeLabel = document.getElementById("mcStakeLabel");
const runMC1 = document.getElementById("runMC1");
const runMC2 = document.getElementById("runMC2");
const mcMean = document.getElementById("mcMean");
const mcMed = document.getElementById("mcMed");
const mcBand = document.getElementById("mcBand");
const mcDD = document.getElementById("mcDD");

// ===== Charts =====
let freqChart = null;
let colorChart = null;
let mcChart = null;

function ensureCharts(){
  if (!freqChart){
    const ctx = document.getElementById("freqChart").getContext("2d");
    freqChart = new Chart(ctx, {
      type:"bar",
      data:{ labels:[...Array(37)].map((_,i)=>String(i)), datasets:[{label:"freq", data:new Array(37).fill(0)}]},
      options:{
        responsive:true,
        plugins:{ legend:{display:false}},
        scales:{
          x:{ ticks:{ color:"rgba(231,238,252,.7)", maxRotation:0, autoSkip:true }, grid:{color:"rgba(255,255,255,.06)"}},
          y:{ ticks:{ color:"rgba(231,238,252,.7)" }, grid:{color:"rgba(255,255,255,.06)"}}
        }
      }
    });
  }
  if (!colorChart){
    const ctx = document.getElementById("colorChart").getContext("2d");
    colorChart = new Chart(ctx, {
      type:"doughnut",
      data:{ labels:["RED","BLACK","GREEN"], datasets:[{data:[0,0,0]}]},
      options:{ responsive:true, plugins:{ legend:{labels:{color:"rgba(231,238,252,.75)"}} } }
    });
  }
  if (!mcChart){
    const ctx = document.getElementById("mcChart").getContext("2d");
    mcChart = new Chart(ctx, {
      type:"line",
      data:{ labels:[], datasets:[] },
      options:{
        responsive:true,
        plugins:{ legend:{display:false}},
        scales:{
          x:{ ticks:{ color:"rgba(231,238,252,.7)" }, grid:{color:"rgba(255,255,255,.06)"}},
          y:{ ticks:{ color:"rgba(231,238,252,.7)" }, grid:{color:"rgba(255,255,255,.06)"}}
        },
        elements:{ point:{ radius:0 } }
      }
    });
  }
}

// ===== Helpers =====
function longestStreak(arr){
  let bestVal=null, bestLen=0, curVal=null, curLen=0;
  for (const x of arr){
    if (x === curVal) curLen++;
    else { curVal=x; curLen=1; }
    if (curLen > bestLen){ bestLen=curLen; bestVal=curVal; }
  }
  return {bestVal, bestLen};
}
function runsZ(binary){
  const n1 = binary.filter(x=>x===1).length;
  const n0 = binary.length - n1;
  if (n0 === 0 || n1 === 0 || binary.length < 12) return NaN;
  let runs = 1;
  for (let i=1;i<binary.length;i++){
    if (binary[i] !== binary[i-1]) runs++;
  }
  const mu = 1 + (2*n0*n1)/(n0+n1);
  const varr = (2*n0*n1*(2*n0*n1 - n0 - n1))/(((n0+n1)**2)*(n0+n1-1));
  return (runs - mu)/Math.sqrt(varr);
}

// chi² and p-value approximate using Monte Carlo (fast enough on mobile)
function chiSquarePApprox(obsCounts){
  const k = obsCounts.length;
  const n = obsCounts.reduce((a,b)=>a+b,0);
  if (n < 20) return {chi2: NaN, p: NaN};

  const expected = n / k;
  let chi2 = 0;
  for (let i=0;i<k;i++){
    const d = obsCounts[i] - expected;
    chi2 += (d*d) / expected;
  }

  const sims = 1200; // keep it responsive
  let ge = 0;
  for (let s=0;s<sims;s++){
    const counts = new Array(k).fill(0);
    for (let t=0;t<n;t++){
      const j = (Math.random()*k) | 0;
      counts[j]++;
    }
    let cs = 0;
    for (let i=0;i<k;i++){
      const d = counts[i] - expected;
      cs += (d*d)/expected;
    }
    if (cs >= chi2) ge++;
  }
  const p = ge / sims;
  return {chi2, p};
}

// Bayes Dirichlet posterior predictive (alpha0=1)
function bayesDelta(counts, alpha0=1){
  const k = counts.length;
  const n = counts.reduce((a,b)=>a+b,0);
  const alphaSum = k*alpha0 + n;
  const uniform = 1/k;
  const deltas = [];
  for (let i=0;i<k;i++){
    const post = (alpha0 + counts[i]) / alphaSum;
    deltas.push(post - uniform);
  }
  return deltas;
}

function chip(text, bold){
  const s = document.createElement("span");
  s.className = "chip";
  s.innerHTML = `${text} <b>${bold}</b>`;
  return s;
}

// Age since last occurrence (in spins)
function agesSinceLast(spins){
  // returns age for each number 0..36 (0 means appeared on last spin)
  const ages = new Array(37).fill(Infinity);
  for (let i=spins.length-1;i>=0;i--){
    const n = spins[i].n;
    if (ages[n] === Infinity){
      ages[n] = (spins.length-1) - i;
    }
  }
  // any never seen in window -> Infinity, keep as large
  return ages;
}

// ===== Render UI =====
function renderTabs(){
  tabsEl.innerHTML = "";
  for (const id of Object.keys(state.tables)){
    const t = state.tables[id];
    const b = document.createElement("button");
    b.className = "tab" + (id===state.activeId ? " active":"");
    b.textContent = t.name;
    b.onclick = () => {
      state.activeId = id;
      saveState(state);
      renderAll();
    };
    tabsEl.appendChild(b);
  }
}

function buildNumGrid(){
  numgridEl.innerHTML = "";
  for (let n=0;n<=36;n++){
    const div = document.createElement("div");
    div.className = "num " + (n===0 ? "green" : (RED.has(n) ? "red" : "black"));
    div.textContent = String(n);
    div.onclick = () => {
      activeTable().spins.push({n, ts: Date.now()});
      saveState(state);
      renderStats();
      renderLast();
    };
    numgridEl.appendChild(div);
  }
}

function renderLast(){
  const t = activeTable();
  const show = Math.min(parseInt(lastRange.value,10), t.spins.length);
  lastLabel.textContent = String(show);

  const tail = t.spins.slice(-show).reverse();
  lastTable.innerHTML = "";
  tail.forEach((s, idx)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td><b>${s.n}</b></td>
      <td>${colorOf(s.n)}</td>
      <td>${dozenOf(s.n)}</td>
      <td>${columnOf(s.n)}</td>
      <td>${fmtTime(s.ts)}</td>
    `;
    lastTable.appendChild(tr);
  });
}

function setStatus(level, title, text){
  statusTitle.textContent = title;
  statusText.textContent = text;
  if (level === "good"){ statusDot.style.background = "var(--good)"; }
  else if (level === "warn"){ statusDot.style.background = "var(--warn)"; }
  else { statusDot.style.background = "var(--bad)"; }
}

function renderHotCold(freq, spinsWindow){
  // Hot by count
  const pairs = [];
  for (let i=0;i<freq.length;i++) pairs.push({n:i, c:freq[i]});
  pairs.sort((a,b)=> b.c - a.c);
  const hot = pairs.slice(0,8);

  hotList.innerHTML = "";
  for (const x of hot) hotList.appendChild(chip(`#${x.n}`, `${x.c}`));

  // Cold by age (time since last in window)
  const ages = agesSinceLast(spinsWindow);
  const agePairs = ages.map((a,i)=>({n:i, a}));
  // largest age first (Infinity last -> treat as huge)
  agePairs.sort((x,y)=>{
    const ax = (x.a===Infinity)? 1e9 : x.a;
    const ay = (y.a===Infinity)? 1e9 : y.a;
    return ay - ax;
  });
  coldAgeList.innerHTML = "";
  for (const x of agePairs.slice(0,8)){
    const label = (x.a===Infinity) ? "∞" : `${x.a}`;
    coldAgeList.appendChild(chip(`#${x.n}`, label));
  }
}

function renderBayes(freq){
  const deltas = bayesDelta(freq, 1.0);
  const arr = deltas.map((d,i)=>({n:i, d}));
  arr.sort((a,b)=> b.d - a.d);
  bayesList.innerHTML = "";
  for (const x of arr.slice(0,10)){
    const sign = x.d >= 0 ? "+" : "";
    bayesList.appendChild(chip(`#${x.n}`, `${sign}${(x.d*100).toFixed(2)}%`));
  }
}

function renderCharts(freq, colorsCount){
  ensureCharts();
  // Frequency bar
  freqChart.data.datasets[0].data = freq;
  freqChart.update();

  // Colors doughnut
  colorChart.data.datasets[0].data = [colorsCount.RED, colorsCount.BLACK, colorsCount.GREEN];
  colorChart.update();
}

function renderStats(){
  windowLabel.textContent = windowRange.value;
  lastLabel.textContent = lastRange.value;

  const t = activeTable();
  const W = parseInt(windowRange.value,10);
  const spinsWindow = t.spins.slice(-W); // [{n,ts}]
  const N = spinsWindow.length;

  kTotal.textContent = N ? String(N) : "—";
  const last = N ? spinsWindow[N-1].n : null;
  kLast.textContent = (last===null) ? "—" : String(last);

  const colors = spinsWindow.map(s=>colorOf(s.n));
  const colorsCount = {
    RED: colors.filter(c=>c==="RED").length,
    BLACK: colors.filter(c=>c==="BLACK").length,
    GREEN: colors.filter(c=>c==="GREEN").length,
  };
  kColors.textContent = N ? `${colorsCount.RED}/${colorsCount.BLACK}` : "—";
  kZero.textContent = N ? String(colorsCount.GREEN) : "—";

  // Frequency 0..36
  const freq = new Array(37).fill(0);
  for (const s of spinsWindow) freq[s.n]++;

  // Runs test on red/black ignoring green
  const rb = spinsWindow
    .map(s=>colorOf(s.n))
    .filter(c=>c==="RED" || c==="BLACK")
    .map(c=> c==="RED" ? 1 : 0);
  const z = runsZ(rb);
  runsEl.textContent = Number.isFinite(z) ? z.toFixed(2) : "—";

  // Chi-square p approx
  const {chi2, p} = chiSquarePApprox(freq);
  chi2El.textContent = Number.isFinite(chi2) ? chi2.toFixed(2) : "—";
  pvalEl.textContent = Number.isFinite(p) ? p.toFixed(3) : "—";

  // Regime score
  let score = 0;
  if (Number.isFinite(p) && p < 0.01) score += 2;
  else if (Number.isFinite(p) && p < 0.05) score += 1;
  if (Number.isFinite(z) && Math.abs(z) > 2.58) score += 2;
  else if (Number.isFinite(z) && Math.abs(z) > 1.96) score += 1;

  // Include streak diagnostic (soft)
  const sColor = longestStreak(colors);
  if (sColor.bestLen >= 8) score += 1;

  if (score >= 4){
    setStatus("bad", "🔴 Anomalia estatística forte",
      "Desvio incomum na janela (diagnóstico). Em RNG justo pode ser variância, mas merece observação.");
  } else if (score >= 2){
    setStatus("warn", "🟡 Desvio moderado",
      "Sinais leves de desvio/agrupamento (diagnóstico). Normal em sequências aleatórias, acompanhe.");
  } else {
    setStatus("good", "🟢 Dentro do esperado",
      "Nada estatisticamente fora do padrão nesta janela (diagnóstico).");
  }

  renderHotCold(freq, spinsWindow);
  renderBayes(freq);
  renderCharts(freq, colorsCount);
}

function renderAll(){
  renderTabs();
  buildNumGrid();
  renderStats();
  renderLast();
}

// ===== Buttons/actions =====
addTableBtn.onclick = () => {
  const name = prompt("Nome da nova mesa:");
  if (!name) return;
  const id = "t" + Math.random().toString(16).slice(2,10);
  state.tables[id] = { name, spins: [] };
  state.activeId = id;
  saveState(state);
  renderAll();
};

renameTableBtn.onclick = () => {
  const t = activeTable();
  const name = prompt("Renomear mesa:", t.name);
  if (!name) return;
  t.name = name;
  saveState(state);
  renderTabs();
};

undoBtn.onclick = () => {
  const t = activeTable();
  t.spins.pop();
  saveState(state);
  renderStats();
  renderLast();
};

clearBtn.onclick = () => {
  if (!confirm("Limpar histórico desta mesa?")) return;
  activeTable().spins = [];
  saveState(state);
  renderStats();
  renderLast();
};

exportBtn.onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "roulette_monitor_backup.json";
  a.click();
  URL.revokeObjectURL(a.href);
};
importBtn.onclick = () => fileInput.click();
fileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    const obj = JSON.parse(text);
    if (!obj.tables || !obj.activeId) throw new Error("Formato inválido");
    state = obj;
    saveState(state);
    renderAll();
  } catch {
    alert("JSON inválido.");
  } finally {
    e.target.value = "";
  }
});

windowRange.oninput = () => { windowLabel.textContent = windowRange.value; renderStats(); };
lastRange.oninput = () => { lastLabel.textContent = lastRange.value; renderLast(); };

// ===== OCR Hybrid (100 initial) =====
function openOCRModal(){
  ocrModalWrap.style.display = "block";
}
function closeOCRModal(){
  ocrModalWrap.style.display = "none";
  ocrImageFile = null;
  ocrNumbersTemp = [];
  ocrCountEl.textContent = "0";
  ocrGridEl.innerHTML = "";
  const ctx = ocrCanvas.getContext("2d");
  ctx.clearRect(0,0,ocrCanvas.width, ocrCanvas.height);
}

importImageBtn.onclick = () => imageInput.click();
imageInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  ocrImageFile = file;
  await drawImageToCanvas(file);
  openOCRModal();
  // do not auto-run OCR; user clicks "Rodar OCR"
  e.target.value = "";
});

ocrClose.onclick = closeOCRModal;
ocrCancel.onclick = closeOCRModal;

async function drawImageToCanvas(file){
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await new Promise((res)=>{ img.onload = res; });
  const ctx = ocrCanvas.getContext("2d");
  // Fit image into canvas
  const w = ocrCanvas.clientWidth || 860;
  const h = 320;
  ocrCanvas.width = w;
  ocrCanvas.height = h;

  ctx.clearRect(0,0,w,h);
  // cover fit
  const scale = Math.max(w/img.width, h/img.height);
  const sw = w/scale, sh = h/scale;
  const sx = (img.width - sw)/2;
  const sy = (img.height - sh)/2;
  ctx.drawImage(img, sx, sy, sw, sh, 0,0,w,h);
  URL.revokeObjectURL(img.src);
}

function cleanOCRText(text){
  return text
    .replace(/O/g,"0")
    .replace(/o/g,"0")
    .replace(/I/g,"1")
    .replace(/l/g,"1")
    .replace(/S/g,"5");
}

function extractNumbers0to36(text){
  const matches = text.match(/\b([0-9]|[1-2][0-9]|3[0-6])\b/g);
  if (!matches) return [];
  return matches.map(x=>parseInt(x,10)).filter(n=>n>=0 && n<=36);
}

function renderOCRGrid(){
  ocrGridEl.innerHTML = "";
  ocrCountEl.textContent = String(ocrNumbersTemp.length);

  // always render 100 cells (fill blanks with 0)
  const cells = new Array(100).fill(null).map((_,i)=> ocrNumbersTemp[i] ?? 0);
  if (ocrNumbersTemp.length < 100){
    // keep as 100 but mark count for confirm gating
  }

  for (let i=0;i<100;i++){
    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.max = "36";
    inp.value = String(cells[i]);
    inp.oninput = () => {
      const v = parseInt(inp.value,10);
      if (Number.isFinite(v) && v>=0 && v<=36){
        ocrNumbersTemp[i] = v;
      }
      // Recount valid length as exactly 100 (we keep array length 100)
      ocrCountEl.textContent = "100";
    };
    ocrGridEl.appendChild(inp);
  }
}

ocrRun.onclick = async () => {
  if (!ocrImageFile){
    alert("Envie uma imagem primeiro.");
    return;
  }
  alert("Rodando OCR... pode levar alguns segundos.");
  const { data: { text } } = await Tesseract.recognize(ocrImageFile, "eng");

  const cleaned = cleanOCRText(text);
  let nums = extractNumbers0to36(cleaned);

  if (nums.length < 100){
    alert(`Detectei ${nums.length}. Preciso de 100. Tente: zoom maior, print mais nítido ou recorte melhor.`);
    ocrNumbersTemp = nums.slice(0,100);
    renderOCRGrid();
    return;
  }
  if (nums.length > 100){
    nums = nums.slice(0,100);
  }

  ocrNumbersTemp = nums; // length 100
  renderOCRGrid();

  // Simple inversion heuristic: ask user once (optional)
  const ok = confirm("Quer conferir se a ordem está correta?\nSe os números estiverem invertidos, clique em 'Inverter ordem (100)'.");
  if (!ok) { /* do nothing */ }
};

ocrMaybeInvert.onclick = () => {
  if (ocrNumbersTemp.length !== 100){
    alert("Preciso de 100 números para inverter.");
    return;
  }
  ocrNumbersTemp.reverse();
  renderOCRGrid();
};

ocrConfirm.onclick = () => {
  if (ocrNumbersTemp.length !== 100){
    alert("Ainda não tenho 100 números válidos.");
    return;
  }
  // Validate all 0..36
  for (const n of ocrNumbersTemp){
    if (!Number.isFinite(n) || n<0 || n>36){
      alert("Há valores inválidos (fora 0–36). Corrija antes de confirmar.");
      return;
    }
  }
  // Import as spins with timestamps (oldest -> newest)
  const base = Date.now();
  const t = activeTable();
  t.spins = ocrNumbersTemp.map((n, i)=>({ n, ts: base - (100-i)*1000 }));
  saveState(state);
  closeOCRModal();
  renderAll();
  alert("Importação inicial concluída!");
};

// ===== Monte Carlo =====
function updateMCLabels(){
  mcSimsLabel.textContent = mcSims.value;
  mcHLabel.textContent = mcH.value;
  mcStakeLabel.textContent = (parseInt(mcStake.value,10)).toFixed(1);
}
mcSims.oninput = updateMCLabels;
mcH.oninput = updateMCLabels;
mcStake.oninput = updateMCLabels;
updateMCLabels();

function simulateFlatEvenMoney(horizon, stake){
  // win prob for even-money on European roulette excluding zero: 18/37
  const pWin = 18/37;
  let equity = 0;
  const path = new Array(horizon);
  for (let i=0;i<horizon;i++){
    const win = Math.random() < pWin;
    equity += win ? stake : -stake;
    path[i] = equity;
  }
  return path;
}

function simulateFlatDozen(horizon, stake){
  // dozen win prob: 12/37, payout 2:1
  const pWin = 12/37;
  let equity = 0;
  const path = new Array(horizon);
  for (let i=0;i<horizon;i++){
    const win = Math.random() < pWin;
    equity += win ? (2*stake) : -stake;
    path[i] = equity;
  }
  return path;
}

function maxDrawdown(path){
  let peak = -Infinity;
  let maxDD = 0;
  for (const x of path){
    if (x > peak) peak = x;
    const dd = x - peak; // negative
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD;
}

function summarize(paths){
  const finals = paths.map(p=>p[p.length-1]).sort((a,b)=>a-b);
  const mean = finals.reduce((a,b)=>a+b,0) / finals.length;
  const med = finals[(finals.length/2)|0];
  const p5 = finals[Math.floor(finals.length*0.05)];
  const p95 = finals[Math.floor(finals.length*0.95)];
  const dds = paths.map(maxDrawdown);
  const ddMean = dds.reduce((a,b)=>a+b,0)/dds.length;

  return { mean, med, p5, p95, ddMean };
}

function plotMC(paths){
  ensureCharts();
  const horizon = paths[0].length;
  mcChart.data.labels = [...Array(horizon)].map((_,i)=>String(i+1));
  // plot up to 40 lines
  const show = Math.min(40, paths.length);
  mcChart.data.datasets = [];
  for (let i=0;i<show;i++){
    mcChart.data.datasets.push({
      data: paths[i],
      borderWidth: 1,
      tension: 0,
      borderColor: "rgba(231,238,252,.20)",
      fill: false,
    });
  }
  mcChart.update();
}

async function runMonteCarlo(kind){
  const sims = parseInt(mcSims.value,10);
  const horizon = parseInt(mcH.value,10);
  const stake = parseInt(mcStake.value,10);

  // Basic safety for mobile
  const chunk = 200;
  const paths = [];
  for (let s=0;s<sims;s++){
    paths.push(kind==="even" ? simulateFlatEvenMoney(horizon, stake) : simulateFlatDozen(horizon, stake));
    if ((s+1) % chunk === 0){
      await new Promise(r=>setTimeout(r, 0));
    }
  }

  const sum = summarize(paths);
  mcMean.textContent = sum.mean.toFixed(2) + "u";
  mcMed.textContent  = sum.med.toFixed(2) + "u";
  mcBand.textContent = `${sum.p5.toFixed(2)}…${sum.p95.toFixed(2)}u`;
  mcDD.textContent   = sum.ddMean.toFixed(2) + "u";
  plotMC(paths);
}

runMC1.onclick = () => runMonteCarlo("even");
runMC2.onclick = () => runMonteCarlo("dozen");

// ===== PWA install prompt =====
let deferredPrompt = null;
const installBtn = document.getElementById("installBtn");
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.style.display = "inline-flex";
});
installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.style.display = "none";
});

// Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  });
}

// ===== Init =====
function renderAllSafe(){
  ensureCharts();
  renderAll();
}
renderAllSafe();
