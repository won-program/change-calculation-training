"use strict";

// 問題数の選択肢をまとめて管理します。問題タイプは problemTypes に追加できます。
const CONFIG = Object.freeze({ questionCounts: [10, 25, 50, 100], defaultQuestionCount: 50, storageKey: "changeCalculationTraining.records.v1", legacyStorageKeys: ["createInterviewMath.records.v1"] });
const problemTypes = {
  change: {
    id: "change", mode: "calculation", title: "お釣り計算", difficulty: "初級",
    generate() {
      let price;
      do { price = randomInt(1, 999); } while (price === state.previousPrice);
      state.previousPrice = price;
      return { prompt: "おつりはいくら？", display: `¥${price.toLocaleString("ja-JP")}`, answer: 1000 - price, questionType: "change" };
    }
  }
};
const state = { screen: "home", current: 0, correct: 0, previousPrice: null, startedAt: 0, timerId: null, lastResult: null, selectedQuestionCount: CONFIG.defaultQuestionCount, recordsFilter: "all" };
const ids = ["home-screen","quiz-screen","result-screen","records-screen","start-button","records-button","question-count","timer","progress-bar","price","question-title","answer-form","answer-input","answer-feedback","result-summary","result-time","result-correct","result-accuracy","result-average","comparison","again-button","result-records-button","home-button","records-home-button","records-empty","records-content","best-time","best-correct","best-accuracy","mean-time","mean-accuracy","chart-description","time-chart","records-body","record-count","delete-records-button"];
const el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function showScreen(name) {
  state.screen = name;
  for (const screen of ["home", "quiz", "result", "records"]) el[`${screen}-screen`].hidden = screen !== name;
  if (name === "quiz") focusAnswer();
}
function focusAnswer() { requestAnimationFrame(() => { if (state.screen === "quiz") el["answer-input"].focus({ preventScroll: true }); }); }
function formatTime(ms) {
  const hundredths = Math.floor(ms / 10), minutes = Math.floor(hundredths / 6000), seconds = Math.floor((hundredths % 6000) / 100), fraction = hundredths % 100;
  return `${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}.${String(fraction).padStart(2,"0")}`;
}
function formatSeconds(ms) { return (ms / 1000).toFixed(2); }
function normalizeRecord(record) {
  if (!record || typeof record !== "object" || !Number.isFinite(Number(record.totalTime)) || !Number.isFinite(Number(record.correctCount))) return null;
  const questionCount = Number(record.questionCount) > 0 ? Number(record.questionCount) : 50;
  const correctCount = Number(record.correctCount), totalTime = Number(record.totalTime);
  return { ...record, questionCount, correctCount, totalTime, accuracy: Number.isFinite(Number(record.accuracy)) ? Number(record.accuracy) : correctCount / questionCount * 100, averageTime: Number.isFinite(Number(record.averageTime)) ? Number(record.averageTime) : totalTime / questionCount, questionType: record.questionType || "change", date: record.date || new Date(0).toISOString() };
}
function getRecords() {
  const readArray = key => {
    try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; }
    catch { return []; }
  };
  let records = readArray(CONFIG.storageKey);
  const knownIds = new Set(records.map(record => record && record.id).filter(Boolean));
  let migrated = false;
  for (const legacyKey of CONFIG.legacyStorageKeys) {
    const legacy = readArray(legacyKey);
    if (legacy.length === 0) continue;
    legacy.forEach(record => {
      if (!record || !record.id || !knownIds.has(record.id)) records.push(record);
      if (record && record.id) knownIds.add(record.id);
    });
    migrated = true;
  }
  const normalized = records.map(normalizeRecord).filter(Boolean);
  if (migrated) {
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(normalized));
      CONFIG.legacyStorageKeys.forEach(key => localStorage.removeItem(key));
    } catch { /* Keep the legacy copy if storage is unavailable or full. */ }
  }
  return normalized;
}
function saveRecord(record) {
  const records = getRecords(); records.push(record);
  try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(records)); }
  catch { el["record-count"].textContent = "保存できませんでした。ブラウザの保存容量やプライバシー設定をご確認ください。"; }
}
function updateStartLabel() { el["start-button"].textContent = `${state.selectedQuestionCount}問チャレンジ開始`; }
function selectQuestionCount(count) {
  if (!CONFIG.questionCounts.includes(count)) return;
  state.selectedQuestionCount = count; updateStartLabel();
  document.querySelectorAll("[data-question-count]").forEach(button => {
    const selected = Number(button.dataset.questionCount) === count;
    button.classList.toggle("is-selected", selected); button.setAttribute("aria-pressed", String(selected));
  });
}
function beginChallenge() {
  if (state.timerId) clearInterval(state.timerId);
  state.current = 0; state.correct = 0; state.previousPrice = null; state.lastResult = null;
  state.startedAt = performance.now();
  showScreen("quiz"); nextQuestion(); state.timerId = setInterval(updateTimer, 31);
}
function updateTimer() { el.timer.textContent = formatTime(performance.now() - state.startedAt); }
function generateProblem(typeId = "change") { const type = problemTypes[typeId]; if (!type) throw new Error(`Unknown problem type: ${typeId}`); return type.generate(); }
function nextQuestion() {
  const total = state.selectedQuestionCount;
  if (state.current >= total) { finishChallenge(); return; }
  const problem = generateProblem("change"); state.activeProblem = problem;
  el["question-count"].textContent = `問題 ${state.current + 1} / ${total}`;
  el["question-count"].setAttribute("aria-label", `問題 ${state.current + 1} / ${total}`);
  el.price.textContent = problem.display; el["question-title"].textContent = problem.prompt;
  el["answer-input"].value = ""; el["answer-feedback"].textContent = "";
  el["progress-bar"].style.width = `${(state.current / total) * 100}%`;
  const track = el["quiz-screen"].querySelector(".progress-track"); track.setAttribute("aria-valuenow", String(state.current)); track.setAttribute("aria-valuemax", String(total));
  focusAnswer();
}
function submitAnswer(event) {
  event.preventDefault();
  if (state.screen !== "quiz") return;
  const raw = el["answer-input"].value.trim();
  if (!raw) { el["answer-feedback"].textContent = "お釣りを入力してください"; el["answer-input"].focus(); return; }
  if (!/^\d+$/.test(raw)) { el["answer-feedback"].textContent = "半角数字で入力してください"; el["answer-input"].focus(); return; }
  if (Number(raw) === state.activeProblem.answer) state.correct += 1;
  state.current += 1; nextQuestion();
}
function finishChallenge() {
  if (state.timerId) clearInterval(state.timerId); state.timerId = null;
  const totalTime = Math.max(0, performance.now() - state.startedAt), questionCount = state.selectedQuestionCount;
  el.timer.textContent = formatTime(totalTime); el["progress-bar"].style.width = "100%";
  const track = el["quiz-screen"].querySelector(".progress-track"); track.setAttribute("aria-valuenow", String(questionCount)); track.setAttribute("aria-valuemax", String(questionCount));
  const previous = getRecords().filter(r => r.questionType === problemTypes.change.id && r.questionCount === questionCount).slice(-1)[0] || null;
  const record = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, date: new Date().toISOString(), mode: problemTypes.change.mode, questionType: problemTypes.change.id, difficulty: problemTypes.change.difficulty, questionCount, totalTime, correctCount: state.correct, accuracy: state.correct / questionCount * 100, averageTime: totalTime / questionCount };
  saveRecord(record); state.lastResult = record;
  el["result-summary"].textContent = `${questionCount}問お疲れさまでした。今回の結果を記録しました。`;
  el["result-time"].textContent = formatTime(totalTime); el["result-correct"].textContent = `${state.correct} / ${questionCount}`;
  el["result-accuracy"].textContent = `${Math.round(record.accuracy)}%`; el["result-average"].textContent = `${formatSeconds(record.averageTime)}秒 / 問`;
  renderComparison(previous, record); showScreen("result");
}
function renderComparison(previous, current) {
  if (!previous) { el.comparison.hidden = true; el.comparison.replaceChildren(); return; }
  const diff = previous.totalTime - current.totalTime;
  const title = document.createElement("h3"); title.textContent = "前回との比較";
  const before = document.createElement("p"); before.textContent = `前回タイム　${formatTime(previous.totalTime)}`;
  const now = document.createElement("p"); now.textContent = `今回タイム　${formatTime(current.totalTime)}`;
  const change = document.createElement("p"), strong = document.createElement("strong");
  if (Math.abs(diff) < 5) strong.textContent = "前回とほぼ同じタイムです";
  else if (diff > 0) strong.textContent = `前回より ${formatSeconds(diff)}秒短縮！`;
  else strong.textContent = `前回より ${formatSeconds(-diff)}秒遅くなりました`;
  change.append(strong); el.comparison.replaceChildren(title,before,now,change); el.comparison.hidden = false;
}
function showRecords() { renderRecords(); showScreen("records"); }
function filteredRecords(records) { return state.recordsFilter === "all" ? records : records.filter(record => record.questionCount === Number(state.recordsFilter)); }
function updateFilterButtons() {
  document.querySelectorAll("[data-record-filter]").forEach(button => {
    const selected = button.dataset.recordFilter === state.recordsFilter;
    button.classList.toggle("is-selected", selected); button.setAttribute("aria-pressed", String(selected));
  });
}
function renderRecords() {
  updateFilterButtons();
  const allRecords = getRecords(), records = filteredRecords(allRecords), empty = records.length === 0;
  el["records-empty"].hidden = !empty; el["records-content"].hidden = empty;
  el["records-content"].classList.toggle("all-records-view", state.recordsFilter === "all");
  el["delete-records-button"].disabled = allRecords.length === 0;
  el["record-count"].textContent = allRecords.length ? `表示 ${records.length}件 ／ 全 ${allRecords.length}件` : "";
  if (empty) { el["records-body"].replaceChildren(); drawChart([]); return; }
  const sorted = [...records].sort((a,b) => new Date(a.date) - new Date(b.date)), times = sorted.map(r => r.totalTime), bestTime = Math.min(...times);
  const groups = new Map();
  sorted.forEach(record => { if (!groups.has(record.questionCount)) groups.set(record.questionCount, []); groups.get(record.questionCount).push(record); });
  const byCount = [...groups.entries()].sort((a,b) => a[0]-b[0]);
  if (state.recordsFilter === "all") {
    el["best-time"].textContent = byCount.map(([count,items]) => `${count}問 ${formatTime(Math.min(...items.map(r=>r.totalTime)))}`).join("\n");
    el["best-correct"].textContent = byCount.map(([count,items]) => `${count}問 ${Math.max(...items.map(r=>r.correctCount))}/${count}`).join("\n");
    el["mean-time"].textContent = byCount.map(([count,items]) => `${count}問 ${formatTime(items.reduce((sum,r)=>sum+r.totalTime,0)/items.length)}`).join("\n");
  } else {
    const count = Number(state.recordsFilter);
    el["best-time"].textContent = formatTime(bestTime);
    el["best-correct"].textContent = `${Math.max(...sorted.map(r => r.correctCount))} / ${count}`;
    el["mean-time"].textContent = formatTime(times.reduce((a,b)=>a+b,0)/times.length);
  }
  el["best-accuracy"].textContent = `${Math.max(...sorted.map(r => r.accuracy)).toFixed(0)}%`;
  el["mean-accuracy"].textContent = `${(sorted.reduce((a,r)=>a+r.accuracy,0)/sorted.length).toFixed(1)}%`;
  const body = document.createDocumentFragment();
  [...sorted].reverse().forEach(record => {
    const row = document.createElement("tr"), date = new Date(record.date);
    const cells = [Number.isNaN(date.getTime()) ? "日時不明" : new Intl.DateTimeFormat("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(date), `${record.questionCount}問`, formatTime(record.totalTime), `${record.correctCount}/${record.questionCount}`, `${record.accuracy.toFixed(0)}%`, `${formatSeconds(record.averageTime)}秒`];
    cells.forEach(value => { const td=document.createElement("td"); td.textContent=value; row.append(td); }); body.append(row);
  });
  el["records-body"].replaceChildren(body); drawChart(sorted);
}
function drawChart(records) {
  const svg=el["time-chart"], ns="http://www.w3.org/2000/svg", width=800,height=240,pad={left:66,right:22,top:18,bottom:42};
  svg.setAttribute("viewBox",`0 0 ${width} ${height}`); svg.replaceChildren();
  const add=(tag,attrs,text)=>{const node=document.createElementNS(ns,tag); Object.entries(attrs||{}).forEach(([k,v])=>node.setAttribute(k,String(v))); if(text!==undefined)node.textContent=text; svg.append(node); return node;};
  if (!records.length) { add("text",{x:width/2,y:height/2,"text-anchor":"middle",class:"chart-empty"},"この問題数の記録はありません"); return; }
  const perQuestion = state.recordsFilter === "all";
  el["chart-description"].textContent = perQuestion ? "横軸：問題数別の挑戦回数 ／ 縦軸：1問あたりの平均時間" : "横軸：挑戦回数 ／ 縦軸：タイム";
  const chartSeconds = record => record.totalTime / (perQuestion ? record.questionCount : 1) / 1000;
  const values=records.map(chartSeconds), min=Math.min(...values),max=Math.max(...values),range=Math.max(max-min,1), low=Math.max(0,min-range*.18),high=max+range*.18;
  const x=i=>pad.left+(records.length===1?0:i/(records.length-1))*(width-pad.left-pad.right), y=v=>pad.top+(high-v)/(high-low)*(height-pad.top-pad.bottom);
  for(let i=0;i<4;i++){const val=low+(high-low)*i/3, yy=y(val);add("line",{x1:pad.left,y1:yy,x2:width-pad.right,y2:yy,class:"chart-grid"});add("text",{x:pad.left-10,y:yy+4,"text-anchor":"end",class:"chart-axis"},`${val.toFixed(1)}秒`);}
  const points=records.map((r,i)=>`${x(i)},${y(chartSeconds(r))}`).join(" "); if(records.length>1)add("polyline",{points,class:"chart-line"});
  records.forEach((r,i)=>{const circle=add("circle",{cx:x(i),cy:y(chartSeconds(r)),r:4,class:"chart-dot"}), title=document.createElementNS(ns,"title");title.textContent=`${i+1}回目 ${perQuestion ? `${chartSeconds(r).toFixed(2)}秒/問` : formatTime(r.totalTime)}`;circle.append(title);});
  const labels=new Set([0,records.length-1,Math.floor((records.length-1)/2)]);labels.forEach(i=>add("text",{x:x(i),y:height-12,"text-anchor":"middle",class:"chart-axis"},`${i+1}回目`));
  add("text",{x:pad.left,y:height-12,"text-anchor":"start",class:"chart-axis"},"挑戦回数");
}

selectQuestionCount(CONFIG.defaultQuestionCount);
document.querySelectorAll("[data-question-count]").forEach(button => button.addEventListener("click", () => selectQuestionCount(Number(button.dataset.questionCount))));
document.querySelectorAll("[data-record-filter]").forEach(button => button.addEventListener("click", () => { state.recordsFilter = button.dataset.recordFilter; renderRecords(); }));
el["start-button"].addEventListener("click",beginChallenge);
el["records-button"].addEventListener("click",showRecords);
el["result-records-button"].addEventListener("click",showRecords);
el["again-button"].addEventListener("click",beginChallenge);
el["home-button"].addEventListener("click",()=>showScreen("home"));
el["records-home-button"].addEventListener("click",()=>showScreen("home"));
el["answer-form"].addEventListener("submit",submitAnswer);
el["answer-input"].addEventListener("keydown",event=>{if(event.key==="Enter"&&event.repeat)event.preventDefault();});
el["delete-records-button"].addEventListener("click",()=>{if(confirm("本当にすべての成績データを削除しますか？")){localStorage.removeItem(CONFIG.storageKey);CONFIG.legacyStorageKeys.forEach(key=>localStorage.removeItem(key));renderRecords();}});
