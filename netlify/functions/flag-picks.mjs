var SITE_URL = "https://evfindermurray.netlify.app";

export async function handler(event) {
  var headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: headers, body: "" };

  var params = event.queryStringParameters || {};
  var date = params.date || new Date().toISOString().slice(0, 10);

  // GET — return today's picks with flag status
  if (event.httpMethod === "GET") {
    try {
      var res = await fetch(SITE_URL + "/.netlify/functions/picks-db?date=" + date);
      if (!res.ok) return { statusCode: 200, headers: headers, body: JSON.stringify({ error: "No picks for " + date }) };
      var text = await res.text();
      if (!text || text.indexOf("{") !== 0) return { statusCode: 200, headers: headers, body: JSON.stringify({ error: "No picks for " + date }) };
      var picks = JSON.parse(text);
      return { statusCode: 200, headers: headers, body: JSON.stringify(picks) };
    } catch (e) {
      return { statusCode: 200, headers: headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  // POST — toggle flag on a pick
  if (event.httpMethod === "POST") {
    try {
      var body = JSON.parse(event.body);
      var action = body.action;
      var category = body.category;
      var index = body.index;

      // Load current picks
      var res = await fetch(SITE_URL + "/.netlify/functions/picks-db?date=" + date);
      if (!res.ok) return { statusCode: 200, headers: headers, body: JSON.stringify({ error: "No picks for " + date }) };
      var text = await res.text();
      if (!text || text.indexOf("{") !== 0) return { statusCode: 200, headers: headers, body: JSON.stringify({ error: "No picks for " + date }) };
      var picks = JSON.parse(text);

      // Initialize flagged arrays if they don't exist
      if (!picks.flaggedEV) picks.flaggedEV = [];
      if (!picks.flaggedAI) picks.flaggedAI = [];
      if (!picks.flaggedLock) picks.flaggedLock = false;
      if (!picks.flaggedParlay) picks.flaggedParlay = [];

      if (category === "ev") {
        if (action === "flag" && picks.flaggedEV.indexOf(index) === -1) picks.flaggedEV.push(index);
        if (action === "unflag") picks.flaggedEV = picks.flaggedEV.filter(function(i) { return i !== index; });
      } else if (category === "ai") {
        if (action === "flag" && picks.flaggedAI.indexOf(index) === -1) picks.flaggedAI.push(index);
        if (action === "unflag") picks.flaggedAI = picks.flaggedAI.filter(function(i) { return i !== index; });
      } else if (category === "lock") {
        picks.flaggedLock = action === "flag";
      } else if (category === "parlay") {
        if (action === "flag" && picks.flaggedParlay.indexOf(index) === -1) picks.flaggedParlay.push(index);
        if (action === "unflag") picks.flaggedParlay = picks.flaggedParlay.filter(function(i) { return i !== index; });
      }

      // Save back via picks-db
      await fetch(SITE_URL + "/.netlify/functions/picks-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(picks)
      });

      return { statusCode: 200, headers: headers, body: JSON.stringify({ success: true, flaggedEV: picks.flaggedEV, flaggedAI: picks.flaggedAI, flaggedLock: picks.flaggedLock, flaggedParlay: picks.flaggedParlay }) };
    } catch (e) {
      return { statusCode: 200, headers: headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 200, headers: headers, body: JSON.stringify({ error: "Use GET or POST" }) };
}
