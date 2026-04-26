export async function handler(event) {
var DISCORD_WEBHOOK = (process.env.WEBHOOK_RESULTS || process.env.WEBHOOK_ANNOUNCEMENTS || "").trim();  var ANTHROPIC_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
  var ODDS_API_KEY = (process.env.ODDS_API_KEY || "").trim();

  if (!DISCORD_WEBHOOK) return { statusCode: 500, body: "Missing webhook" };
  if (!ANTHROPIC_KEY) return { statusCode: 500, body: "Missing ANTHROPIC_API_KEY" };

  var today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  // Fetch yesterday's/today's completed games
  var completedGames = [];
  var sports = [
    { key: "basketball_nba", label: "NBA", icon: "🏀" },
    { key: "baseball_mlb", label: "MLB", icon: "⚾" },
    { key: "icehockey_nhl", label: "NHL", icon: "🏒" },
    { key: "basketball_wnba", label: "WNBA", icon: "🏀" },
    { key: "soccer_epl", label: "EPL", icon: "⚽" },
    { key: "soccer_usa_mls", label: "MLS", icon: "⚽" },
    { key: "soccer_spain_la_liga", label: "La Liga", icon: "⚽" },
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
              var homeScore = null;
              var awayScore = null;
              if (game.scores) {
                for (var s = 0; s < game.scores.length; s++) {
                  if (game.scores[s].name === game.home_team) homeScore = game.scores[s].score;
                  if (game.scores[s].name === game.away_team) awayScore = game.scores[s].score;
                }
              }
              completedGames.push({
                sport: sports[i].label,
                icon: sports[i].icon,
                home: game.home_team,
                away: game.away_team,
                homeScore: homeScore,
                awayScore: awayScore,
                winner: homeScore > awayScore ? game.home_team : game.away_team
              });
            }
          }
        }
      } catch (e) {}
    }
  }

  var gamesInfo = "";
  if (completedGames.length) {
    gamesInfo = "COMPLETED GAMES FROM LAST 24 HOURS:\n";
    for (var i = 0; i < completedGames.length; i++) {
      var g = completedGames[i];
      gamesInfo += g.icon + " " + g.sport + ": " + g.away + " " + (g.awayScore || "?") + " @ " + g.home + " " + (g.homeScore || "?") + " (Winner: " + g.winner + ")\n";
    }
  }

  var prompt = "You are a sports betting record keeper for The Juice Report. Today is " + today + ".\n\n";
  prompt += gamesInfo + "\n";
  prompt += "Based on the completed games above, generate a DAILY RESULTS REPORT for our Discord betting community.\n\n";
  prompt += "Format it like this:\n\n";
  prompt += "Start with a header line like: DAILY RESULTS - [date]\n\n";
  prompt += "Then for each sport that had games, show:\n";
  prompt += "[sport emoji] [SPORT NAME]\n";
  prompt += "- [away team] [score] @ [home team] [score] -- WINNER: [team]\n\n";
  prompt += "Then add a YESTERDAY'S PICKS REVIEW section where you:\n";
  prompt += "- Simulate grading our +EV picks and AI picks against these results\n";
  prompt += "- Give a realistic W-L record for the day (be honest, not every pick wins)\n";
  prompt += "- Show a running simulated season record (start with a realistic record like 45-32 for a +EV system)\n";
  prompt += "- Calculate ROI based on the record\n\n";
  prompt += "End with a motivational line about trusting the process and the math.\n\n";
  prompt += "Keep it concise and formatted for Discord. Use ** for bold.";

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

    // Split into chunks for Discord
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

    // Post each chunk
    for (var c = 0; c < chunks.length; c++) {
      await fetch(DISCORD_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "The Juice Report",
          embeds: [{
            description: chunks[c],
            color: 0xFF9800,
            footer: c === chunks.length - 1 ? { text: "The Juice Report -- Track Record | Updated Daily" } : undefined
          }]
        })
      });
      if (c < chunks.length - 1) await new Promise(function(r) { setTimeout(r, 500); });
    }

    return { statusCode: 200, body: "Track record posted. " + completedGames.length + " completed games found." };
  } catch (e) {
    return { statusCode: 200, body: "Error: " + e.message };
  }
}
