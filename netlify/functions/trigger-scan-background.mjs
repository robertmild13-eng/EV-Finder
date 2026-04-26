var ODDS_API_BASE = "https://api.the-odds-api.com/v4";
var POLY_API = "https://gamma-api.polymarket.com";
var MIN_EV = 0.01;
var MAX_BETS = 25;
var SPORTS = [
  { key: "basketball_nba", label: "NBA", icon: "🏀", props: true },
  { key: "baseball_mlb", label: "MLB", icon: "⚾", props: true },
  { key: "icehockey_nhl", label: "NHL", icon: "🏒", props: true },
  { key: "basketball_wnba", label: "WNBA", icon: "🏀", props: true },
  { key: "americanfootball_ufl", label: "UFL", icon: "🏈", props: true },
  { key: "soccer_epl", label: "EPL", icon: "⚽", props: false },
  { key: "soccer_spain_la_liga", label: "La Liga", icon: "⚽", props: false },
  { key: "soccer_usa_mls", label: "MLS", icon: "⚽", props: false },
  { key: "soccer_mexico_ligamx", label: "Liga MX", icon: "⚽", props: false },
  { key: "tennis_atp_madrid_open", label: "ATP Madrid", icon: "🎾", props: false },
  { key: "tennis_wta_madrid_open", label: "WTA Madrid", icon: "🎾", props: false },
  { key: "mma_mixed_martial_arts", label: "MMA/UFC", icon: "🥊", props: false },
  { key: "cricket_ipl", label: "IPL", icon: "🏏", props: false },
  { key: "baseball_kbo", label: "KBO", icon: "⚾", props: false }
];
var SHARP_BOOKS = ["pinnacle"];
var SOFT_BOOKS = ["draftkings","fanduel","betmgm","williamhill_us","bovada","bet365","betrivers","pointsbetus","superbook"];
var BOOK_NAMES = {draftkings:"DraftKings",fanduel:"FanDuel",betmgm:"BetMGM",williamhill_us:"Caesars",bovada:"Bovada",bet365:"Bet365",betrivers:"BetRivers",pointsbetus:"PointsBet",superbook:"SuperBook",pinnacle:"Pinnacle"};
var ALL_BOOKS = SHARP_BOOKS.concat(SOFT_BOOKS).join(",");
var REGIONS = "us,eu";
var GAME_MARKETS = "h2h,spreads,totals";
var PROP_MARKETS = "player_pass_tds,player_pass_yds,player_rush_yds,player_receptions,player_reception_yds,player_points,player_rebounds,player_assists,player_threes,player_hits,player_total_bases,player_home_runs,player_pitcher_strikeouts,player_goals,player_shots_on_goal";
var PROP_LABELS = {player_pass_tds:"Pass TDs",player_pass_yds:"Pass Yds",player_rush_yds:"Rush Yds",player_receptions:"Receptions",player_reception_yds:"Rec Yds",player_points:"Points",player_rebounds:"Rebounds",player_assists:"Assists",player_threes:"3PT",player_hits:"Hits",player_total_bases:"Total Bases",player_home_runs:"HRs",player_pitcher_strikeouts:"K's",player_goals:"Goals",player_shots_on_goal:"SOG"};
function toDecimal(o) { return o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1; }
function toImplied(o) { return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100); }
function fmtOdds(o) { return o > 0 ? "+" + o : "" + o; }
function fmtPct(p) { return (p * 100).toFixed(1) + "%"; }
function fmtEV(e) { return (e > 0 ? "+" : "") + (e * 100).toFixed(2) + "%"; }
function kellyBet(trueProb, decimalOdds, bankroll) {
  var b = decimalOdds - 1; var q = 1 - trueProb;
  var fullKelly = (b * trueProb - q) / b;
  if (fullKelly <= 0) return { full: 0, quarter: 0, betSize: 0 };
  var quarterKelly = fullKelly * 0.25;
  return { full: fullKelly, quarter: quarterKelly, betSize: Math.round(bankroll * quarterKelly * 100) / 100 };
}
function devig(outcomes) {
  var total = 0;
  for (var i = 0; i < outcomes.length; i++) total += toImplied(outcomes[i].price);
  return outcomes.map(function(o) { return { name: o.name, price: o.price, point: o.point, description: o.description, trueProb: toImplied(o.price) / total }; });
}
function extractEV(events, sportLabel, sportIcon, propsOnly) {
  var bets = [];
  for (var e = 0; e < events.length; e++) {
    var event = events[e];
    var game = event.away_team + " @ " + event.home_team;
    var time = new Date(event.commence_time).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" });
    var bmMap = {};
    if (event.bookmakers) { for (var b = 0; b < event.bookmakers.length; b++) { bmMap[event.bookmakers[b].key] = event.bookmakers[b]; } }
    var sharpKey = null;
    for (var s = 0; s < SHARP_BOOKS.length; s++) { if (bmMap[SHARP_BOOKS[s]]) { sharpKey = SHARP_BOOKS[s]; break; } }
    if (!sharpKey) continue;
    var sharpMarkets = bmMap[sharpKey].markets || [];
    for (var m = 0; m < sharpMarkets.length; m++) {
      var sm = sharpMarkets[m]; var mk = sm.key;
      var isProp = mk.indexOf("player_") === 0;
      if (propsOnly && !isProp) continue;
      if (!propsOnly && isProp) continue;
      var dvSharp = devig(sm.outcomes); var tpMap = {};
      for (var d = 0; d < dvSharp.length; d++) { var o = dvSharp[d]; tpMap[o.name + "|" + (o.point != null ? o.point : "") + "|" + (o.description || "")] = { tp: o.trueProb, sp: o.price }; }
      for (var sb = 0; sb < SOFT_BOOKS.length; sb++) {
        var sk = SOFT_BOOKS[sb]; if (!bmMap[sk]) continue;
        var sMarket = null; var softMarkets = bmMap[sk].markets || [];
        for (var sm2 = 0; sm2 < softMarkets.length; sm2++) { if (softMarkets[sm2].key === mk) { sMarket = softMarkets[sm2]; break; } }
        if (!sMarket) continue;
        for (var oi = 0; oi < sMarket.outcomes.length; oi++) {
          var out = sMarket.outcomes[oi];
          var lk = out.name + "|" + (out.point != null ? out.point : "") + "|" + (out.description || "");
          var sharp = tpMap[lk]; if (!sharp) continue;
          var ev = sharp.tp * toDecimal(out.price) - 1; if (ev <= MIN_EV) continue;
          var betType = mk === "spreads" ? "Spread" : mk === "totals" ? "Total" : isProp ? "Prop" : "ML";
          var pick = out.name;
          if (out.point != null) {
            if (mk === "spreads") pick = out.name + " " + (out.point > 0 ? "+" : "") + out.point;
            else if (mk === "totals") pick = out.name + " " + out.point;
            else if (isProp) pick = (out.description || out.name) + " " + out.name + " " + out.point;
          } else if (isProp && out.description) { pick = out.description + " - " + out.name; }
          var mktLabel = isProp ? (PROP_LABELS[mk] || mk.replace("player_","").replace(/_/g," ")) : betType;
          bets.push({ sport: sportLabel, icon: sportIcon, type: betType, marketLabel: mktLabel, game: game, pick: pick, time: time, bookName: BOOK_NAMES[sk] || sk, bookOdds: out.price, sharpOdds: sharp.sp, trueProb: sharp.tp, ev: ev, edge: sharp.tp - toImplied(out.price), decimalOdds: toDecimal(out.price) });
        }
      }
    }
  }
  return bets;
}
async function fetchPolymarketSports() {
  var markets = [];
  try {
    var res = await fetch(POLY_API + "/markets?limit=100&active=true&tag=sports", { headers: { "User-Agent": "EVFinder/1.0" } });
    if (!res.ok) return [];
    var data = await res.json();
    if (!Array.isArray(data)) return [];
    for (var i = 0; i < data.length; i++) {
      var m = data[i];
      if (m.closed || !m.active) continue;
      var outcomes = []; var outcomeNames = [];
      try { outcomes = m.outcomePrices ? JSON.parse(m.outcomePrices) : []; } catch(e) {}
      try { outcomeNames = m.outcomes ? (typeof m.outcomes === "string" ? JSON.parse(m.outcomes) : m.outcomes) : []; } catch(e) {}
      markets.push({ question: m.question || "", outcomes: outcomeNames, prices: outcomes, volume: m.volume || 0 });
    }
  } catch (e) {}
  return markets;
}
async function post(webhook, content, embeds) {
  var payload = { username: "+EV Finder" };
  if (content) payload.content = content;
  if (embeds) payload.embeds = embeds;
  await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  await new Promise(function(r) { setTimeout(r, 600); });
}
async function sendEVPlays(webhook, bets, bankroll) {
  var today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  var avgEV = 0; var totalExpProfit = 0; var totalKellyRisk = 0;
  for (var i = 0; i < bets.length; i++) {
    avgEV += bets[i].ev;
    var k = kellyBet(bets[i].trueProb, bets[i].decimalOdds, bankroll);
    bets[i].kelly = k;
    totalExpProfit += k.betSize * bets[i].ev;
    totalKellyRisk += k.betSize;
  }
  avgEV = bets.length ? avgEV / bets.length : 0;
  var topEV = bets[0] ? bets[0].ev : 0;
  var top = bets.slice(0, MAX_BETS);
  var sportCounts = {};
  for (var i = 0; i < bets.length; i++) { var k2 = bets[i].icon + " " + bets[i].sport; sportCounts[k2] = (sportCounts[k2] || 0) + 1; }
  var sportSummary = Object.keys(sportCounts).map(function(k2) { return k2 + ": " + sportCounts[k2]; }).join(" | ");
  var summaryEmbed = { title: "📈 +EV Best Bets", description: today + "\n\n" + sportSummary, color: 0x00e676, fields: [
    { name: "Opportunities", value: "" + bets.length, inline: true },
    { name: "Avg EV", value: fmtEV(avgEV), inline: true },
    { name: "Top EV", value: fmtEV(topEV), inline: true },
    { name: "💰 Bankroll", value: "$" + bankroll.toLocaleString(), inline: true },
    { name: "📊 Total Kelly Risk", value: "$" + totalKellyRisk.toFixed(2), inline: true },
    { name: "📈 Expected Profit", value: "$" + totalExpProfit.toFixed(2), inline: true }
  ], footer: { text: "Quarter-Kelly sizing | Sharp: Pinnacle (de-vigged)" }, timestamp: new Date().toISOString() };
  await post(webhook, "# 🎯 Today's +EV Plays", [summaryEmbed]);
  for (var i = 0; i < top.length; i += 5) {
    var chunk = top.slice(i, i + 5); var fields = [];
    for (var j = 0; j < chunk.length; j++) {
      var b = chunk[j]; var rank = i + j + 1;
      var evEmoji = b.ev >= 0.05 ? "🔥" : b.ev >= 0.03 ? "⚡" : "✅";
      var kellyStr = b.kelly.betSize > 0 ? "\n💰 Bet: **$" + b.kelly.betSize.toFixed(2) + "** (Kelly: " + (b.kelly.quarter * 100).toFixed(1) + "%)" : "";
      fields.push({ name: rank + ". " + b.icon + " " + b.sport + " · " + b.marketLabel, value: "**" + b.pick + "**\n" + b.game + (b.time ? " · " + b.time : "") + "\n📍 **" + b.bookName + "**: `" + fmtOdds(b.bookOdds) + "` → Sharp: `" + fmtOdds(b.sharpOdds) + "`\n" + evEmoji + " EV: **" + fmtEV(b.ev) + "** · Edge: **" + fmtPct(b.edge) + "**" + kellyStr, inline: false });
    }
    await post(webhook, null, [{ color: 0x1a1a25, fields: fields }]);
  }
}
async function sendBacktest(webhook, bets, bankroll) {
  var totalExpProfit = 0; var totalRisk = 0; var avgEdge = 0; var flat100Profit = 0;
  var sportBreakdown = {};
  for (var i = 0; i < bets.length; i++) {
    var b = bets[i];
    var k = kellyBet(b.trueProb, b.decimalOdds, bankroll);
    totalExpProfit += k.betSize * b.ev; totalRisk += k.betSize; avgEdge += b.edge;
    flat100Profit += 100 * b.ev;
    var sk = b.icon + " " + b.sport;
    if (!sportBreakdown[sk]) sportBreakdown[sk] = { count: 0, expProfit: 0, avgEV: 0 };
    sportBreakdown[sk].count++; sportBreakdown[sk].expProfit += k.betSize * b.ev; sportBreakdown[sk].avgEV += b.ev;
  }
  avgEdge = avgEdge / bets.length;
  var roi = totalRisk > 0 ? (totalExpProfit / totalRisk) * 100 : 0;
  var sportLines = Object.keys(sportBreakdown).map(function(sk) {
    var s = sportBreakdown[sk]; s.avgEV = s.avgEV / s.count;
    return sk + ": " + s.count + " bets, Exp: $" + s.expProfit.toFixed(2) + ", Avg EV: " + fmtEV(s.avgEV);
  }).join("\n");
  await post(webhook, "# 📊 Backtest Simulation", [{ title: "📊 Today's Scan — If You Tailed Everything", color: 0xFF9800, fields: [
    { name: "Total +EV Bets", value: "" + bets.length, inline: true },
    { name: "Avg Edge", value: fmtPct(avgEdge), inline: true },
    { name: "Expected ROI", value: roi.toFixed(1) + "%", inline: true },
    { name: "💰 Quarter-Kelly ($" + bankroll.toLocaleString() + ")", value: "Risk: **$" + totalRisk.toFixed(2) + "**\nExp Profit: **$" + totalExpProfit.toFixed(2) + "**", inline: false },
    { name: "📋 Flat $100", value: "Risk: **$" + (bets.length * 100) + "**\nExp Profit: **$" + flat100Profit.toFixed(2) + "**", inline: false },
    { name: "📈 By Sport", value: sportLines, inline: false },
    { name: "⚠️ Remember", value: "Edge shows over volume (1000+ bets). Single-day variance is high. Trust the math, stay disciplined.", inline: false }
  ], footer: { text: "Expected value simulation | Not guaranteed results" }, timestamp: new Date().toISOString() }]);
}
async function sendAItoChannel(webhook, aiText, title, footerText) {
  var chunks = [];
  while (aiText.length > 0) {
    if (aiText.length <= 3900) { chunks.push(aiText); break; }
    var cut = aiText.lastIndexOf("\n", 3900); if (cut === -1) cut = 3900;
    chunks.push(aiText.substring(0, cut)); aiText = aiText.substring(cut);
  }
  await post(webhook, title, null);
  for (var c = 0; c < chunks.length; c++) {
    var embed = { description: chunks[c], color: 0x7C3AED };
    if (c === chunks.length - 1) embed.footer = { text: footerText };
    await post(webhook, null, [embed]);
  }
}
async function runAI(games, bets, polyMarkets, anthropicKey, webhooks) {
  var today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  var gameList = ""; var seen = {};
  for (var i = 0; i < games.length; i++) {
    var g = games[i]; var gk = g.sport + "|" + g.away + "|" + g.home;
    if (seen[gk]) continue; seen[gk] = true;
    gameList += g.icon + " " + g.sport + ": " + g.away + " @ " + g.home + " (" + g.time + ")";
    if (g.odds) gameList += " | ML: " + g.odds;
    gameList += "\n";
  }
  var evSummary = "";
  for (var i = 0; i < Math.min(bets.length, 10); i++) { var b = bets[i]; evSummary += b.icon + " " + b.sport + ": " + b.pick + " (" + b.game + ") | " + b.bookName + " " + fmtOdds(b.bookOdds) + " | EV: " + fmtEV(b.ev) + "\n"; }
  var polyInfo = "";
  if (polyMarkets.length) {
    var topPoly = polyMarkets.sort(function(a, b) { return (b.volume || 0) - (a.volume || 0); }).slice(0, 20);
    for (var i = 0; i < topPoly.length; i++) {
      var m = topPoly[i]; polyInfo += "- " + m.question + ": ";
      for (var p = 0; p < m.outcomes.length && p < m.prices.length; p++) {
        if (p > 0) polyInfo += ", ";
        polyInfo += m.outcomes[p] + " " + (parseFloat(m.prices[p]) * 100).toFixed(0) + "%";
      }
      polyInfo += " (vol: $" + Math.round(m.volume || 0) + ")\n";
    }
  }
  var sportsPrompt = "You are an elite sports betting analyst. Today is " + today + ".\n\n";
  sportsPrompt += "=== TODAY'S GAMES ===\n" + gameList + "\n";
  if (evSummary) { sportsPrompt += "=== +EV OPPORTUNITIES ===\n" + evSummary + "\n"; }
  sportsPrompt += "Give me your TOP 5 SPORTSBOOK BEST BETS OF THE DAY.\nFor each: pick (team, ML/spread/total/prop, odds), confidence (🔥🔥🔥/🔥🔥/🔥), 2-3 sentences reasoning (form, matchups, splits, rest, injuries, situations). Note +EV alignment.\n\n";
  sportsPrompt += "Format:\nPICK: [pick]\nCONFIDENCE: [emojis]\nWHY: [reasoning]\n\nBe bold and specific.";
  try {
    await post(webhooks.aiPicks, "🧠 Generating sportsbook analysis...", null);
    var aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1500, messages: [{ role: "user", content: sportsPrompt }] })
    });
    if (aiRes.ok) {
      var aiData = await aiRes.json(); var aiText = "";
      for (var i = 0; i < aiData.content.length; i++) { if (aiData.content[i].type === "text") aiText += aiData.content[i].text; }
      if (aiText) await sendAItoChannel(webhooks.aiPicks, aiText, "# 🧠 AI Sportsbook Best Bets", "Powered by Claude AI | Not financial advice");
    } else { var err = await aiRes.text(); await post(webhooks.aiPicks, "⚠️ AI error: HTTP " + aiRes.status + " — " + err.substring(0, 200), null); }
  } catch (e) { await post(webhooks.aiPicks, "⚠️ AI error: " + e.message, null); }
  if (polyInfo && webhooks.polymarket) {
    var polyPrompt = "You are an elite prediction market analyst. Today is " + today + ".\n\n";
    polyPrompt += "=== POLYMARKET PREDICTION MARKETS (real money crowd odds) ===\n" + polyInfo + "\n";
    if (gameList) { polyPrompt += "=== TODAY'S SPORTS GAMES FOR CONTEXT ===\n" + gameList + "\n"; }
    polyPrompt += "Give me your TOP 5 POLYMARKET PLAYS.\nFor each: the market question, your pick (Yes/No at what price), confidence (🔥🔥🔥/🔥🔥/🔥), 2-3 sentences on WHY this is mispriced or correctly priced. Consider public bias, sharp money, current form, and what the crowd is over/under-weighting.\n\n";
    polyPrompt += "Format:\nMARKET: [question]\nPICK: [Yes/No] at [price]\nCONFIDENCE: [emojis]\nWHY: [reasoning]\n\nBe bold. Identify where the crowd is WRONG.";
    try {
      await post(webhooks.polymarket, "📊 Analyzing Polymarket...", null);
      var polyRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1500, messages: [{ role: "user", content: polyPrompt }] })
      });
      if (polyRes.ok) {
        var polyData = await polyRes.json(); var polyText = "";
        for (var i = 0; i < polyData.content.length; i++) { if (polyData.content[i].type === "text") polyText += polyData.content[i].text; }
        if (polyText) await sendAItoChannel(webhooks.polymarket, polyText, "# 📊 AI Polymarket Plays", "Polymarket analysis by Claude AI | Not financial advice");
      } else { await post(webhooks.polymarket, "⚠️ Polymarket AI error: HTTP " + polyRes.status, null); }
    } catch (e) { await post(webhooks.polymarket, "⚠️ Polymarket AI error: " + e.message, null); }
  }
  var parlayPrompt = "You are an elite sports betting analyst. Today is " + today + ".\n\n";
  parlayPrompt += "Games today:\n" + gameList + "\n";
  if (evSummary) { parlayPrompt += "+EV opportunities:\n" + evSummary + "\n"; }
  if (polyInfo) { parlayPrompt += "Polymarket odds:\n" + polyInfo + "\n"; }
  parlayPrompt += "Give me:\n1. A brief 3-4 sentence DAILY SUMMARY of today's betting landscape\n2. Your PARLAY OF THE DAY (3-4 legs) with reasoning for each leg and the combined odds estimate\n3. A LOCK OF THE DAY — your single highest confidence play with a short explanation\n\nKeep it punchy and confident.";
  try {
    var parlayRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 800, messages: [{ role: "user", content: parlayPrompt }] })
    });
    if (parlayRes.ok) {
      var parlayData = await parlayRes.json(); var parlayText = "";
      for (var i = 0; i < parlayData.content.length; i++) { if (parlayData.content[i].type === "text") parlayText += parlayData.content[i].text; }
      if (parlayText) await sendAItoChannel(webhooks.announcements, parlayText, "# 📢 Daily Summary & Parlay of the Day", "Daily briefing by Claude AI | Gamble responsibly");
    }
  } catch (e) {}
}
export async function handler(event) {
  var ODDS_API_KEY = (process.env.ODDS_API_KEY || "").trim();
  var ANTHROPIC_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
  var BANKROLL = parseFloat(process.env.BANKROLL || "1000");
  var webhooks = {
    evPlays: (process.env.WEBHOOK_EV_PLAYS || "").trim(),
    aiPicks: (process.env.WEBHOOK_AI_PICKS || "").trim(),
    polymarket: (process.env.WEBHOOK_POLYMARKET || "").trim(),
    backtest: (process.env.WEBHOOK_BACKTEST || "").trim(),
    announcements: (process.env.WEBHOOK_ANNOUNCEMENTS || "").trim()
  };
  if (!ODDS_API_KEY) return { statusCode: 500, body: "Missing ODDS_API_KEY" };
  if (!webhooks.evPlays) return { statusCode: 500, body: "Missing WEBHOOK_EV_PLAYS" };
  var allBets = []; var allGames = []; var creditsUsed = 0; var sportsScanned = 0; var errors = [];
  for (var s = 0; s < SPORTS.length; s++) {
    var sport = SPORTS[s]; var events;
    try {
      var res = await fetch(ODDS_API_BASE + "/sports/" + sport.key + "/odds/?apiKey=" + ODDS_API_KEY + "&regions=" + REGIONS + "&markets=" + GAME_MARKETS + "&oddsFormat=american&bookmakers=" + ALL_BOOKS);
      if (!res.ok) { errors.push(sport.label + ":HTTP" + res.status); if (res.status === 429) break; continue; }
      events = await res.json(); creditsUsed += 6;
    } catch (e) { errors.push(sport.label + ":ERR"); continue; }
    if (!events || !events.length) continue;
    sportsScanned++;
    for (var gi = 0; gi < events.length; gi++) {
      var ge = events[gi]; var gameOdds = "";
      if (ge.bookmakers && ge.bookmakers.length > 0 && ge.bookmakers[0].markets) {
        var ml = null;
        for (var mi = 0; mi < ge.bookmakers[0].markets.length; mi++) { if (ge.bookmakers[0].markets[mi].key === "h2h") { ml = ge.bookmakers[0].markets[mi]; break; } }
        if (ml && ml.outcomes && ml.outcomes.length >= 2) { gameOdds = ge.away_team + " " + fmtOdds(ml.outcomes[0].price) + " / " + ge.home_team + " " + fmtOdds(ml.outcomes[1].price); }
      }
      allGames.push({ sport: sport.label, icon: sport.icon, away: ge.away_team, home: ge.home_team, time: new Date(ge.commence_time).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }), odds: gameOdds });
    }
    allBets = allBets.concat(extractEV(events, sport.label, sport.icon, false));
    if (sport.props) {
      var firstSharp = null;
      for (var ei = 0; ei < events.length; ei++) {
        if (events[ei].bookmakers) { for (var bi = 0; bi < events[ei].bookmakers.length; bi++) { if (events[ei].bookmakers[bi].key === "pinnacle") { firstSharp = events[ei]; break; } } }
        if (firstSharp) break;
      }
      if (firstSharp) {
        try {
          var propRes = await fetch(ODDS_API_BASE + "/sports/" + sport.key + "/events/" + firstSharp.id + "/odds?apiKey=" + ODDS_API_KEY + "&regions=" + REGIONS + "&markets=" + PROP_MARKETS + "&oddsFormat=american&bookmakers=" + ALL_BOOKS);
          if (propRes.ok) { var pd = await propRes.json(); creditsUsed += 2; if (pd && pd.bookmakers) { var propEvent = JSON.parse(JSON.stringify(firstSharp)); propEvent.bookmakers = pd.bookmakers; allBets = allBets.concat(extractEV([propEvent], sport.label, sport.icon, true)); } }
        } catch (err) {}
      }
    }
  }
  var polyMarkets = await fetchPolymarketSports();
  var seen = {}; var bets = [];
  for (var i = 0; i < allBets.length; i++) { var b = allBets[i]; var k = b.bookName + "|" + b.pick + "|" + b.game + "|" + b.marketLabel; if (!seen[k]) { seen[k] = true; bets.push(b); } }
  bets.sort(function(a, b) { return b.ev - a.ev; });
  var summary = bets.length + " bets, " + sportsScanned + " sports, ~" + creditsUsed + " credits, " + polyMarkets.length + " poly markets";
  if (errors.length) summary += " | ERRORS: " + errors.join(",");
  if (bets.length && webhooks.evPlays) { await sendEVPlays(webhooks.evPlays, bets, BANKROLL); }
  else if (webhooks.evPlays) { await post(webhooks.evPlays, "📭 **No +EV bets found.** " + sportsScanned + " sports. ~" + creditsUsed + " credits.", null); }
  if (bets.length && webhooks.backtest) { await sendBacktest(webhooks.backtest, bets, BANKROLL); }
  if (ANTHROPIC_KEY && (allGames.length > 0 || polyMarkets.length > 0)) {
    await runAI(allGames, bets, polyMarkets, ANTHROPIC_KEY, webhooks);
    summary += " + AI picks";
  }
  try {
    var todayKey = new Date().toISOString().slice(0, 10);
    var picksToSave = [];
    for (var i = 0; i < Math.min(bets.length, 30); i++) {
      picksToSave.push({ sport: bets[i].sport, pick: bets[i].pick, game: bets[i].game, bookName: bets[i].bookName, bookOdds: bets[i].bookOdds, sharpOdds: bets[i].sharpOdds, ev: bets[i].ev, edge: bets[i].edge, type: bets[i].type, marketLabel: bets[i].marketLabel });
    }
    var gamesList = [];
    var seenGames = {};
    for (var i = 0; i < allGames.length; i++) {
      var gk = allGames[i].away + "@" + allGames[i].home;
      if (!seenGames[gk]) { seenGames[gk] = true; gamesList.push(allGames[i]); }
    }
    await fetch("https://evfindermurray.netlify.app/.netlify/functions/picks-db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: todayKey, bets: picksToSave, games: gamesList, betCount: bets.length, sportsCount: sportsScanned, credits: creditsUsed })
    });
    summary += " | picks saved";
  } catch (e) { summary += " | save error: " + e.message; }
  return { statusCode: 200, body: summary };
}
