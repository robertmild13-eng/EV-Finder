export async function handler(event) {
  var headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: headers, body: "" };

  var ANTHROPIC_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
  var ODDS_API_KEY = (process.env.ODDS_API_KEY || "").trim();
  var params = event.queryStringParameters || {};
  var date = params.date || new Date().toISOString().slice(0, 10);

  if (!ANTHROPIC_KEY) return { statusCode: 200, headers: headers, body: JSON.stringify({ error: "Missing ANTHROPIC_API_KEY" }) };

  // Load picks
  var savedPicks = null;
  try {
    var pickRes = await fetch("https://evfindermurray.netlify.app/.netlify/functions/picks-db?date=" + date);
    if (pickRes.ok) {
      var pickText = await pickRes.text();
      if (pickText && pickText.indexOf("{") === 0) savedPicks = JSON.parse(pickText);
    }
  } catch(e) {}

  if (!savedPicks) return { statusCode: 200, headers: headers, body: JSON.stringify({ error: "No picks for " + date }) };

  var flaggedEV = savedPicks.flaggedEV || [];
  var flaggedAI = savedPicks.flaggedAI || [];
  var flaggedLock = savedPicks.flaggedLock || false;
  var flaggedParlay = savedPicks.flaggedParlay || [];
  var hasFlagged = flaggedEV.length > 0 || flaggedAI.length > 0 || flaggedLock || flaggedParlay.length > 0;

  if (!hasFlagged) return { statusCode: 200, headers: headers, body: JSON.stringify({ error: "No picks flagged. Go flag your picks first." }) };

  // Fetch scores
  var completedGames = [];
  var sports = [
    { key: "basketball_nba", label: "NBA" },
    { key: "baseball_mlb", label: "MLB" },
    { key: "icehockey_nhl", label: "NHL" },
    { key: "basketball_wnba", label: "WNBA" },
    { key: "soccer_epl", label: "EPL" },
    { key: "soccer_usa_mls", label: "MLS" },
    { key: "soccer_spain_la_liga", label: "La Liga" },
    { key: "americanfootball_ufl", label: "UFL" },
    { key: "tennis_atp_madrid_open", label: "ATP Madrid" },
    { key: "tennis_wta_madrid_open", label: "WTA Madrid" },
    { key: "mma_mixed_martial_arts", label: "MMA/UFC" },
  ];
  if (ODDS_API_KEY) {
    for (var i = 0; i < sports.length; i++) {
      try {
        var res = await fetch("https://api.the-odds-api.com/v4/sports/" + sports[i].key + "/scores/?apiKey=" + ODDS_API_KEY + "&daysFrom=1");
        if (res.ok) {
          var scores = await res.json();
          for (var j = 0; j < scores.length; j++) {
            var game = scores[j];
            if (game.completed) {
              var homeScore = 0; var awayScore = 0;
              if (game.scores) {
                for (var s = 0; s < game.scores.length; s++) {
                  if (game.scores[s].name === game.home_team) homeScore = parseInt(game.scores[s].score) || 0;
                  if (game.scores[s].name === game.away_team) awayScore = parseInt(game.scores[s].score) || 0;
                }
              }
              var winner = homeScore > awayScore ? game.home_team : (awayScore > homeScore ? game.away_team : "DRAW");
              var totalRuns = homeScore + awayScore;
              completedGames.push({ sport: sports[i].label, home: game.home_team, away: game.away_team, homeScore: homeScore, awayScore: awayScore, winner: winner, total: totalRuns });
            }
          }
        }
      } catch (e) {}
    }
  }

  // Load running record from previous days
  var runningRecord = { ev: { w: 0, l: 0 }, ai: { w: 0, l: 0 }, lock: { w: 0, l: 0 }, parlay: { w: 0, l: 0 } };
  try {
    var histRes = await fetch("https://evfindermurray.netlify.app/.netlify/functions/picks-db?date=running-record");
    if (histRes.ok) {
      var histText = await histRes.text();
      if (histText && histText.indexOf("{") === 0) runningRecord = JSON.parse(histText);
    }
  } catch(e) {}

  // Build prompt
  var today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/New_York" });

  var gamesInfo = "";
  if (completedGames.length) {
    var bySport = {};
    for (var i = 0; i < completedGames.length; i++) {
      var g = completedGames[i];
      if (!bySport[g.sport]) bySport[g.sport] = [];
      bySport[g.sport].push(g);
    }
    gamesInfo = "COMPLETED GAMES (scores are CORRECT from the API — do NOT change winners):\n\n";
    var sportKeys = Object.keys(bySport);
    for (var i = 0; i < sportKeys.length; i++) {
      gamesInfo += sportKeys[i] + ":\n";
      for (var j = 0; j < bySport[sportKeys[i]].length; j++) {
        var g = bySport[sportKeys[i]][j];
        gamesInfo += "  " + g.away + " " + g.awayScore + " @ " + g.home + " " + g.homeScore + " — Winner: " + g.winner + " | Total: " + g.total + "\n";
      }
      gamesInfo += "\n";
    }
  }

  var evPicksInfo = "";
  if (savedPicks.bets && flaggedEV.length > 0) {
    evPicksInfo = "=== FLAGGED EV PICKS ===\n";
    for (var i = 0; i < flaggedEV.length; i++) {
      var idx = flaggedEV[i];
      if (idx < savedPicks.bets.length) {
        var b = savedPicks.bets[idx];
        var fo = b.bookOdds > 0 ? "+" + b.bookOdds : "" + b.bookOdds;
        evPicksInfo += (i + 1) + ". " + b.sport + " | " + b.pick + " | " + b.game + " | " + b.bookName + " " + fo + " | Type: " + b.marketLabel + "\n";
      }
    }
    evPicksInfo += "\n";
  }

  var aiPicksInfo = "";
  if (savedPicks.aiPicks && flaggedAI.length > 0) {
    aiPicksInfo = "=== FLAGGED AI BEST BETS ===\n";
    for (var i = 0; i < flaggedAI.length; i++) {
      var idx = flaggedAI[i];
      if (idx < savedPicks.aiPicks.length) {
        aiPicksInfo += (i + 1) + ". " + savedPicks.aiPicks[idx].pick + "\n";
      }
    }
    aiPicksInfo += "\n";
  }

  var lockParlayInfo = "";
  if (flaggedLock && savedPicks.lock) {
    lockParlayInfo += "=== FLAGGED LOCK OF THE DAY ===\n";
    lockParlayInfo += "LOCK: " + savedPicks.lock + "\n\n";
  }
  if (savedPicks.parlayLegs && flaggedParlay.length > 0) {
    lockParlayInfo += "=== FLAGGED PARLAY LEGS ===\n";
    for (var i = 0; i < flaggedParlay.length; i++) {
      var idx = flaggedParlay[i];
      if (idx < savedPicks.parlayLegs.length) {
        lockParlayInfo += "Leg " + (i + 1) + ": " + savedPicks.parlayLegs[idx] + "\n";
      }
    }
    lockParlayInfo += "\n";
  }

  var runningInfo = "=== RUNNING RECORD (before today) ===\n";
  runningInfo += "EV Plays: " + runningRecord.ev.w + "-" + runningRecord.ev.l + "\n";
  runningInfo += "AI Picks: " + runningRecord.ai.w + "-" + runningRecord.ai.l + "\n";
  runningInfo += "Lock: " + runningRecord.lock.w + "-" + runningRecord.lock.l + "\n";
  runningInfo += "Parlay Legs: " + runningRecord.parlay.w + "-" + runningRecord.parlay.l + "\n\n";

  var prompt = "You are the official record keeper for The Juice Report sports betting Discord. Today is " + today + " (Eastern Time).\n\n";
  prompt += gamesInfo;
  prompt += evPicksInfo;
  prompt += aiPicksInfo;
  prompt += lockParlayInfo;
  prompt += runningInfo;
  prompt += "\nCRITICAL GRADING RULES:\n";
  prompt += "1. Scores and winners above are from the official API. Do NOT change them.\n";
  prompt += "2. ONLY grade the FLAGGED picks listed above.\n";
  prompt += "3. ML picks: WIN if the team we picked won. LOSS if they lost.\n";
  prompt += "4. Spread picks: WIN if the team covered. LOSS if not.\n";
  prompt += "5. Total (Over/Under): WIN if combined score went over/under the line. LOSS if not.\n";
  prompt += "6. If a game hasn't been played yet, mark as PENDING.\n";
  prompt += "7. Grade each parlay leg individually.\n\n";
  prompt += "FORMAT YOUR RESPONSE AS VALID JSON with this exact structure:\n";
  prompt += '{\n';
  prompt += '  "date": "' + today + '",\n';
  prompt += '  "evResults": [{"pick": "pick text", "result": "WIN or LOSS or PENDING", "score": "away X @ home Y"}],\n';
  prompt += '  "aiResults": [{"pick": "pick text", "result": "WIN or LOSS or PENDING", "score": "away X @ home Y"}],\n';
  prompt += '  "lockResult": {"pick": "pick text", "result": "WIN or LOSS or PENDING", "score": "away X @ home Y"},\n';
  prompt += '  "parlayResults": [{"pick": "leg text", "result": "WIN or LOSS or PENDING", "score": "away X @ home Y"}],\n';
  prompt += '  "todayRecord": {"w": 0, "l": 0},\n';
  prompt += '  "reasoning": ["why pick 1 hit/missed", "why pick 2 hit/missed"],\n';
  prompt += '  "summary": "2-3 sentence overall summary of today"\n';
  prompt += '}\n\n';
  prompt += "ONLY return valid JSON. No markdown, no backticks, no extra text.";

  try {
    var aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: prompt }] })
    });
    if (!aiRes.ok) {
      var err = await aiRes.text();
      return { statusCode: 200, headers: headers, body: JSON.stringify({ error: "AI error: " + aiRes.status }) };
    }
    var aiData = await aiRes.json();
    var aiText = "";
    for (var i = 0; i < aiData.content.length; i++) {
      if (aiData.content[i].type === "text") aiText += aiData.content[i].text;
    }

    // Parse JSON response
    var clean = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
    var results = JSON.parse(clean);

    // Update running record
    var newRunning = JSON.parse(JSON.stringify(runningRecord));
    if (results.todayRecord) {
      // Count by category
      if (results.evResults) {
        for (var i = 0; i < results.evResults.length; i++) {
          if (results.evResults[i].result === "WIN") newRunning.ev.w++;
          else if (results.evResults[i].result === "LOSS") newRunning.ev.l++;
        }
      }
      if (results.aiResults) {
        for (var i = 0; i < results.aiResults.length; i++) {
          if (results.aiResults[i].result === "WIN") newRunning.ai.w++;
          else if (results.aiResults[i].result === "LOSS") newRunning.ai.l++;
        }
      }
      if (results.lockResult && results.lockResult.result === "WIN") newRunning.lock.w++;
      else if (results.lockResult && results.lockResult.result === "LOSS") newRunning.lock.l++;
      if (results.parlayResults) {
        for (var i = 0; i < results.parlayResults.length; i++) {
          if (results.parlayResults[i].result === "WIN") newRunning.parlay.w++;
          else if (results.parlayResults[i].result === "LOSS") newRunning.parlay.l++;
        }
      }
    }

    // Save updated running record
    try {
      await fetch("https://evfindermurray.netlify.app/.netlify/functions/picks-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: "running-record", ev: newRunning.ev, ai: newRunning.ai, lock: newRunning.lock, parlay: newRunning.parlay })
      });
    } catch(e) {}

    // Build Discord-formatted text
    var discord = "# 📋 Daily Results — " + today + "\n---\n\n";

    if (results.evResults && results.evResults.length > 0) {
      discord += "**📈 +EV PLAYS**\n";
      for (var i = 0; i < results.evResults.length; i++) {
        var r = results.evResults[i];
        discord += (r.result === "WIN" ? "✅" : r.result === "LOSS" ? "❌" : "⏳") + " " + r.pick + " — " + (r.score || "") + "\n";
      }
      discord += "\n";
    }

    if (results.aiResults && results.aiResults.length > 0) {
      discord += "**🧠 AI BEST BETS**\n";
      for (var i = 0; i < results.aiResults.length; i++) {
        var r = results.aiResults[i];
        discord += (r.result === "WIN" ? "✅" : r.result === "LOSS" ? "❌" : "⏳") + " " + r.pick + " — " + (r.score || "") + "\n";
      }
      discord += "\n";
    }

    if (results.lockResult && results.lockResult.pick) {
      discord += "**🔒 LOCK OF THE DAY**\n";
      discord += (results.lockResult.result === "WIN" ? "✅" : results.lockResult.result === "LOSS" ? "❌" : "⏳") + " " + results.lockResult.pick + " — " + (results.lockResult.score || "") + "\n\n";
    }

    if (results.parlayResults && results.parlayResults.length > 0) {
      discord += "**🎲 PARLAY LEGS**\n";
      for (var i = 0; i < results.parlayResults.length; i++) {
        var r = results.parlayResults[i];
        discord += (r.result === "WIN" ? "✅" : r.result === "LOSS" ? "❌" : "⏳") + " " + r.pick + " — " + (r.score || "") + "\n";
      }
      discord += "\n";
    }

    discord += "---\n**📊 TODAY: " + results.todayRecord.w + "-" + results.todayRecord.l + "**\n\n";

    discord += "**📊 RUNNING RECORD**\n";
    discord += "+EV Plays: " + newRunning.ev.w + "-" + newRunning.ev.l + "\n";
    discord += "AI Picks: " + newRunning.ai.w + "-" + newRunning.ai.l + "\n";
    discord += "Lock: " + newRunning.lock.w + "-" + newRunning.lock.l + "\n";
    discord += "Parlay Legs: " + newRunning.parlay.w + "-" + newRunning.parlay.l + "\n\n";

    discord += "---\n";
    if (results.reasoning && results.reasoning.length > 0) {
      discord += "**🔍 KEY TAKEAWAYS**\n";
      for (var i = 0; i < results.reasoning.length; i++) {
        discord += "• " + results.reasoning[i] + "\n";
      }
      discord += "\n";
    }
    if (results.summary) {
      discord += results.summary + "\n\n";
    }
    discord += "*The math doesn't lie. Trust the process.*\n🍊 The Juice Report — Squeeze the Edge";

    // Build tweet
    var tweet = "Day " + date.slice(-2) + " results:\n\n";
    if (results.evResults) { for (var i = 0; i < results.evResults.length; i++) { var r = results.evResults[i]; tweet += (r.result === "WIN" ? "✅" : "❌") + " " + r.pick + "\n"; } }
    if (results.aiResults) { for (var i = 0; i < results.aiResults.length; i++) { var r = results.aiResults[i]; tweet += (r.result === "WIN" ? "✅" : "❌") + " " + r.pick + "\n"; } }
    if (results.lockResult && results.lockResult.pick) { tweet += (results.lockResult.result === "WIN" ? "✅" : "❌") + " " + results.lockResult.pick + "\n"; }
    tweet += "\n" + results.todayRecord.w + "-" + results.todayRecord.l + " on the day. ";
    var totalW = newRunning.ev.w + newRunning.ai.w + newRunning.lock.w + newRunning.parlay.w;
    var totalL = newRunning.ev.l + newRunning.ai.l + newRunning.lock.l + newRunning.parlay.l;
    tweet += "Overall: " + totalW + "-" + totalL + " 🍊";

    return { statusCode: 200, headers: headers, body: JSON.stringify({ results: results, discord: discord, tweet: tweet, running: newRunning }) };
  } catch (e) {
    return { statusCode: 200, headers: headers, body: JSON.stringify({ error: "Error: " + e.message }) };
  }
}
