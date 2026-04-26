export async function handler(event) {
  var key = (process.env.ODDS_API_KEY || "").trim();
  var res = await fetch("https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/?apiKey=" + key + "&regions=us,eu&markets=h2h&bookmakers=pinnacle,draftkings");
  var status = res.status;
  var body = await res.text();
  return { statusCode: 200, body: "Status: " + status + " | Response: " + body.substring(0, 300) };
}
