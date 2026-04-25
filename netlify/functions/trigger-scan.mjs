export async function handler(event) {
  var key = (process.env.ODDS_API_KEY || "").trim();
  var url = "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/?apiKey=" + key + "&regions=us,eu&markets=h2h&bookmakers=pinnacle,draftkings";
  try {
    var res = await fetch(url);
    var status = res.status;
    var body = await res.text();
    return { statusCode: 200, body: "Status: " + status + " | Key length: " + key.length + " | Key starts: " + key.substring(0,6) + " | Response start: " + body.substring(0,200) };
  } catch (e) {
    return { statusCode: 200, body: "Fetch error: " + e.message + " | Key: " + key.substring(0,6) };
  }
}
