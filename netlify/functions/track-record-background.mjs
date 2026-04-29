export async function handler(event) {
  var DISCORD_WEBHOOK = (process.env.WEBHOOK_RESULTS || process.env.WEBHOOK_ANNOUNCEMENTS || "").trim();
  var ANTHROPIC_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
  var ODDS_API_KEY = (process.env.ODDS_API_KEY || "").trim();

  if (!DISCORD_WEBHOOK) return { statusCode: 500, body: "Missing webhook" };
  if (!ANTHROPIC_KEY) return { statusCode: 500, body: "Missing ANTHROPIC_API_KEY" };

  var now = new Date();
  var today = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/New_York" });
  var todayKey = now.toISOString().slice(0, 10);
  var yesterdayDate = new Date(now.getTime() - 86400000);
  var yesterdayKey = yesterdayDate.toISOString().slice(0, 10);

  // Load saved picks (try today first, then yesterday)
  var savedPicks = null;
  var picksDate = todayKey;
  try {
    var pickRes = await fetch("https://evfindermurray.netlify.app/.netlify/functions/flag-picks?date=" + todayKey);
    if (pickRes.ok) {
      var pickText = await pickRes.text();
      if (pickText && pickText.indexOf("{") === 0) { savedPicks = JSON.parse(pickText); }
    }
  } catch(e) {}
  if (!savedPicks || !savedPicks.bets) {
    picksDate = yesterdayKey;
    try {
      var pickRes2 = await fetch("https://evfindermurray.netlify.app/.netlify/functions/flag-picks?date=" + yesterdayKey);
      if (pickRes2.ok) {
        var pickText2 = await pickRes2.text();
        if (pickText2 && pickText2.indexOf("{") === 0) { savedPicks = JSON.parse(pickText2); }
      }
    } catch(e) {}
  }

  // Get flagged picks only
  var flaggedEV = savedPicks && savedPicks.flaggedEV ? savedPicks.flaggedEV : [];
  var flaggedAI = savedPicks && savedPicks.flaggedAI ? savedPicks.flaggedAI : [];
  var flaggedLock = savedPicks && savedPicks.flaggedLock ? savedPicks.flaggedLock : false;
  var flaggedParlay = savedPicks && savedPicks.flaggedParlay ? savedPicks.flaggedParlay : [];

  var hasFlagged = flaggedEV.length > 0 || flaggedAI.length > 0 || flaggedLock || flaggedParlay.length > 0;

  // Fetch completed game scores
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

  // Build data for AI grading
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

  // Build FLAGGED EV picks info
  var evPicksInfo = "";
  if (savedPicks && savedPicks.bets && flaggedEV.length > 0) {
    evPicksInfo = "=== FLAGGED EV SCANNER PICKS (from " + picksDate + ") ===\n";
    for (var i = 0; i < flaggedEV.length; i++) {
      var idx = flaggedEV[i];
      if (idx < savedPicks.bets.length) {
        var b = savedPicks.bets[idx];
        var fmtOdds = b.bookOdds > 0 ? "+" + b.bookOdds : "" + b.bookOdds;
        evPicksInfo += (i + 1) + ". " + b.sport + " | " + b.pick + " | " + b.game + " | " + b.bookName + " " + fmtOdds + " | Type: " + b.marketLabel + "\n";
      }
    }
    evPicksInfo += "\n";
  }

  // Build FLAGGED AI picks info
  var aiPicksInfo = "";
  if (savedPicks && savedPicks.aiPicks && flaggedAI.length > 0) {
    aiPicksInfo = "=== FLAGGED AI BEST BETS (from " + picksDate + ") ===\n";
    for (var i = 0; i < flaggedAI.length; i++) {
      var idx = flaggedAI[i];
      if (idx < savedPicks.aiPicks.length) {
        aiPicksInfo += (i + 1) + ". " + savedPicks.aiPicks[idx].pick + "\n";
      }
    }
    aiPicksInfo += "\n";
  }

  // Build FLAGGED Lock & Parlay info
  var lockParlayInfo = "";
  if (flaggedLock && savedPicks && savedPicks.lock) {
    lockParlayInfo += "=== FLAGGED LOCK OF THE DAY (from " + picksDate + ") ===\n";
    lockParlayInfo += "LOCK: " + savedPicks.lock + "\n\n";
  }
  if (savedPicks && savedPicks.parlayLegs && flaggedParlay.length > 0) {
    lockParlayInfo += "=== FLAGGED PARLAY LEGS (from " + picksDate + ") ===\n";
    for (var i = 0; i < flaggedParlay.length; i++) {
      var idx = flaggedParlay[i];
      if (idx < savedPicks.parlayLegs.length) {
        lockParlayInfo += "Leg " + (i + 1) + ": " + savedPicks.parlayLegs[idx] + "\n";
      }
    }
    lockParlayInfo += "\n";
  }

  if (!hasFlagged) {
    await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "The Juice Report", content: "⚠️ **No picks flagged for today.** Go to the flag page and select which picks you used before running results.\nhttps://evfindermurray.netlify.app/.netlify/functions/flag-picks?date=" + picksDate })
    });
    return { statusCode: 200, body: "No flagged picks. Flag them first." };
  }

  var prompt = "You are the official record keeper for The Juice Report sports betting Discord. Today is " + today + " (Eastern Time).\n\n";
  prompt += gamesInfo;
  prompt += evPicksInfo;
  prompt += aiPicksInfo;
  prompt += lockParlayInfo;
  prompt += "\nCRITICAL GRADING RULES:\n";
  prompt += "1. Scores and winners above are from the official API. Do NOT change them. Higher score = winner.\n";
  prompt += "2. ONLY grade the FLAGGED picks listed above. These are the picks we actually used.\n";
  prompt += "3. ML picks: WIN if the team we picked won the game. LOSS if they lost.\n";
  prompt += "4. Spread picks: WIN if the team covered the spread. LOSS if they didn't.\n";
  prompt += "5. Total (Over/Under) picks: WIN if the combined score went over/under the line. LOSS if not.\n";
  prompt += "6. If you cannot determine the result (player props, games not played yet), mark as PENDING.\n";
  prompt += "7. For parlay legs, grade EACH LEG individually as WIN or LOSS.\n\n";
  prompt += "FORMAT YOUR REPORT EXACTLY LIKE THIS:\n\n";
  prompt += "Start with: DAILY RESULTS — [today's date]\n";
  prompt += "Then a line of dashes: ---\n\n";
  prompt += "SECTION 1: SCOREBOARD\nList completed games by sport: [Away] [score] @ [Home] [score] — W: [winner]\nOnly include games relevant to our flagged picks.\n\n";
  if (evPicksInfo) {
    prompt += "SECTION 2: +EV PLAYS GRADING\nGrade each flagged EV pick. Show: [pick] — [result emoji ✅/❌/⏳]\nEnd with: Today: X-Y | (win rate %)\n\n";
  }
  if (aiPicksInfo) {
    prompt += "SECTION 3: AI BEST BETS GRADING\nGrade each flagged AI pick. Show: [pick] — [result emoji ✅/❌/⏳]\nEnd with: Today: X-Y | (win rate %)\n\n";
  }
  if (lockParlayInfo) {
    prompt += "SECTION 4: LOCK & PARLAY GRADING\n";
    if (flaggedLock) prompt += "Grade the lock: [lock pick] — [✅/❌]\n";
    if (flaggedParlay.length) prompt += "Grade EACH parlay leg individually: [leg] — [✅/❌]\n";
    prompt += "End with totals for each.\n\n";
  }
  prompt += "SECTION 5: OVERALL DASHBOARD\nShow all flagged records in a clean summary:\n";
  if (evPicksInfo) prompt += "+EV Plays: X-Y (win %)\n";
  if (aiPicksInfo) prompt += "AI Picks: X-Y (win %)\n";
  if (flaggedLock) prompt += "Lock: X-Y (win %)\n";
  if (flaggedParlay.length) prompt += "Parlay Legs: X-Y (win %)\n";
  prompt += "\n";
  prompt += "SECTION 6: KEY TAKEAWAYS\n2-4 sharp one-line observations about today's results.\n\n";
  prompt += "End with: The math doesn't lie. Trust the process.\n\n";
  prompt += "Use ** for bold. Use --- for dividers. Use ✅ for wins and ❌ for losses. Keep it concise for Discord.";

  try {
    var aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2500, messages: [{ role: "user", content: prompt }] })
    });
    if (!aiRes.ok) {
      var err = await aiRes.text();
      return { statusCode: 200, body: "AI error: " + aiRes.status + " " + err.substring(0, 200) };
    }
    var aiData = await aiRes.json();
    var aiText = "";
    for (var i = 0; i < aiData.content.length; i++) {
      if (aiData.content[i].type === "text") aiText += aiData.content[i].text;
    }
    if (!aiText) return { statusCode: 200, body: "AI returned empty" };

    var chunks = [];
    while (aiText.length > 0) {
      if (aiText.length <= 1900) { chunks.push(aiText); break; }
      var cut = aiText.lastIndexOf("\n", 1900);
      if (cut === -1) cut = 1900;
      chunks.push(aiText.substring(0, cut));
      aiText = aiText.substring(cut);
    }

    await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "The Juice Report", content: "# 📋 Daily Results & Track Record" })
    });
    await new Promise(function(r) { setTimeout(r, 500); });

    for (var c = 0; c < chunks.length; c++) {
      await fetch(DISCORD_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "The Juice Report",
          embeds: [{
            description: chunks[c],
            color: 0xFF9800,
            footer: c === chunks.length - 1 ? { text: "🍊 The Juice Report — Squeeze the Edge | " + today } : undefined
          }]
        })
      });
      if (c < chunks.length - 1) await new Promise(function(r) { setTimeout(r, 500); });
    }

    return { statusCode: 200, body: "Results posted. Flagged: EV:" + flaggedEV.length + " AI:" + flaggedAI.length + " Lock:" + (flaggedLock ? 1 : 0) + " Parlay:" + flaggedParlay.length };
  } catch (e) {
    return { statusCode: 200, body: "Error: " + e.message };
  }
}
