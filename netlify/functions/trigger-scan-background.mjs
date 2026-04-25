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
          bets.push({ sport: sportLabel, icon: sportIcon, type: betType, marketLabel: mktLabel, game: game, pick: pick, time: time, bookName: BOOK_NAMES[sk] || sk, bookOdds: out.price, sharpOdds: sharp.sp, trueProb: sharp.tp, ev: ev, edge: sharp.tp - toImplied(out.price) });
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
    if (!res.ok) { console.log("Polymarket: HTTP " + res.status); return []; }
    var data = await res.json();
    if (!Array.isArray(data)) return [];
    for (var i = 0; i < data.length; i++) {
      var m = data[i];
      if (m.closed || !m.active) continue;
      var outcomes = [];
      if (m.outcomePrices) {
        try { outcomes = JSON.parse(m.outcomePrices); } catch(e) {}
      }
      var outcomeNames = [];
      if (m.outcomes) {
        try { outcomeNames = typeof m.outcomes === "string" ? JSON.parse(m.outcomes) : m.outcomes; } catch(e) {}
      }
      markets.push({
        question: m.question || "",
        slug: m.slug || "",
        outcomes: outcomeNames,
        prices: outcomes,
        volume: m.volume || 0,
        liquidity: m.liquidity || 0,
        endDate: m.endDate || ""
      });
    }
    console.log("Polymarket: " + markets.length + " sports markets found");
  } catch (e) { console.log("Polymarket error: " + e.message); }
  return markets;
}
function buildDiscordEmbeds(bets) {
  var today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  var avgEV = 0;
  for (var i = 0; i < bets.length; i++) avgEV += bets[i].ev;
  avgEV = bets.length ? avgEV / bets.length : 0;
  var topEV = bets[0] ? bets[0].ev : 0;
  var top = bets.slice(0, MAX_BETS);
  var sportCounts = {};
  for (var i = 0; i < bets.length; i++) { var k = bets[i].icon + " " + bets[i].sport; sportCounts[k] = (sportCounts[k] || 0) + 1; }
  var sportSummary = Object.keys(sportCounts).map(function(k) { return k + ": " + sportCounts[k]; }).join(" | ");
  var summaryEmbed = { title: "📈 +EV Best Bets", description: today + "\n\n" + sportSummary, color: 0x00e676, fields: [{ name: "Opportunities", value: "" + bets.length, inline: true },{ name: "Avg EV", value: fmtEV(avgEV), inline: true },{ name: "Top EV", value: fmtEV(topEV), inline: true }], footer: { text: "Sharp: Pinnacle (de-vigged) | Gamble responsibly" }, timestamp: new Date().toISOString() };
  var betEmbeds = [];
  for (var i = 0; i < top.length; i += 5) {
    var chunk = top.slice(i, i + 5); var fields = [];
    for (var j = 0; j < chunk.length; j++) {
      var b = chunk[j]; var rank = i + j + 1;
      var evEmoji = b.ev >= 0.05 ? "🔥" : b.ev >= 0.03 ? "⚡" : "✅";
      fields.push({ name: rank + ". " + b.icon + " " + b.sport + " · " + b.marketLabel, value: "**" + b.pick + "**\n" + b.game + (b.time ? " · " + b.time : "") + "\n📍 **" + b.bookName + "**: `" + fmtOdds(b.bookOdds) + "` → Sharp: `" + fmtOdds(b.sharpOdds) + "`\n" + evEmoji + " EV: **" + fmtEV(b.ev) + "** · Edge: **" + fmtPct(b.edge) + "**", inline: false });
    }
    betEmbeds.push({ color: 0x1a1a25, fields: fields });
  }
  return [summaryEmbed].concat(betEmbeds);
}
async function sendToDiscord(webhookUrl, bets) {
  var embeds = buildDiscordEmbeds(bets);
  for (var i = 0; i < embeds.length; i += 10) {
    var batch = embeds.slice(i, i + 10);
    var payload = { username: "+EV Finder", embeds: batch };
    if (i === 0) payload.content = "# 🎯 Today's +EV Plays";
    var res = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error("Discord: " + res.status);
    if (i + 10 < embeds.length) await new Promise(function(r) { setTimeout(r, 1000); });
  }
}
async function sendPolyToDiscord(webhookUrl, polyMarkets) {
  if (!polyMarkets.length) return;
  var fields = [];
  var sorted = polyMarkets.sort(function(a, b) { return (b.volume || 0) - (a.volume || 0); }).slice(0, 10);
  for (var i = 0; i < sorted.length; i++) {
    var m = sorted[i];
    var priceStr = "";
    for (var p = 0; p < m.outcomes.length && p < m.prices.length; p++) {
      var pct = (parseFloat(m.prices[p]) * 100).toFixed(0);
      if (p > 0) priceStr += " | ";
      priceStr += m.outcomes[p] + ": **" + pct + "%**";
    }
    var vol = m.volume ? "$" + Math.round(m.volume).toLocaleString() : "n/a";
    fields.push({ name: "📊 " + m.question, value: priceStr + "\nVolume: " + vol, inline: false });
  }
  if (!fields.length) return;
  var embeds = [];
  for (var i = 0; i < fields.length; i += 5) {
    embeds.push({ color: 0x2962FF, fields: fields.slice(i, i + 5) });
  }
  await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "+EV Finder", content: "# 📊 Polymarket — Prediction Market Odds" }) });
  await new Promise(function(r) { setTimeout(r, 500); });
  for (var i = 0; i < embeds.length; i += 10) {
    var batch = embeds.slice(i, i + 10);
    if (i === embeds.length - 1 || i + 10 >= embeds.length) { batch[batch.length - 1].footer = { text: "Source: Polymarket | Prices = market-implied probability" }; }
    await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "+EV Finder", embeds: batch }) });
    if (i + 10 < embeds.length) await new Promise(function(r) { setTimeout(r, 500); });
  }
}
async function getAIPicks(games, bets, polyMarkets, anthropicKey, webhookUrl) {
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
  var topEV = bets.slice(0, 10);
  for (var i = 0; i < topEV.length; i++) { var b = topEV[i]; evSummary += b.icon + " " + b.sport + ": " + b.pick + " (" + b.game + ") | " + b.bookName + " " + fmtOdds(b.bookOdds) + " | EV: " + fmtEV(b.ev) + "\n"; }
  var polyInfo = "";
  if (polyMarkets.length) {
    polyInfo = "\nPolymarket prediction market odds (these represent real money crowd consensus):\n";
    var topPoly = polyMarkets.sort(function(a, b) { return (b.volume || 0) - (a.volume || 0); }).slice(0, 15);
    for (var i = 0; i < topPoly.length; i++) {
      var m = topPoly[i]; polyInfo += "- " + m.question + ": ";
      for (var p = 0; p < m.outcomes.length && p < m.prices.length; p++) {
        if (p > 0) polyInfo += ", ";
        polyInfo += m.outcomes[p] + " " + (parseFloat(m.prices[p]) * 100).toFixed(0) + "%";
      }
      polyInfo += " (vol: $" + Math.round(m.volume || 0) + ")\n";
    }
  }
  var prompt = "You are a sharp sports betting analyst. Today is " + today + ".\n\n";
  prompt += "Here are today's games:\n" + gameList + "\n\n";
  if (evSummary) { prompt += "+EV opportunities (soft book odds better than Pinnacle de-vigged line):\n" + evSummary + "\n\n"; }
  if (polyInfo) { prompt += polyInfo + "\n"; }
  prompt += "Give me your TOP 5 BEST BETS OF THE DAY. For each pick:\n";
  prompt += "1. State the pick clearly (team, spread/ML/total/prop, odds)\n";
  prompt += "2. Confidence: 🔥🔥🔥 (strong), 🔥🔥 (good), 🔥 (lean)\n";
  prompt += "3. 2-3 sentences reasoning: recent form, matchup history, home/away splits, rest, injuries, weather, situational spots\n";
  prompt += "4. Note if it overlaps with a +EV opportunity or aligns with Polymarket consensus\n\n";
  prompt += "Format:\nPICK: [pick]\nCONFIDENCE: [emojis]\nWHY: [reasoning]\n\n";
  prompt += "Be bold. End with a parlay suggestion combining your top 3.";
  try {
    await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "+EV Finder", content: "🧠 Generating AI analysis..." }) });
    var aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1500, messages: [{ role: "user", content: prompt }] })
    });
    if (!aiRes.ok) { var aiErr = await aiRes.text(); await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "+EV Finder", content: "⚠️ AI error: HTTP " + aiRes.status + " — " + aiErr.substring(0, 200) }) }); return; }
    var aiData = await aiRes.json(); var aiText = "";
    for (var i = 0; i < aiData.content.length; i++) { if (aiData.content[i].type === "text") aiText += aiData.content[i].text; }
    if (!aiText) return;
    var chunks = [];
    while (aiText.length > 0) {
      if (aiText.length <= 3900) { chunks.push(aiText); break; }
      var cut = aiText.lastIndexOf("\n", 3900); if (cut === -1) cut = 3900;
      chunks.push(aiText.substring(0, cut)); aiText = aiText.substring(cut);
    }
    await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "+EV Finder", content: "# 🧠 AI Best Bets of the Day" }) });
    await new Promise(function(r) { setTimeout(r, 500); });
    for (var c = 0; c < chunks.length; c++) {
      var embed = { description: chunks[c], color: 0x7C3AED };
      if (c === chunks.length - 1) embed.footer = { text: "Powered by Claude AI + Polymarket data | Not financial advice" };
      await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "+EV Finder", embeds: [embed] }) });
      if (c < chunks.length - 1) await new Promise(function(r) { setTimeout(r, 500); });
    }
  } catch (e) { await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "+EV Finder", content: "⚠️ AI error: " + e.message }) }); }
}
export async function handler(event) {
  var ODDS_API_KEY = (process.env.ODDS_API_KEY || "").trim();
  var DISCORD_WEBHOOK = (process.env.DISCORD_WEBHOOK || "").trim();
  var ANTHROPIC_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!ODDS_API_KEY) return { statusCode: 500, body: "Missing ODDS_API_KEY" };
  if (!DISCORD_WEBHOOK) return { statusCode: 500, body: "Missing DISCORD_WEBHOOK" };
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
  if (bets.length) { await sendToDiscord(DISCORD_WEBHOOK, bets); }
  else { await fetch(DISCORD_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "+EV Finder", content: "📭 **No +EV bets found.** " + sportsScanned + " sports. ~" + creditsUsed + " credits." }) }); }
  await new Promise(function(r) { setTimeout(r, 1000); });
  if (polyMarkets.length) { await sendPolyToDiscord(DISCORD_WEBHOOK, polyMarkets); }
  if (ANTHROPIC_KEY && allGames.length > 0) {
    await new Promise(function(r) { setTimeout(r, 1500); });
    await getAIPicks(allGames, bets, polyMarkets, ANTHROPIC_KEY, DISCORD_WEBHOOK);
    summary += " + AI picks";
  }
  return { statusCode: 200, body: summary };
}
