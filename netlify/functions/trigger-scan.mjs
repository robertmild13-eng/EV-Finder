const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const MIN_EV = 0.01;
const MAX_BETS = 25;

// All sports — API auto-returns empty for out of season
const SPORTS = [
  { key: "americanfootball_nfl", label: "NFL", icon: "🏈", props: true },
  { key: "americanfootball_ncaaf", label: "NCAAF", icon: "🏈", props: true },
  { key: "basketball_nba", label: "NBA", icon: "🏀", props: true },
  { key: "basketball_ncaab", label: "NCAAB", icon: "🏀", props: true },
  { key: "baseball_mlb", label: "MLB", icon: "⚾", props: true },
  { key: "icehockey_nhl", label: "NHL", icon: "🏒", props: true },
  { key: "soccer_epl", label: "EPL", icon: "⚽", props: false },
  { key: "soccer_spain_la_liga", label: "La Liga", icon: "⚽", props: false },
  { key: "soccer_germany_bundesliga", label: "Bundesliga", icon: "⚽", props: false },
  { key: "soccer_italy_serie_a", label: "Serie A", icon: "⚽", props: false },
  { key: "soccer_france_ligue_one", label: "Ligue 1", icon: "⚽", props: false },
  { key: "soccer_usa_mls", label: "MLS", icon: "⚽", props: false },
  { key: "soccer_uefa_champs_league", label: "UCL", icon: "⚽", props: false },
  { key: "mma_mixed_martial_arts", label: "MMA/UFC", icon: "🥊", props: false },
];

const SHARP_BOOKS = ["pinnacle"];
const SOFT_BOOKS = ["draftkings","fanduel","betmgm","williamhill_us","bovada","bet365","betrivers","pointsbetus","superbook"];
const BOOK_NAMES = {draftkings:"DraftKings",fanduel:"FanDuel",betmgm:"BetMGM",williamhill_us:"Caesars",bovada:"Bovada",bet365:"Bet365",betrivers:"BetRivers",pointsbetus:"PointsBet",superbook:"SuperBook",pinnacle:"Pinnacle"};
const ALL_BOOKS = [...SHARP_BOOKS, ...SOFT_BOOKS].join(",");

const GAME_MARKETS = "h2h,spreads,totals";
const PROP_MARKETS = "player_pass_tds,player_pass_yds,player_rush_yds,player_receptions,player_reception_yds,player_points,player_rebounds,player_assists,player_threes,player_hits,player_total_bases,player_home_runs,player_pitcher_strikeouts,player_goals,player_shots_on_goal";
const PROP_LABELS = {player_pass_tds:"Pass TDs",player_pass_yds:"Pass Yds",player_rush_yds:"Rush Yds",player_receptions:"Receptions",player_reception_yds:"Rec Yds",player_points:"Points",player_rebounds:"Rebounds",player_assists:"Assists",player_threes:"3PT",player_hits:"Hits",player_total_bases:"Total Bases",player_home_runs:"HRs",player_pitcher_strikeouts:"K's",player_goals:"Goals",player_shots_on_goal:"SOG"};

const toDecimal = (o) => (o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1);
const toImplied = (o) => (o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100));
const fmtOdds = (o) => (o > 0 ? "+" + o : "" + o);
const fmtPct = (p) => (p * 100).toFixed(1) + "%";
const fmtEV = (e) => (e > 0 ? "+" : "") + (e * 100).toFixed(2) + "%";

const devig = (outcomes) => {
  const total = outcomes.reduce((s, o) => s + toImplied(o.price), 0);
  return outcomes.map((o) => ({ ...o, trueProb: toImplied(o.price) / total }));
};

async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("API " + res.status);
  return res.json();
}

function extractEV(events, sportLabel, sportIcon, propsOnly) {
  const bets = [];
  for (const event of events) {
    const game = event.away_team + " @ " + event.home_team;
    const time = new Date(event.commence_time).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" });
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
        const k = o.name + "|" + (o.point !== undefined && o.point !== null ? o.point : "") + "|" + (o.description || "");
        tpMap[k] = { tp: o.trueProb, sp: o.price };
      });
      for (const sk of SOFT_BOOKS) {
        if (!bmMap[sk]) continue;
        const sMarket = bmMap[sk].markets ? bmMap[sk].markets.find((m) => m.key === mk) : null;
        if (!sMarket) continue;
        for (const out of sMarket.outcomes) {
          const lk = out.name + "|" + (out.point !== undefined && out.point !== null ? out.point : "") + "|" + (out.description || "");
          const sharp = tpMap[lk];
          if (!sharp) continue;
          const ev = sharp.tp * toDecimal(out.price) - 1;
          if (ev <= MIN_EV) continue;
          var betType = mk === "spreads" ? "Spread" : mk === "totals" ? "Total" : isProp ? "Prop" : "ML";
          var pick = out.name;
          if (out.point !== undefined && out.point !== null) {
            if (mk === "spreads") pick = out.name + " " + (out.point > 0 ? "+" : "") + out.point;
            else if (mk === "totals") pick = out.name + " " + out.point;
            else if (isProp) pick = (out.description || out.name) + " " + out.name + " " + out.point;
          } else if (isProp && out.description) {
            pick = out.description + " - " + out.name;
          }
          var mktLabel = isProp ? (PROP_LABELS[mk] || mk.replace("player_","").replace(/_/g," ")) : betType;
          bets.push({
            sport: sportLabel, icon: sportIcon, type: betType, marketLabel: mktLabel,
            game: game, pick: pick, time: time,
            bookName: BOOK_NAMES[sk] || sk, bookOdds: out.price, sharpOdds: sharp.sp,
            trueProb: sharp.tp, ev: ev, edge: sharp.tp - toImplied(out.price)
          });
        }
      }
    }
  }
  return bets;
}

function buildDiscordEmbeds(bets) {
  var today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  var avgEV = bets.length ? bets.reduce(function(s, b) { return s + b.ev; }, 0) / bets.length : 0;
  var topEV = bets[0] ? bets[0].ev : 0;
  var top = bets.slice(0, MAX_BETS);

  var sportCounts = {};
  bets.forEach(function(b) {
    var k = b.icon + " " + b.sport;
    sportCounts[k] = (sportCounts[k] || 0) + 1;
  });
  var sportSummary = Object.keys(sportCounts).map(function(k) { return k + ": " + sportCounts[k]; }).join(" | ");

  var summaryEmbed = {
    title: "📈 +EV Best Bets",
    description: today + "\n\n" + sportSummary,
    color: 0x00e676,
