import { getStore } from "@netlify/blobs";

export async function handler(event) {
  var siteID = (process.env.NETLIFY_SITE_ID || "").trim();
  var token = (process.env.NETLIFY_TOKEN || "").trim();

  var store;
  if (siteID && token) {
    store = getStore({ name: "picks", siteID: siteID, token: token });
  } else {
    return { statusCode: 500, body: "Missing NETLIFY_SITE_ID or NETLIFY_TOKEN env vars" };
  }

  var method = event.httpMethod;

  if (method === "POST") {
    try {
      var data = JSON.parse(event.body);
      var dateKey = data.date || new Date().toISOString().slice(0, 10);
      await store.setJSON("picks-" + dateKey, data);

      var history = {};
      try { history = await store.get("history", { type: "json" }) || {}; } catch(e) { history = {}; }
      history[dateKey] = { bets: data.betCount || 0, sports: data.sportsCount || 0, timestamp: new Date().toISOString() };
      await store.setJSON("history", history);

      return { statusCode: 200, body: "Saved picks for " + dateKey };
    } catch (e) {
      return { statusCode: 500, body: "Save error: " + e.message };
    }
  }

  if (method === "GET") {
    var params = event.queryStringParameters || {};
    var dateKey = params.date || "";

    if (dateKey === "history") {
      try {
        var history = await store.get("history", { type: "json" }) || {};
        return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(history) };
      } catch(e) {
        return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: "{}" };
      }
    }

    if (!dateKey) {
      var yesterday = new Date(Date.now() - 86400000);
      dateKey = yesterday.toISOString().slice(0, 10);
    }

    try {
      var data = await store.get("picks-" + dateKey, { type: "json" });
      if (!data) return { statusCode: 200, body: "No picks found for " + dateKey };
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
    } catch (e) {
      return { statusCode: 200, body: "No picks found for " + dateKey };
    }
  }

  return { statusCode: 200, body: "Use GET to load or POST to save" };
}
