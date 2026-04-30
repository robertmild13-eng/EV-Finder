<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Flag Picks — The Juice Report</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #08080c; color: #e0e0e0; font-family: 'JetBrains Mono', monospace; padding: 16px; max-width: 600px; margin: 0 auto; min-height: 100vh; }
.header { text-align: center; margin-bottom: 20px; padding-top: 12px; }
.header h1 { font-size: 24px; font-weight: 800; color: #FF8C00; }
.header p { font-size: 10px; color: #555; margin-top: 4px; letter-spacing: 2px; }
.date-nav { display: flex; justify-content: center; gap: 8px; margin-bottom: 20px; }
.date-nav button { background: #1a1a25; color: #FF8C00; border: 1px solid #2a2a3a; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-family: inherit; font-size: 14px; }
.date-nav button:active { background: #2a2a3a; }
.date-display { background: #1a1a25; border: 1px solid #2a2a3a; border-radius: 8px; padding: 8px 20px; font-size: 14px; color: #FF8C00; font-weight: 700; display: flex; align-items: center; }
.stats { display: flex; justify-content: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.stat { text-align: center; min-width: 50px; }
.stat-num { font-size: 18px; font-weight: 800; color: #333; }
.stat-num.active { color: #27c93f; }
.stat-label { font-size: 8px; color: #555; letter-spacing: 1px; }
.section { margin-bottom: 20px; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding: 8px 12px; background: #111118; border-radius: 8px; border-left: 3px solid #FF8C00; }
.section-title { font-size: 13px; font-weight: 800; color: #FF8C00; }
.section-count { font-size: 10px; color: #555; }
.pick-card { background: #111118; border: 2px solid #1a1a22; border-radius: 10px; padding: 10px 12px; margin-bottom: 6px; cursor: pointer; transition: all 0.15s ease; display: flex; gap: 10px; align-items: center; }
.pick-card.flagged { background: #111820; border-color: #27c93f; }
.pick-card.win { border-color: #27c93f; background: #0a1a0a; }
.pick-card.loss { border-color: #ff4444; background: #1a0a0a; }
.pick-card:active { opacity: 0.7; }
.checkbox { width: 26px; height: 26px; border-radius: 6px; flex-shrink: 0; background: #1a1a25; border: 2px solid #333; display: flex; align-items: center; justify-content: center; font-size: 14px; color: #fff; font-weight: 900; transition: all 0.15s ease; }
.checkbox.checked { background: #27c93f; border-color: #27c93f; }
.pick-sport { font-size: 11px; font-weight: 700; color: #888; }
.pick-card.flagged .pick-sport { color: #FF8C00; }
.pick-name { font-size: 13px; font-weight: 800; color: #aaa; margin-top: 2px; }
.pick-card.flagged .pick-name { color: #fff; }
.pick-game { font-size: 11px; color: #666; margin-top: 2px; }
.pick-details { display: flex; gap: 10px; margin-top: 4px; font-size: 11px; }
.pick-book { color: #FF8C00; }
.pick-ev { color: #27c93f; }
.pick-confidence { font-size: 11px; color: #666; margin-top: 2px; }
.pick-why { font-size: 10px; color: #444; margin-top: 4px; line-height: 1.4; display: none; }
.pick-card.flagged .pick-why { display: block; }
.btn { display: block; width: 100%; padding: 14px; border-radius: 10px; font-family: inherit; font-size: 14px; font-weight: 800; cursor: pointer; border: none; margin-bottom: 10px; letter-spacing: 1px; }
.btn:active { opacity: 0.8; }
.btn-generate { background: #FF8C00; color: #000; }
.btn-generate:disabled { background: #333; color: #666; cursor: not-allowed; }
.btn-copy { background: #27c93f; color: #000; }
.btn-copy-tweet { background: #1DA1F2; color: #fff; }
.results-box { background: #111118; border: 1px solid #2a2a3a; border-radius: 10px; padding: 14px; margin-bottom: 10px; white-space: pre-wrap; font-size: 12px; line-height: 1.5; max-height: 400px; overflow-y: auto; }
.loading { text-align: center; color: #555; padding: 40px; }
.error { text-align: center; color: #ff4444; padding: 20px; font-size: 12px; }
.empty { text-align: center; color: #555; padding: 40px; font-size: 14px; }
.footer { text-align: center; color: #333; font-size: 10px; margin-top: 20px; padding-bottom: 20px; letter-spacing: 2px; }
.saving-bar { position: fixed; top: 0; left: 0; right: 0; background: #27c93f; color: #000; text-align: center; padding: 4px; font-size: 11px; font-weight: 700; letter-spacing: 1px; z-index: 100; display: none; }
.copied-bar { position: fixed; top: 0; left: 0; right: 0; background: #FF8C00; color: #000; text-align: center; padding: 4px; font-size: 11px; font-weight: 700; letter-spacing: 1px; z-index: 100; display: none; }
.divider { border: none; border-top: 1px solid #1a1a25; margin: 20px 0; }
.tab-bar { display: flex; gap: 4px; margin-bottom: 16px; }
.tab { flex: 1; padding: 8px; text-align: center; font-size: 10px; font-weight: 700; color: #555; background: #111118; border: 1px solid #1a1a22; border-radius: 6px; cursor: pointer; letter-spacing: 1px; }
.tab.active { color: #FF8C00; border-color: #FF8C00; background: #1a1520; }
</style>
</head>
<body>

<div class="saving-bar" id="saving-bar">SAVING...</div>
<div class="copied-bar" id="copied-bar">COPIED!</div>

<div class="header">
  <h1>🍊 THE JUICE REPORT</h1>
  <p>FLAG PICKS • GENERATE RESULTS • COPY TO DISCORD</p>
</div>

<div class="date-nav">
  <button onclick="changeDate(-1)">◀</button>
  <div class="date-display" id="date-display"></div>
  <button onclick="changeDate(1)">▶</button>
</div>

<div class="stats" id="stats"></div>

<div class="tab-bar" id="tabs">
  <div class="tab active" onclick="switchTab('flag')">FLAG PICKS</div>
  <div class="tab" onclick="switchTab('results')">RESULTS</div>
</div>

<div id="flag-content"></div>
<div id="results-content" style="display:none"></div>

<div class="footer">🍊 THE JUICE REPORT — SQUEEZE THE EDGE</div>

<script>
var API_FLAG = "/.netlify/functions/flag-picks";
var API_RESULTS = "/.netlify/functions/generate-results";
var currentDate = new Date().toISOString().slice(0, 10);
var data = null;
var currentTab = "flag";

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("active"); });
  if (tab === "flag") {
    document.querySelectorAll(".tab")[0].classList.add("active");
    document.getElementById("flag-content").style.display = "block";
    document.getElementById("results-content").style.display = "none";
  } else {
    document.querySelectorAll(".tab")[1].classList.add("active");
    document.getElementById("flag-content").style.display = "none";
    document.getElementById("results-content").style.display = "block";
  }
}

function changeDate(delta) {
  var d = new Date(currentDate + "T12:00:00");
  d.setDate(d.getDate() + delta);
  currentDate = d.toISOString().slice(0, 10);
  document.getElementById("date-display").textContent = currentDate;
  loadPicks();
}

function fmtOdds(o) { return o > 0 ? "+" + o : "" + o; }

function showBar(id, ms) {
  var bar = document.getElementById(id);
  bar.style.display = "block";
  setTimeout(function() { bar.style.display = "none"; }, ms || 1000);
}

async function loadPicks() {
  document.getElementById("flag-content").innerHTML = '<div class="loading">Loading picks...</div>';
  document.getElementById("results-content").innerHTML = '';
  document.getElementById("stats").innerHTML = "";
  try {
    var res = await fetch(API_FLAG + "?date=" + currentDate);
    var json = await res.json();
    if (json.error) {
      document.getElementById("flag-content").innerHTML = '<div class="error">' + json.error + '</div>';
      data = null;
      return;
    }
    data = json;
    render();
  } catch (e) {
    document.getElementById("flag-content").innerHTML = '<div class="error">' + e.message + '</div>';
  }
}

async function toggle(category, index) {
  if (!data) return;
  var flaggedEV = data.flaggedEV || [];
  var flaggedAI = data.flaggedAI || [];
  var flaggedLock = data.flaggedLock || false;
  var flaggedParlay = data.flaggedParlay || [];

  var currentlyFlagged = false;
  if (category === "ev") currentlyFlagged = flaggedEV.indexOf(index) >= 0;
  else if (category === "ai") currentlyFlagged = flaggedAI.indexOf(index) >= 0;
  else if (category === "lock") currentlyFlagged = flaggedLock;
  else if (category === "parlay") currentlyFlagged = flaggedParlay.indexOf(index) >= 0;

  showBar("saving-bar", 800);

  try {
    var res = await fetch(API_FLAG + "?date=" + currentDate, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: currentlyFlagged ? "unflag" : "flag", category: category, index: index })
    });
    var json = await res.json();
    if (json.success) {
      data.flaggedEV = json.flaggedEV;
      data.flaggedAI = json.flaggedAI;
      data.flaggedLock = json.flaggedLock;
      data.flaggedParlay = json.flaggedParlay;
      render();
    }
  } catch (e) { console.error(e); }
}

async function generateResults() {
  var btn = document.getElementById("gen-btn");
  btn.disabled = true;
  btn.textContent = "GRADING PICKS...";
  document.getElementById("results-content").innerHTML = '<div class="loading">Fetching scores and grading picks... this takes 15-30 seconds.</div>';
  switchTab("results");

  try {
    var res = await fetch(API_RESULTS + "?date=" + currentDate);
    var json = await res.json();
    if (json.error) {
      document.getElementById("results-content").innerHTML = '<div class="error">' + json.error + '</div>';
      btn.disabled = false;
      btn.textContent = "GENERATE RESULTS";
      return;
    }

    var html = '';

    // Discord output
    html += '<div style="margin-bottom:8px;font-size:11px;color:#FF8C00;font-weight:700;">DISCORD MESSAGE</div>';
    html += '<div class="results-box" id="discord-text">' + escapeHtml(json.discord) + '</div>';
    html += '<button class="btn btn-copy" onclick="copyText(\'discord-text\')">COPY FOR DISCORD</button>';

    // Tweet output
    if (json.tweet) {
      html += '<div style="margin-bottom:8px;margin-top:16px;font-size:11px;color:#1DA1F2;font-weight:700;">TWEET</div>';
      html += '<div class="results-box" id="tweet-text">' + escapeHtml(json.tweet) + '</div>';
      html += '<button class="btn btn-copy-tweet" onclick="copyText(\'tweet-text\')">COPY FOR TWITTER</button>';
    }

    // Running record summary
    if (json.running) {
      var r = json.running;
      var totalW = r.ev.w + r.ai.w + r.lock.w + r.parlay.w;
      var totalL = r.ev.l + r.ai.l + r.lock.l + r.parlay.l;
      html += '<div style="margin-top:16px;padding:12px;background:#111118;border:1px solid #2a2a3a;border-radius:10px;">';
      html += '<div style="font-size:11px;color:#FF8C00;font-weight:700;margin-bottom:8px;">RUNNING RECORD</div>';
      html += '<div style="font-size:12px;color:#27c93f;">Overall: ' + totalW + '-' + totalL + '</div>';
      html += '<div style="font-size:10px;color:#666;margin-top:4px;">EV: ' + r.ev.w + '-' + r.ev.l + ' | AI: ' + r.ai.w + '-' + r.ai.l + ' | Lock: ' + r.lock.w + '-' + r.lock.l + ' | Parlay: ' + r.parlay.w + '-' + r.parlay.l + '</div>';
      html += '</div>';
    }

    document.getElementById("results-content").innerHTML = html;
  } catch (e) {
    document.getElementById("results-content").innerHTML = '<div class="error">' + e.message + '</div>';
  }

  btn.disabled = false;
  btn.textContent = "GENERATE RESULTS";
}

function copyText(id) {
  var el = document.getElementById(id);
  var text = el.textContent || el.innerText;
  navigator.clipboard.writeText(text).then(function() {
    showBar("copied-bar", 1500);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function render() {
  if (!data) return;
  var flaggedEV = data.flaggedEV || [];
  var flaggedAI = data.flaggedAI || [];
  var flaggedLock = data.flaggedLock || false;
  var flaggedParlay = data.flaggedParlay || [];
  var bets = data.bets || [];
  var aiPicks = data.aiPicks || [];
  var lock = data.lock || null;
  var parlayLegs = data.parlayLegs || [];

  // Clean up lock display
  var lockDisplay = lock;
  if (lockDisplay && (lockDisplay.indexOf("##") >= 0 || lockDisplay.length < 5)) lockDisplay = null;

  // Stats
  var totalFlagged = flaggedEV.length + flaggedAI.length + (flaggedLock ? 1 : 0) + flaggedParlay.length;
  var statsHTML = '';
  statsHTML += '<div class="stat"><div class="stat-num ' + (totalFlagged > 0 ? 'active' : '') + '">' + totalFlagged + '</div><div class="stat-label">FLAGGED</div></div>';
  statsHTML += '<div class="stat"><div class="stat-num">' + bets.length + '</div><div class="stat-label">EV</div></div>';
  statsHTML += '<div class="stat"><div class="stat-num">' + aiPicks.length + '</div><div class="stat-label">AI</div></div>';
  statsHTML += '<div class="stat"><div class="stat-num">' + (lockDisplay ? 1 : 0) + '</div><div class="stat-label">LOCK</div></div>';
  statsHTML += '<div class="stat"><div class="stat-num">' + parlayLegs.length + '</div><div class="stat-label">PARLAY</div></div>';
  document.getElementById("stats").innerHTML = statsHTML;

  var html = '';

  // EV PLAYS
  if (bets.length > 0) {
    html += '<div class="section">';
    html += '<div class="section-header"><div class="section-title">🎯 +EV PLAYS</div><div class="section-count">' + flaggedEV.length + '/' + bets.length + '</div></div>';
    for (var i = 0; i < bets.length; i++) {
      var b = bets[i];
      var f = flaggedEV.indexOf(i) >= 0;
      html += '<div class="pick-card ' + (f ? 'flagged' : '') + '" onclick="toggle(\'ev\',' + i + ')">';
      html += '<div class="checkbox ' + (f ? 'checked' : '') + '">' + (f ? '✓' : '') + '</div>';
      html += '<div style="flex:1">';
      html += '<div class="pick-sport">' + b.sport + ' · ' + b.marketLabel + '</div>';
      html += '<div class="pick-name">' + b.pick + '</div>';
      html += '<div class="pick-game">' + b.game + '</div>';
      html += '<div class="pick-details"><span class="pick-book">' + b.bookName + ' ' + fmtOdds(b.bookOdds) + '</span><span class="pick-ev">EV: ' + (b.ev * 100).toFixed(2) + '%</span></div>';
      html += '</div></div>';
    }
    html += '</div>';
  }

  // AI PICKS
  if (aiPicks.length > 0) {
    html += '<div class="section">';
    html += '<div class="section-header"><div class="section-title">🧠 AI BEST BETS</div><div class="section-count">' + flaggedAI.length + '/' + aiPicks.length + '</div></div>';
    for (var i = 0; i < aiPicks.length; i++) {
      var p = aiPicks[i];
      var f = flaggedAI.indexOf(i) >= 0;
      html += '<div class="pick-card ' + (f ? 'flagged' : '') + '" onclick="toggle(\'ai\',' + i + ')">';
      html += '<div class="checkbox ' + (f ? 'checked' : '') + '">' + (f ? '✓' : '') + '</div>';
      html += '<div style="flex:1">';
      html += '<div class="pick-name">' + p.pick + '</div>';
      html += '<div class="pick-confidence">' + (p.confidence || '') + '</div>';
      html += '<div class="pick-why">' + (p.why || '') + '</div>';
      html += '</div></div>';
    }
    html += '</div>';
  }

  // LOCK
  if (lockDisplay) {
    html += '<div class="section">';
    html += '<div class="section-header"><div class="section-title">🔒 LOCK OF THE DAY</div><div class="section-count">' + (flaggedLock ? '1/1' : '0/1') + '</div></div>';
    html += '<div class="pick-card ' + (flaggedLock ? 'flagged' : '') + '" onclick="toggle(\'lock\',0)">';
    html += '<div class="checkbox ' + (flaggedLock ? 'checked' : '') + '">' + (flaggedLock ? '✓' : '') + '</div>';
    html += '<div style="flex:1"><div class="pick-name" style="color:' + (flaggedLock ? '#FFD700' : '#aaa') + '">' + lockDisplay + '</div></div>';
    html += '</div></div>';
  }

  // PARLAY LEGS
  if (parlayLegs.length > 0) {
    var validLegs = parlayLegs.filter(function(l) { return l.length > 5 && l.indexOf("Estimated") < 0 && l.indexOf("Payout") < 0; });
    if (validLegs.length > 0) {
      html += '<div class="section">';
      html += '<div class="section-header"><div class="section-title">🎲 PARLAY LEGS</div><div class="section-count">' + flaggedParlay.length + '/' + validLegs.length + '</div></div>';
      for (var i = 0; i < parlayLegs.length; i++) {
        if (parlayLegs[i].indexOf("Estimated") >= 0 || parlayLegs[i].indexOf("Payout") >= 0 || parlayLegs[i].length <= 5) continue;
        var f = flaggedParlay.indexOf(i) >= 0;
        html += '<div class="pick-card ' + (f ? 'flagged' : '') + '" onclick="toggle(\'parlay\',' + i + ')">';
        html += '<div class="checkbox ' + (f ? 'checked' : '') + '">' + (f ? '✓' : '') + '</div>';
        html += '<div style="flex:1"><div class="pick-name">Leg ' + (i + 1) + ': ' + parlayLegs[i] + '</div></div>';
        html += '</div>';
      }
      html += '</div>';
    }
  }

  if (bets.length === 0 && aiPicks.length === 0 && !lockDisplay) {
    html = '<div class="empty">No picks saved for this date.<br>Run the morning scan first.</div>';
  }

  // Generate button
  if (totalFlagged > 0) {
    html += '<hr class="divider">';
    html += '<button class="btn btn-generate" id="gen-btn" onclick="generateResults()">GENERATE RESULTS (' + totalFlagged + ' PICKS)</button>';
  }

  document.getElementById("flag-content").innerHTML = html;
}

// Init
document.getElementById("date-display").textContent = currentDate;
loadPicks();
</script>
</body>
</html>
