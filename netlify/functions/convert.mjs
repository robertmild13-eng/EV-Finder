export async function handler(event) {
  var params = event.queryStringParameters || {};
  var input = params.price || params.p || params.odds || params.o || "";
  var mode = params.mode || "auto";

  if (!input) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain" },
      body: [
        "🍊 The Juice Report — Odds Converter",
        "",
        "Usage:",
        "  ?price=65        Polymarket cents to American",
        "  ?price=0.65      Polymarket decimal to American",
        "  ?odds=-185       American to Polymarket",
        "  ?odds=2.50&mode=decimal  Decimal to everything",
        "",
        "Examples:",
        "  /convert?price=65    → -186 American, 1.54 decimal, 65% implied",
        "  /convert?odds=-150   → 60¢ Polymarket, 1.67 decimal, 60% implied",
        "  /convert?price=25    → +300 American, 4.00 decimal, 25% implied",
        "",
        "Base URL: https://evfindermurray.netlify.app/.netlify/functions/convert"
      ].join("\n")
    };
  }

  var val = parseFloat(input);
  if (isNaN(val)) {
    return { statusCode: 200, headers: { "Content-Type": "text/plain" }, body: "❌ Invalid input: " + input };
  }

  var polyPrice, americanOdds, decimalOdds, impliedProb;

  if (mode === "decimal") {
    if (val <= 1) return { statusCode: 200, headers: { "Content-Type": "text/plain" }, body: "❌ Decimal odds must be greater than 1.00" };
    decimalOdds = val;
    impliedProb = 1 / val;
    polyPrice = impliedProb;
    if (impliedProb >= 0.5) {
      americanOdds = Math.round((-impliedProb / (1 - impliedProb)) * 100);
    } else {
      americanOdds = Math.round(((1 - impliedProb) / impliedProb) * 100);
    }
  } else if (mode === "american" || (mode === "auto" && (val < -100 || val > 100))) {
    if (val > -100 && val < 100 && val !== 0) {
      // Probably polymarket, not american
      if (val > 0 && val < 1) {
        polyPrice = val;
        impliedProb = val;
        decimalOdds = 1 / val;
        if (impliedProb >= 0.5) {
          americanOdds = Math.round((-impliedProb / (1 - impliedProb)) * 100);
        } else {
          americanOdds = Math.round(((1 - impliedProb) / impliedProb) * 100);
        }
      } else if (val >= 1 && val <= 99) {
        polyPrice = val / 100;
        impliedProb = polyPrice;
        decimalOdds = 1 / polyPrice;
        if (impliedProb >= 0.5) {
          americanOdds = Math.round((-impliedProb / (1 - impliedProb)) * 100);
        } else {
          americanOdds = Math.round(((1 - impliedProb) / impliedProb) * 100);
        }
      }
    } else {
      americanOdds = Math.round(val);
      if (val > 0) {
        impliedProb = 100 / (val + 100);
        decimalOdds = val / 100 + 1;
      } else {
        impliedProb = Math.abs(val) / (Math.abs(val) + 100);
        decimalOdds = 100 / Math.abs(val) + 1;
      }
      polyPrice = impliedProb;
    }
  } else {
    // Polymarket mode
    if (val > 1 && val <= 100) val = val / 100;
    if (val <= 0 || val >= 1) {
      return { statusCode: 200, headers: { "Content-Type": "text/plain" }, body: "❌ Polymarket price must be between 1-99 (cents) or 0.01-0.99" };
    }
    polyPrice = val;
    impliedProb = val;
    decimalOdds = 1 / val;
    if (impliedProb >= 0.5) {
      americanOdds = Math.round((-impliedProb / (1 - impliedProb)) * 100);
    } else {
      americanOdds = Math.round(((1 - impliedProb) / impliedProb) * 100);
    }
  }

  var fmtAmerican = americanOdds > 0 ? "+" + americanOdds : "" + americanOdds;
  var payout100 = (100 / polyPrice).toFixed(2);
  var profit100 = (100 / polyPrice - 100).toFixed(2);
  var side = impliedProb >= 0.5 ? "FAVORITE" : "UNDERDOG";
  var emoji = impliedProb >= 0.7 ? "🔒" : impliedProb >= 0.5 ? "📊" : impliedProb >= 0.3 ? "🎯" : "🎲";

  var body = [
    "🍊 THE JUICE REPORT — ODDS CONVERTER",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    emoji + " " + side + " (" + (impliedProb * 100).toFixed(1) + "% implied probability)",
    "",
    "📊 Polymarket:  " + (polyPrice * 100).toFixed(0) + "¢  ($" + polyPrice.toFixed(2) + " per share)",
    "🇺🇸 American:    " + fmtAmerican,
    "🔢 Decimal:     " + decimalOdds.toFixed(2),
    "📈 Implied:     " + (impliedProb * 100).toFixed(1) + "%",
    "",
    "💰 $100 bet pays:   $" + payout100,
    "💵 Profit on $100:  $" + profit100,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  ];

  if (impliedProb >= 0.5) {
    var noPrice = 1 - polyPrice;
    var noAmerican;
    if (noPrice >= 0.5) {
      noAmerican = Math.round((-noPrice / (1 - noPrice)) * 100);
    } else {
      noAmerican = Math.round(((1 - noPrice) / noPrice) * 100);
    }
    var fmtNo = noAmerican > 0 ? "+" + noAmerican : "" + noAmerican;
    body.push("🔄 Other side: " + (noPrice * 100).toFixed(0) + "¢ poly = " + fmtNo + " American");
    body.push("");
  } else {
    var yesPrice = 1 - polyPrice;
    var yesAmerican;
    if (yesPrice >= 0.5) {
      yesAmerican = Math.round((-yesPrice / (1 - yesPrice)) * 100);
    } else {
      yesAmerican = Math.round(((1 - yesPrice) / yesPrice) * 100);
    }
    var fmtYes = yesAmerican > 0 ? "+" + yesAmerican : "" + yesAmerican;
    body.push("🔄 Other side: " + (yesPrice * 100).toFixed(0) + "¢ poly = " + fmtYes + " American");
    body.push("");
  }

  body.push("Squeeze the edge 🍊");

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/plain" },
    body: body.join("\n")
  };
}
