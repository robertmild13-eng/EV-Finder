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

  // Load yesterday's saved picks
  var savedPicks = null;
  try {
    var pickRes = await fetch("https://evfindermurray.netlify.app/.netlify/functions/picks-db?date=" + yesterdayKey);
    if (pickRes.ok) {
      var pickText = await pickRes.text();
      if (pickText && pickText.indexOf("{") === 0) {
        savedPicks = JSON.parse(pickText);
      }
    }
  } catch(e) {}

  // Also try today's picks if yesterday has none
  if (!savedPicks || !savedPicks.bets) {
    try {
      var pickRes2 = await fetch("https://evfindermurray.netlify.app/.netlify/functions/picks-db?date=" + todayKey);
      if (pickRes2.ok) {
        var pickText2 = await pickRes2.text();
        if (pickText2 && pickText2.indexOf("{") === 0) {
          savedPicks = JSON.parse(pickText2);
        }
      }
    } catch(e) {}
  }

  // Load history
  var history = {};
  try {
    var histRes = await fetch("https://evfindermurray.netlify.app/.netlify/functions/picks-db?date=history");
    if (histRes.ok) {
      var histText = await histRes.text();
      if (histText && histText.indexOf("{") === 0) {
        history = JSON.parse(histText);
      }
    }
  } catch(e) {}

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
              var homeScore = 0;
              var awayScore = 0;
              if (game.scores) {
                for (var s = 0; s < game.scores.length; s++) {
                  if (game.scores[s].name === game.home_team) homeScore = parseInt(game.scores[s].score) || 0;
                  if (game.scores[s].name === game.away_team) awayScore = parseInt(game.scores[s].score) || 0;
                }
              }
              var winner = homeScore > awayScore ? game.home_team : (awayScore > homeScore ? game.away_team : "DRAW");
              completedGames.push({ sport: sports[i].label, home: game.home_team, away: game.away_team, homeScore: homeScore, awayScore: awayScore, winner: winner });
            }
          }
        }
      } catch (e) {}
    }
  }

  // Build game results text
  var gamesInfo = "";
  if (completedGames.length) {
    var bySport = {};
    for (var i = 0; i < completedGames.length; i++) {
      var g = completedGames[i];
      if (!bySport[g.sport]) bySport[g.sport] = [];
      bySport[g.sport].push(g);
    }
    gamesInfo = "COMPLETED GAMES (scores are CORRECT from the API -- do NOT change winners):\n\n";
    var sportKeys = Object.keys(bySport);
    for (var i = 0; i < sportKeys.length; i++) {
      gamesInfo += sportKeys[i] + ":\n";
      for (var j = 0; j < bySport[sportKeys[i]].length; j++) {
        var g = bySport[sportKeys[i]][j];
        gamesInfo += "  " + g.away + " " + g.awayScore + " @ " + g.home + " " + g.homeScore + " -- Winner: " + g.winner + "\n";
      }
      gamesInfo += "\n";
    }
  }

  // Build saved picks text
  var picksInfo = "";
  if (savedPicks && savedPicks.bets && savedPicks.bets.length) {
    picksInfo = "OUR ACTUAL PICKS FROM THIS SCAN (these are the REAL picks we posted):\n\n";
    for (var i = 0; i < savedPicks.bets.length; i++) {
      var b = savedPicks.bets[i];
      var fmtOdds = b.bookOdds > 0 ? "+" + b.bookOdds : "" + b.bookOdds;
      picksInfo += (i + 1) + ". " + b.sport + " | " + b.pick + " | " + b.game + " | " + b.bookName + " " + fmtOdds + " | EV: " + (b.ev * 100).toFixed(2) + "% | Type: " + b.marketLabel + "\n";
    }
    picksInfo += "\n";
  } else {
    picksInfo = "NO SAVED PICKS FOUND for yesterday. This is the first run or picks were not saved.\n\n";
  }

  var historyInfo = "SCAN HISTORY:\n";
  var histKeys = Object.keys(history).sort();
  var totalDays = histKeys.length;
  historyInfo += "Total days tracked: " + totalDays + "\n";
  if (histKeys.length > 5) histKeys = histKeys.slice(-5);
  for (var i = 0; i < histKeys.length; i++) {
    historyInfo += "  " + histKeys[i] + ": " + history[histKeys[i]].bets + " bets across " + history[histKeys[i]].sports + " sports\n";
  }
  historyInfo += "\n";

  var prompt = "You are the official record keeper for The Juice Report sports betting Discord. Today is " + today + " (Eastern Time). Use this EXACT date.\n\n";
  prompt += gamesInfo;
  prompt += picksInfo;
  prompt += historyInfo;
  prompt += "CRITICAL RULES:\n";
  prompt += "1. Scores and winners above are from the official API. Do NOT change them. The team with MORE points/goals wins.\n";
  prompt += "2. If we have saved picks, grade EACH ONE against the results. A moneyline pick WINS if the team we picked won. A spread pick needs the team to cover.\n";
  prompt += "3. For totals (over/under), you may not have enough info to grade -- mark as PUSH or PENDING.\n";
  prompt += "4. For player props, mark as PENDING since we don't have player stats.\n";
  prompt += "5. If no saved picks exist, just show the scoreboard and key takeaways.\n\n";
  prompt += "FORMAT YOUR REPORT:\n\n";
  prompt += "SECTION 1: SCOREBOARD\nList games by sport: [Away] [score] @ [Home] [score] -- W: [winner]\n\n";
  prompt += "SECTION 2: PICK GRADING (only if we have saved picks)\nGo through each pick and grade it: WIN / LOSS / PUSH / PENDING\nShow the pick, what happened, and the result.\nEnd with today's record: X-Y (W-L)\n\n";
  prompt += "SECTION 3: RUNNING RECORD\nShow how many days we've tracked, today's record, and a note that the running record will build over time as we track more days.\n\n";
  prompt += "SECTION 4: KEY TAKEAWAYS\n3-5 sharp one-line observations about the results (upsets, blowouts, trends).\n\n";
  prompt += "End with: The math doesn't lie. Trust the process.\n\n";
  prompt += "Use ** for bold. Use --- for dividers. Keep it concise for Discord.";

  try {
    var aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: prompt }] })
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
      body: JSON.stringify({ username: "The Juice Report", content: "# Daily Results & Track Record" })
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
            footer: c === chunks.length - 1 ? { text: "The Juice Report -- Track Record | " + today } : undefined
          }]
        })
      });
      if (c < chunks.length - 1) await new Promise(function(r) { setTimeout(r, 500); });
    }

    var picksGraded = savedPicks && savedPicks.bets ? savedPicks.bets.length : 0;
    return { statusCode: 200, body: "Results posted. " + completedGames.length + " games, " + picksGraded + " picks graded." };
  } catch (e) {
    return { statusCode: 200, body: "Error: " + e.message };
  }
}
