export async function handler(event) {
  var key = (process.env.ODDS_API_KEY || "").trim();
  return { statusCode: 200, body: "Key: " + key.substring(0,6) + " | Length: " + key.length };
}
