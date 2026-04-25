/**
 * Netlify Scheduled Function — +EV Daily Scanner → Discord
 * 
 * Runs daily at 9:00 AM ET, scans all major sports for +EV opportunities
 * by comparing soft book odds against Pinnacle's de-vigged line,
 * then sends a formatted embed to your Discord webhook.
 * 
 * Required env vars (set in Netlify Dashboard > Site > Environment Variables):
 *   ODDS_API_KEY    — from https://the-odds-api.com
 *   DISCORD_WEBHOOK — from Discord channel settings > Integrations > Webhooks
 * 
 * You can also trigger manually: POST /.netlify/functions/daily-scan
 */

import { schedule } from "@netlify/functions";

// ─── CONFIG ───
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const MIN_EV = 0.01;
const MAX_BETS = 20;

const SPORTS = [
  { key: "americanfootball_nfl", label: "NFL", icon: "🏈" },
  { key: "americanfootball_ncaaf", label: "NCAAF", icon: "🏈" },
  { key: "basketball_nba", label: "NBA", icon: "🏀" },
  { key: "basketball_ncaab", label: "NCAAB", icon: "🏀" },
  { key: "baseball_mlb", label: "MLB", icon: "⚾" },
  { key: "icehockey_nhl", label: "NHL", icon: "🏒" },
];

const SHARP_BOOKS = ["pinnacle"];
const SOFT_BOOKS = [
  "draftkings","fanduel","betmgm","williamhill_us","bovada",
  "bet365","betrivers","unibet_us","pointsbetus","superbook","wynnbet",
];
const BOOK_NAMES = {
  draftkings:"DraftKings",fanduel:"FanDuel",betmgm:"BetMGM",
  williamhill_us:"Caesars",bovada:"Bovada",bet365:"Bet365",
  betrivers:"BetRivers",unibet_us:"Unibet",pointsbetus:"PointsBet",
  superbook:"SuperBook",wynnbet:"WynnBET",
};

const GAME_MARKETS = ["h2h","spreads","totals"];
const PROP_MARKETS = [
  "player_pass_tds","player_pass_yds","player_rush_yds",
  "player_receptions","player_reception_yds",
  "player_points","player_rebounds","player_assists","player_threes",
  "player_hits","player_total_bases","player_home_runs",
  "player_pitcher_strikeouts","player_goals","player_shots_on_goal",
];
const PROP_LABELS = {
  player_pass_tds:"Pass TDs",player_pass_yds:"Pass Yds",
  player_rush_yds:"Rush Yds",player_receptions:"Receptions",
  player_reception_yds:"Rec Yds",player_points:"Points",
  player_rebounds:"Rebounds",player_assists:"Assists",
  player_threes:"3PT",player_hits:"Hits",
  player_total_bases:"Total Bases",player_home_runs:"HRs",
  player_pitcher_strikeouts:"K's",player_goals:"Goals",
  player_shots_on_goal:"SOG",
};

// ─── MATH ───
const toDecimal = (o) => (o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1);
const toImplied = (o) => (o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100));
const fmtOdds = (o) => (o > 0 ? `+${o}` : `${o}`);
const fmtPct = (p) => `${(p * 100).toFixed(1)}%`;
const fmtEV = (e) => `${e > 0 ? "+" : ""}${(e * 100).toFixed(2)}%`;

const devig = (outcomes) => {
  const total = outcomes.reduce((s, o) => s + toImplied(o.price), 0);
  return outcomes.map((o) => ({ ...o, trueProb: toImplied(o.price) / total }));
};

// ─── API ───
async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function getGameOdds(apiKey, sportKey) {
  const books = [...SHARP_BOOKS, ...SOFT_BOOKS].join(",");
  return apiFetch(
    `${ODDS_API_BASE}/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=us,us2&markets=${GAME_MARKETS.join(",")}&oddsFormat=american&bookmakers=${books}`
  );
}

async function getProps(apiKey, sportKey, eventId) {
  const books = [...SHARP_BOOKS, ...SOFT_BOOKS].join(",");
  return apiFetch(
    `${ODDS_API_BASE}/sports/${sportKey}/events/${eventId}/odds?apiKey=${apiKey}&regions=us,us2&markets=${PROP_MARKETS.join(",")}&oddsFormat=american&bookmakers=${books}`
  );
}

// ─── EV EXTRACTION ───
function extractEV(events, sportLabel, sportIcon, propsOnly = false) {
  const bets = [];
  for (const event of events) {
    const game = `${event.away_team} @ ${event.home_team}`;
    const bmMap = {};
    (event.bookmakers || []).forEach((bm) => { bmMap[bm.key] = bm; });
    const sharpKey = SHARP_BOOKS.find((k) => bmMap[k]);
    if (!sharpKey) continue;

    for (const sm of bmMap[sharpKey].markets || []) {
      const mk = sm.key;
      const isProp = mk.startsWith("player_");
      if (propsOnly && !isProp) continue;
      if (!propsOnly && isProp) continue;

      const dvSharp = devig(sm.outcomes);
      const tpMap = {};
      dvSharp.forEach((o) => {
        tpMap[`${o.name}|${o.point ?? ""}|${o.description ?? ""}`] = { tp: o.trueProb, sp: o.price };
      });

      for (const sk of SOFT_BOOKS) {
        if (!bmMap[sk]) continue;
        const sMarket = bmMap[sk].markets?.find((m) => m.key === mk);
        if (!sMarket) continue;

        for (const out of sMarket.outcomes) {
          const lk = `${out.name}|${out.point ?? ""}|${out.description ?? ""}`;
          const sharp = tpMap[lk];
          if (!sharp) continue;
          const ev = sharp.tp * toDecimal(out.price) - 1;
          if (ev <= MIN_EV) continue;

          let betType = mk === "spreads" ? "Spread" : mk === "totals" ? "Total" : isProp ? "Prop" : "ML";
          let pick = out.name;
          if (out.point != null) {
            if (mk === "spreads") pick = `${out.name} ${out.point > 0 ? "+" : ""}${out.point}`;
            else if (mk === "totals") pick = `${out.name} ${out.point}`;
            else if (isProp) pick = `${out.description || out.name} ${out.name} ${out.point}`;
          } else if (isProp && out.description) {
            pick = `${out.description} — ${out.name}`;
          }

          const mktLabel = isProp
            ? (PROP_LABELS[mk] || mk.replace("player_","").replace(/_/g," "))
            : betType;

          bets.push({
            sport: sportLabel, icon: sportIcon, type: betType,
            marketLabel: mktLabel, game,
            pick, bookName: BOOK_NAMES[sk] || sk,
            bookOdds: out.price, sharpOdds: sharp.sp,
            trueProb: sharp.tp, ev,
            edge: sharp.tp - toImplied(out.price),
          });
        }
      }
    }
  }
  return bets;
}

// ─── DISCORD FORMATTING ───
function buildDiscordEmbeds(bets) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const avgEV = bets.length ? bets.reduce((s, b) => s + b.ev, 0) / bets.length : 0;
  const topEV = bets[0]?.ev || 0;
  const top = bets.slice(0, MAX_BETS);

  // Summary embed
  const summaryEmbed = {
    title: "📈 +EV Best Bets",
    description: today,
    color: 0x00e676,
    fields: [
      { name: "Opportunities", value: `${bets.length}`, inline: true },
      { name: "Avg EV", value: fmtEV(avgEV), inline: true },
      { name: "Top EV", value: fmtEV(topEV), inline: true },
    ],
    footer: { text: "Sharp: Pinnacle (de-vigged) · Gamble responsibly" },
    timestamp: new Date().toISOString(),
  };

  // Group bets into chunks of 5 for readability
  const betEmbeds = [];
  for (let i = 0; i < top.length; i += 5) {
    const chunk = top.slice(i, i + 5);
    const fields = chunk.map((b, j) => {
      const rank = i + j + 1;
      const evEmoji = b.ev >= 0.05 ? "🔥" : b.ev >= 0.03 ? "⚡" : "✅";
      return {
        name: `${rank}. ${b.icon} ${b.sport} · ${b.marketLabel}`,
        value: [
          `**${b.pick}**`,
          `${b.game}`,
          `📍 **${b.bookName}**: \`${fmtOdds(b.bookOdds)}\` → Sharp: \`${fmtOdds(b.sharpOdds)}\``,
          `${evEmoji} EV: **${fmtEV(b.ev)}** · Edge: **${fmtPct(b.edge)}** · True%: ${fmtPct(b.trueProb)}`,
        ].join("\n"),
        inline: false,
      };
    });

    betEmbeds.push({
      color: 0x1a1a25,
      fields,
    });
  }

  return [summaryEmbed, ...betEmbeds];
}

// ─── SEND TO DISCORD ───
async function sendToDiscord(webhookUrl, bets) {
  const embeds = buildDiscordEmbeds(bets);

  // Discord limits 10 embeds per message, so we batch
  for (let i = 0; i < embeds.length; i += 10) {
    const batch = embeds.slice(i, i + 10);
    const payload = {
      username: "+EV Finder",
      avatar_url: "https://em-content.zobj.net/source/apple/391/chart-increasing_1f4c8.png",
      content: i === 0 ? "# 🎯 Today's +EV Plays" : undefined,
      embeds: batch,
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Discord webhook failed: ${res.status} ${body}`);
    }

    // Rate limit safety
    if (i + 10 < embeds.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

// ─── MAIN HANDLER ───
async function handler(event) {
  const ODDS_API_KEY = process.env.ODDS_API_KEY;
  const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;

  if (!ODDS_API_KEY) {
    return { statusCode: 500, body: "Missing ODDS_API_KEY env var" };
  }
  if (!DISCORD_WEBHOOK) {
    return { statusCode: 500, body: "Missing DISCORD_WEBHOOK env var" };
  }

  console.log("🔍 +EV Daily Scanner starting...");
  const allBets = [];

  for (const sport of SPORTS) {
    console.log(`  ${sport.icon} ${sport.label}: fetching...`);
    let events;
    try {
      events = await getGameOdds(ODDS_API_KEY, sport.key);
    } catch (e) {
      if (e.message.includes("422")) { console.log(`    Not in season`); continue; }
      console.log(`    Error: ${e.message}`); continue;
    }
    if (!events?.length) { console.log("    No events"); continue; }
    console.log(`    ${events.length} events found`);

    allBets.push(...extractEV(events, sport.label, sport.icon));

    // Props — limit to 4 events per sport
    const withSharp = events
      .filter((e) => e.bookmakers?.some((b) => SHARP_BOOKS.includes(b.key)))
      .slice(0, 4);

    for (const ev of withSharp) {
      try {
        const pd = await getProps(ODDS_API_KEY, sport.key, ev.id);
        if (pd?.bookmakers) {
          allBets.push(...extractEV(
            [{ ...ev, bookmakers: pd.bookmakers }],
            sport.label, sport.icon, true
          ));
        }
      } catch { /* skip */ }
    }
  }

  // Dedup + sort
  const seen = new Set();
  const bets = allBets
    .filter((b) => {
      const k = `${b.bookName}|${b.pick}|${b.game}|${b.marketLabel}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    })
    .sort((a, b) => b.ev - a.ev);

  console.log(`✅ Found ${bets.length} +EV opportunities`);

  if (!bets.length) {
    // Still notify Discord that scan ran
    await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "+EV Finder",
        content: "📭 **No +EV bets found today.** All lines are tight — Pinnacle and soft books are aligned. Check back tomorrow!",
      }),
    });
    return { statusCode: 200, body: "No +EV bets found" };
  }

  await sendToDiscord(DISCORD_WEBHOOK, bets);
  console.log("📨 Sent to Discord!");

  return {
    statusCode: 200,
    body: `Sent ${bets.length} +EV opportunities to Discord`,
  };
}

// Run daily at 9:00 AM ET (14:00 UTC during EDT, 15:00 UTC during EST)
// Adjust the cron as needed for your timezone
export const dailyScan = schedule("0 14 * * *", handler);

// Also export as a regular function so you can trigger manually
// via POST /.netlify/functions/daily-scan
export { handler };
