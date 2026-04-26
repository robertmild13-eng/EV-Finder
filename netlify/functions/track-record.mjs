export async function handler(event) {
  var DISCORD_WEBHOOK = (process.env.WEBHOOK_RESULTS || process.env.WEBHOOK_ANNOUNCEMENTS || "").trim();
  var ANTHROPIC_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
  var ODDS_API_KEY = (process.env.ODDS_API_KEY || "").trim();

  if (!DISCORD_WEBHOOK) return { statusCode: 500, body: "Missing webhook" };
  if (!ANTHROPIC_KEY) return { statusCode: 500, body: "Missing ANTHROPIC_API_KEY" };

  var now = new Date();
  var today = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/New_York" });

  var completedGames = [];
  var sports = [
    { key: "basketball_nba", label: "NBA", icon: "NBA" },
    { key: "baseball_mlb", label: "MLB", icon: "MLB" },
    { key: "icehockey_nhl", label: "NHL", icon: "NHL" },
    { key: "basketball_wnba", label: "WNBA", icon: "WNBA" },
    { key: "soccer_epl", label: "EPL", icon: "EPL" },
    { key: "soccer_usa_mls", label: "MLS", icon: "MLS" },
    { key: "soccer_spain_la_liga", label: "La Liga", icon: "La Liga" },
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
              var winner = homeScore > awayScore ? game.home_team : (awayScore > homeScore ? game.away_team : "TIE");
              completedGames.push({
                sport: sports[i].label,
                home: game.home_team,
                away: game.away_team,
                homeScore: homeScore,
                awayScore: awayScore,
                winner: winner
              });
            }
          }
        }
      } catch (e) {}
    }
  }

  var gamesInfo = "";
  if (completedGames.length) {
    var bySport = {};
    for (var i = 0; i < completedGames.length; i++) {
      var g = completedGames[i];
      if (!bySport[g.sport]) bySport[g.sport] = [];
      bySport[g.sport].push(g);
    }
    gamesInfo = "COMPLETED GAMES (last 24 hours) with CORRECT scores and winners:\n\n";
    var sportKeys = Object.keys(bySport);
    for (var i = 0; i < sportKeys.length; i++) {
      var sport = sportKeys[i];
      gamesInfo += sport + ":\n";
      for (var j = 0; j < bySport[sport].length; j++) {
        var g = bySport[sport][j];
        gamesInfo += "  " + g.away + " " + g.awayScore + " @ " + g.home + " " + g.homeScore + " -- Winner: " + g.winner + "\n";
      }
      gamesInfo += "\n";
    }
  }

  var prompt = "You are the record keeper for The Juice Report, a sports betting Discord. Today's date in Eastern Time is " + today + ".\n\n";
  prompt += "IMPORTANT: Use TODAY'S ACTUAL DATE (" + today + ") in your report. Do NOT use a different date.\n\n";
  prompt += gamesInfo + "\n";
  prompt += "IMPORTANT RULES:\n";
  prompt += "1. The scores and winners above are CORRECT from the API. Do NOT change any winners. The team with the HIGHER score wins.\n";
  prompt += "2. You do NOT know what picks we actually made yesterday. So do NOT make up fake pick results.\n";
  prompt += "3. Instead, generate the report in this format:\n\n";
  prompt += "SECTION 1: SCOREBOARD\n";
  prompt += "List all completed games organized by sport. Show: [Away] [score] @ [Home] [score] -- W: [winner]\n";
  prompt += "Use the EXACT scores and winners from the data above. Do not modify them.\n\n";
  prompt += "SECTION 2: KEY TAKEAWAYS\n";
  prompt += "Pick 3-5 interesting results and give a one-line sharp take on each (upsets, blowouts, trends).\n\n";
  prompt += "SECTION 3: MARKET MOVERS\n";
  prompt += "Note which results would have impacted betting markets -- big upsets that sportsbooks got wrong, games that went over/under by a lot, etc.\n\n";
  prompt += "End with: Track your own bets against our daily picks to build your personal record. Trust the math.\n\n";
  prompt += "Keep it concise. Use ** for bold in Discord formatting. Use --- for dividers.";

  try {
    var aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1500, messages: [{ role: "user", content: prompt }] })
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
            footer: c === chunks.length - 1 ? { text: "The Juice Report -- Results | " + today } : undefined
          }]
        })
      });
      if (c < chunks.length - 1) await new Promise(function(r) { setTimeout(r, 500); });
    }

    return { statusCode: 200, body: "Results posted. " + completedGames.length + " games. Date: " + today };
  } catch (e) {
    return { statusCode: 200, body: "Error: " + e.message };
  }
}
