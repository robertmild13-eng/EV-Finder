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
    var pickRes = await fetch("https://evfindermurray.netlify.app/.netlify/functions/picks-db?date=" + todayKey);
    if (pickRes.ok) {
      var pickText = await pickRes.text();
      if (pickText && pickText.indexOf("{") === 0) { savedPicks = JSON.parse(pickText); }
    }
  } catch(e) {}
  if (!savedPicks || !savedPicks.bets) {
    picksDate = yesterdayKey;
    try {
      var pickRes2 = await fetch("https://evfindermurray.netlify.app/.netlify/functions/picks-db?date=" + yesterdayKey);
      if (pickRes2.ok) {
        var pickText2 = await pickRes2.text();
        if (pickText2 && pickText2.indexOf("{") === 0) { savedPicks = JSON.parse(pickText2); }
      }
    } catch(e) {}
  }

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

  // Build EV picks info
  var evPicksInfo = "";
  if (savedPicks && savedPicks.bets && savedPicks.bets.length) {
    evPicksInfo = "=== EV SCANNER PICKS (from " + picksDate + ") ===\n";
    for (var i = 0; i < savedPicks.bets.length; i++) {
      var b = savedPicks.bets[i];
      var fmtOdds = b.bookOdds > 0 ? "+" + b.bookOdds : "" + b.bookOdds;
      evPicksInfo += (i + 1) + ". " + b.sport + " | " + b.pick + " | " + b.game + " | " + b.bookName + " " + fmtOdds + " | Type: " + b.marketLabel + "\n";
    }
    evPicksInfo += "\n";
  }

  // Build AI picks info
  var aiPicksInfo = "";
  if (savedPicks && savedPicks.aiPicks && savedPicks.aiPicks.length) {
    aiPicksInfo = "=== AI BEST BETS (from " + picksDate + ") ===\n";
    for (var i = 0; i < savedPicks.aiPicks.length; i++) {
      aiPicksInfo += (i + 1) + ". " + savedPicks.aiPicks[i].pick + "\n";
    }
    aiPicksInfo += "\n";
  }

  // Build Lock & Parlay info
  var lockParlayInfo = "";
  if (savedPicks && (savedPicks.lock || (savedPicks.parlayLegs && savedPicks.parlayLegs.length))) {
    lockParlayInfo = "=== LOCK & PARLAY PICKS (from " + picksDate + ") ===\n";
    if (savedPicks.lock) { lockParlayInfo += "LOCK OF THE DAY: " + savedPicks.lock + "\n"; }
    if (savedPicks.parlayLegs && savedPicks.parlayLegs.length) {
      lockParlayInfo += "PARLAY LEGS:\n";
      for (var i = 0; i < savedPicks.parlayLegs.length; i++) {
        lockParlayInfo += "  Leg " + (i + 1) + ": " + savedPicks.parlayLegs[i] + "\n";
      }
    }
    lockParlayInfo += "\n";
  }

  var prompt = "You are the official record keeper for The Juice Report sports betting Discord. Today is " + today + " (Eastern Time). Use this EXACT date.\n\n";
  prompt += gamesInfo;
  prompt += evPicksInfo;
  prompt += aiPicksInfo;
  prompt += lockParlayInfo;
  prompt += "\nCRITICAL GRADING RULES:\n";
  prompt += "1. Scores and winners above are from the official API. Do NOT change them. Higher score = winner.\n";
  prompt += "2. Grade EACH pick in ALL THREE categories separately.\n";
  prompt += "3. ML picks: WIN if the team we picked won the game. LOSS if they lost.\n";
  prompt += "4. Spread picks: WIN if the team covered the spread. LOSS if they didn't.\n";
  prompt += "5. Total (Over/Under) picks: WIN if the combined score went over/under the line. LOSS if not.\n";
  prompt += "6. If you cannot determine the result (player props, games not played yet), mark as PENDING.\n";
  prompt += "7. For parlay legs, grade EACH LEG individually as WIN or LOSS — do NOT grade the parlay as a whole.\n";
  prompt += "8. If no saved picks exist for a category, skip that section.\n\n";
  prompt += "FORMAT YOUR REPORT EXACTLY LIKE THIS:\n\n";
  prompt += "Start with: DAILY RESULTS — [today's date]\n";
  prompt += "Then a line of dashes: ---\n\n";
  prompt += "SECTION 1: SCOREBOARD\nList completed games by sport: [Away] [score] @ [Home] [score] — W: [winner]\n\n";
  prompt += "SECTION 2: +EV PLAYS GRADING\nGrade each EV scanner pick. Show: [pick] — [result emoji WIN/LOSS/PENDING]\nEnd with: Today: X-Y | (win rate %)\n\n";
  prompt += "SECTION 3: AI BEST BETS GRADING\nGrade each AI pick. Show: [pick] — [result emoji WIN/LOSS/PENDING]\nEnd with: Today: X-Y | (win rate %)\n\n";
  prompt += "SECTION 4: LOCK & PARLAY GRADING\nGrade the lock: [lock pick] — [WIN/LOSS]\nGrade EACH parlay leg individually: [leg] — [WIN/LOSS]\nEnd with: Lock: X-Y | Parlay Legs: X-Y\n\n";
  prompt += "SECTION 5: OVERALL DASHBOARD\nShow all records in a clean summary:\n+EV Plays: X-Y (win %)\nAI Picks: X-Y (win %)\nLock: X-Y (win %)\nParlay Legs: X-Y (win %)\n\n";
  prompt += "SECTION 6: KEY TAKEAWAYS\n3-5 sharp one-line observations about today's results.\n\n";
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

    // Split into Discord-safe chunks
    var chunks = [];
    while (aiText.length > 0) {
      if (aiText.length <= 1900) { chunks.push(aiText); break; }
      var cut = aiText.lastIndexOf("\n", 1900);
      if (cut === -1) cut = 1900;
      chunks.push(aiText.substring(0, cut));
      aiText = aiText.substring(cut);
    }

    // Post header
    await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "The Juice Report", content: "# 📋 Daily Results & Track Record" })
    });
    await new Promise(function(r) { setTimeout(r, 500); });

    // Post each chunk as an embed
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

    var evCount = savedPicks && savedPicks.bets ? savedPicks.bets.length : 0;
    var aiCount = savedPicks && savedPicks.aiPicks ? savedPicks.aiPicks.length : 0;
    var lockCount = savedPicks && savedPicks.lock ? 1 : 0;
    var parlayCount = savedPicks && savedPicks.parlayLegs ? savedPicks.parlayLegs.length : 0;
    return { statusCode: 200, body: "Results posted. " + completedGames.length + " games. Graded — EV:" + evCount + " AI:" + aiCount + " Lock:" + lockCount + " Parlay legs:" + parlayCount };
  } catch (e) {
    return { statusCode: 200, body: "Error: " + e.message };
  }
}
