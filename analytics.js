// analytics.js — Roulette Monitor Pro (EU wheel)
export const WHEEL_EU = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
export const RED_SET = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

export function clamp(x,a,b){ return Math.max(a, Math.min(b,x)); }
export function mean(arr){ return arr.reduce((s,x)=>s+x,0)/Math.max(1,arr.length); }
export function std(arr){
  if(arr.length<2) return 0;
  const m=mean(arr);
  const v=mean(arr.map(x=>(x-m)**2));
  return Math.sqrt(v);
}

export function windowSpins(spins, n){
  const a = spins.slice(Math.max(0, spins.length-n));
  return a.map(x=>typeof x==="number"?x:x.n);
}

export function freq37(nums){
  const f = Array(37).fill(0);
  for(const n of nums) if(n>=0 && n<=36) f[n]++;
  return f;
}

export function chiSquare(freq, N){
  const exp = N/37;
  let chi=0;
  for(const f of freq) chi += (f-exp)*(f-exp)/exp;
  return chi;
}

export function gTest(freq, N){
  const exp = N/37;
  let g=0;
  for(const f of freq){
    if(f>0) g += 2*f*Math.log(f/exp);
  }
  return g;
}

export function entropy(freq, N){
  let h=0;
  for(const f of freq){
    if(f>0){
      const p=f/N;
      h -= p*Math.log2(p);
    }
  }
  return h;
}

export function runsZ(bin){
  if(bin.length<10) return 0;
  let runs=1;
  for(let i=1;i<bin.length;i++) if(bin[i]!==bin[i-1]) runs++;
  const n1 = bin.filter(x=>x===1).length;
  const n0 = bin.length - n1;
  if(n0===0 || n1===0) return 0;
  const mu = 1 + (2*n0*n1)/(n0+n1);
  const varr = (2*n0*n1*(2*n0*n1-n0-n1)) / (((n0+n1)**2)*(n0+n1-1));
  return (runs - mu)/Math.sqrt(Math.max(1e-9,varr));
}

export function colorSeries(nums){
  return nums.filter(n=>n!==0).map(n=>RED_SET.has(n)?1:0);
}
export function highLowSeries(nums){
  return nums.filter(n=>n!==0).map(n=>n>=19?1:0);
}

export function autocorr(nums, maxLag=8){
  const N = nums.length;
  if(N<maxLag+5) return Array(maxLag).fill(0);
  const m = mean(nums);
  const denom = nums.reduce((s,x)=>s+(x-m)*(x-m),0) || 1;
  const ac = [];
  for(let k=1;k<=maxLag;k++){
    let num=0;
    for(let i=k;i<N;i++){
      num += (nums[i]-m)*(nums[i-k]-m);
    }
    ac.push(num/denom);
  }
  return ac;
}

export function ewmaFreq(nums, lambda=0.08){
  const w = Array(37).fill(0);
  let s=0;
  for(let i=0;i<nums.length;i++){
    const t = nums.length-1-i;
    const weight = Math.exp(-lambda*t);
    const n=nums[i];
    if(n>=0 && n<=36){ w[n]+=weight; s+=weight; }
  }
  if(s===0) s=1;
  return w.map(x=>x/s);
}

export function dirichletPosteriorMean(freq, alpha=1){
  const N = freq.reduce((s,x)=>s+x,0);
  const denom = N + 37*alpha;
  return freq.map(f => (f+alpha)/denom);
}

export function wheelIndexMap(wheel=WHEEL_EU){
  const m=new Map();
  wheel.forEach((n,i)=>m.set(n,i));
  return m;
}

export function neighborsOf(n, k=2, wheel=WHEEL_EU, idxMap=null){
  const L=wheel.length;
  const map = idxMap || wheelIndexMap(wheel);
  const i = map.get(n);
  if(i==null) return [];
  const out=[];
  for(let d=-k; d<=k; d++){
    out.push(wheel[(i+d+L)%L]);
  }
  return out;
}

export function sectorHotness(nums, k=2, wheel=WHEEL_EU){
  const idxMap = wheelIndexMap(wheel);
  const score = Array(37).fill(0);
  for(const n of nums){
    const nb = neighborsOf(n,k,wheel,idxMap);
    for(const x of nb) score[x] += 1;
  }
  return score;
}

export function cusumZ(nums){
  if(nums.length<40) return 0;
  const split = Math.floor(nums.length*0.6);
  const a = nums.slice(0,split);
  const b = nums.slice(split);
  const m0 = mean(a);
  const s0 = std(a) || 1;
  const mb = mean(b);
  return (mb - m0)/s0;
}

export function computeScore(metrics){
  const chiN = clamp((metrics.chi - 45) / 25, 0, 1);
  const gN   = clamp((metrics.g  - 45) / 25, 0, 1);
  const entN = clamp((5.0 - metrics.entropy)/0.6, 0, 1);
  const runCN = clamp((Math.abs(metrics.runsColor)-1.8)/1.4, 0, 1);
  const runHN = clamp((Math.abs(metrics.runsHighLow)-1.8)/1.4, 0, 1);
  const acN  = clamp((mean(metrics.ac.map(Math.abs)) - 0.06)/0.10, 0, 1);
  const cuN  = clamp((Math.abs(metrics.cusum)-1.6)/1.8, 0, 1);
  const raw = 0.22*chiN + 0.18*gN + 0.15*entN + 0.15*runCN + 0.10*runHN + 0.10*acN + 0.10*cuN;
  return Math.round(100*raw);
}

export function analyze(nums, opts={}){
  const N = nums.length;
  const f = freq37(nums);
  const chi = chiSquare(f,N);
  const g = gTest(f,N);
  const ent = entropy(f,N);

  const runsColor = runsZ(colorSeries(nums));
  const runsHighLow = runsZ(highLowSeries(nums));
  const ac = autocorr(nums, opts.maxLag ?? 8);
  const ew = ewmaFreq(nums, opts.lambda ?? 0.08);
  const post = dirichletPosteriorMean(f, opts.alpha ?? 1);
  const cusum = cusumZ(nums);

  const hotM = opts.hotWindow ?? Math.min(60, N);
  const hotScore = sectorHotness(nums.slice(-hotM), opts.neighborK ?? 2);
  const topHot = [...hotScore.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([n,c])=>({n,c}));

  const metrics = {N, chi, g, entropy:ent, runsColor, runsHighLow, ac, cusum, ew, post, topHot, freq:f};
  const score = computeScore(metrics);

  let label="Normal";
  if(score>=70) label="Desvio forte / regime";
  else if(score>=45) label="Leve desvio";
  else label="Normal";

  const flags=[];
  if(Math.abs(cusum)>2.5) flags.push("Mudança de regime (CUSUM)");
  if(Math.abs(runsColor)>2.5) flags.push("Sequência cor não usual (Runs)");
  if(mean(ac.map(Math.abs))>0.18) flags.push("Autocorrelação elevada");

  return {metrics, score, label, flags};
}
