export async function handler(event) {
  var params = event.queryStringParameters || {};
  var input = params.price || params.p || params.odds || params.o || "";
  var mode = params.mode || "auto";

  if (!input) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: [
        "THE JUICE REPORT - ODDS CONVERTER",
        "",
        "Usage:",
        "  ?price=65        Polymarket cents to American",
        "  ?price=0.65      Polymarket decimal to American",
        "  ?odds=-185       American to Polymarket",
        "  ?odds=2.50&mode=decimal  Decimal to everything",
        "",
        "Examples:",
        "  /convert?price=65    -> -186 American, 1.54 decimal, 65% implied",
        "  /convert?odds=-150   -> 60c Polymarket, 1.67 decimal, 60% implied",
        "  /convert?price=25    -> +300 American, 4.00 decimal, 25% implied",
      ].join("\n")
    };
  }

  var val = parseFloat(input);
  if (isNaN(val)) {
    return { statusCode: 200, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "Invalid input: " + input };
  }

  var polyPrice, americanOdds, decimalOdds, impliedProb;

  if (mode === "decimal") {
    if (val <= 1) return { statusCode: 200, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "Decimal odds must be greater than 1.00" };
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
    if (val > 1 && val <= 100) val = val / 100;
    if (val <= 0 || val >= 1) {
      return { statusCode: 200, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: "Polymarket price must be between 1-99 (cents) or 0.01-0.99" };
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

  var body = [
    "THE JUICE REPORT -- ODDS CONVERTER",
    "==============================",
    "",
    side + " (" + (impliedProb * 100).toFixed(1) + "% implied probability)",
    "",
    "Polymarket:  " + (polyPrice * 100).toFixed(0) + "c  ($" + polyPrice.toFixed(2) + " per share)",
    "American:    " + fmtAmerican,
    "Decimal:     " + decimalOdds.toFixed(2),
    "Implied:     " + (impliedProb * 100).toFixed(1) + "%",
    "",
    "$100 bet pays:   $" + payout100,
    "Profit on $100:  $" + profit100,
    "",
    "==============================",
  ];

  var otherPrice = 1 - polyPrice;
  var otherAmerican;
  if (otherPrice >= 0.5) {
    otherAmerican = Math.round((-otherPrice / (1 - otherPrice)) * 100);
  } else {
    otherAmerican = Math.round(((1 - otherPrice) / otherPrice) * 100);
  }
  var fmtOther = otherAmerican > 0 ? "+" + otherAmerican : "" + otherAmerican;
  body.push("Other side: " + (otherPrice * 100).toFixed(0) + "c poly = " + fmtOther + " American");
  body.push("");
  body.push("The Juice Report -- Squeeze the Edge");

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: body.join("\n")
  };
}
