import { useState, useEffect, useMemo, useCallback, useRef } from "react";

// ─── CONFIG ───
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

const SPORTS = [
  { key: "americanfootball_nfl", label: "NFL", icon: "🏈" },
  { key: "americanfootball_ncaaf", label: "NCAAF", icon: "🏈" },
  { key: "basketball_nba", label: "NBA", icon: "🏀" },
  { key: "basketball_ncaab", label: "NCAAB", icon: "🏀" },
  { key: "baseball_mlb", label: "MLB", icon: "⚾" },
  { key: "icehockey_nhl", label: "NHL", icon: "🏒" },
  { key: "soccer_epl", label: "EPL", icon: "⚽" },
  { key: "soccer_spain_la_liga", label: "La Liga", icon: "⚽" },
  { key: "soccer_germany_bundesliga", label: "Bundesliga", icon: "⚽" },
  { key: "soccer_italy_serie_a", label: "Serie A", icon: "⚽" },
  { key: "soccer_france_ligue_one", label: "Ligue 1", icon: "⚽" },
  { key: "soccer_usa_mls", label: "MLS", icon: "⚽" },
  { key: "soccer_uefa_champs_league", label: "UCL", icon: "⚽" },
  { key: "tennis_atp_french_open", label: "ATP Tennis", icon: "🎾" },
  { key: "tennis_wta_french_open", label: "WTA Tennis", icon: "🎾" },
  { key: "mma_mixed_martial_arts", label: "MMA/UFC", icon: "🥊" },
];
const SHARP_BOOKS = ["pinnacle"];
const SOFT_BOOKS = [
  "draftkings","fanduel","betmgm","williamhill_us","bovada",
  "bet365","betrivers","unibet_us","pointsbetus","superbook","wynnbet",
];
const BOOK_DISPLAY = {
  draftkings:{name:"DraftKings",short:"DK"},fanduel:{name:"FanDuel",short:"FD"},
  betmgm:{name:"BetMGM",short:"MGM"},williamhill_us:{name:"Caesars",short:"CZR"},
  bovada:{name:"Bovada",short:"BOV"},bet365:{name:"Bet365",short:"365"},
  betrivers:{name:"BetRivers",short:"BR"},unibet_us:{name:"Unibet",short:"UNI"},
  pointsbetus:{name:"PointsBet",short:"PB"},superbook:{name:"SuperBook",short:"SB"},
  wynnbet:{name:"WynnBET",short:"WYN"},pinnacle:{name:"Pinnacle",short:"PIN"},
};

const GAME_MARKETS = ["h2h","spreads","totals"];
const PROP_MARKETS = [
  "player_pass_tds","player_pass_yds","player_pass_completions",
  "player_rush_yds","player_receptions","player_reception_yds",
  "player_points","player_rebounds","player_assists","player_threes",
  "player_hits","player_total_bases","player_home_runs",
  "player_pitcher_strikeouts","player_goals","player_shots_on_goal",
];
const PROP_LABELS = {
  player_pass_tds:"Pass TDs",player_pass_yds:"Pass Yds",player_pass_completions:"Completions",
  player_rush_yds:"Rush Yds",player_receptions:"Receptions",player_reception_yds:"Rec Yds",
  player_points:"Points",player_rebounds:"Rebounds",player_assists:"Assists",
  player_threes:"3-Pointers",player_hits:"Hits",player_total_bases:"Total Bases",
  player_home_runs:"Home Runs",player_pitcher_strikeouts:"K's (Pitcher)",
  player_goals:"Goals",player_shots_on_goal:"SOG",
};

// ─── MATH ───
const toDecimal = (o) => (o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1);
const toImplied = (o) => (o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100));
const fmtOdds = (o) => (o > 0 ? `+${o}` : `${o}`);
const fmtPct = (p) => `${(p * 100).toFixed(1)}%`;
const fmtEV = (e) => `${e > 0 ? "+" : ""}${(e * 100).toFixed(2)}%`;
const calcEV = (bookOdds, trueProb) => trueProb * toDecimal(bookOdds) - 1;

const devig = (outcomes) => {
  const total = outcomes.reduce((s, o) => s + toImplied(o.price), 0);
  return outcomes.map((o) => ({ ...o, trueProb: toImplied(o.price) / total }));
};

// ─── API ───
const apiFetch = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
};

const getGameOdds = (key, sport) =>
  apiFetch(`${ODDS_API_BASE}/sports/${sport}/odds/?apiKey=${key}&regions=us,us2&markets=${GAME_MARKETS.join(",")}&oddsFormat=american&bookmakers=${[...SHARP_BOOKS,...SOFT_BOOKS].join(",")}`);

const getProps = (key, sport, eventId) =>
  apiFetch(`${ODDS_API_BASE}/sports/${sport}/events/${eventId}/odds?apiKey=${key}&regions=us,us2&markets=${PROP_MARKETS.join(",")}&oddsFormat=american&bookmakers=${[...SHARP_BOOKS,...SOFT_BOOKS].join(",")}`);

// ─── EV EXTRACTION ───
const extractEV = (events, sportLabel, sportIcon, propsOnly = false) => {
  const bets = [];
  events.forEach((ev) => {
    const game = `${ev.away_team} @ ${ev.home_team}`;
    const time = new Date(ev.commence_time).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" });
    const bmMap = {};
    ev.bookmakers?.forEach((bm) => { bmMap[bm.key] = bm; });
    const sharpKey = SHARP_BOOKS.find((k) => bmMap[k]);
    if (!sharpKey) return;
    const sharpBM = bmMap[sharpKey];

    sharpBM.markets?.forEach((sm) => {
      const mk = sm.key;
      const isProp = mk.startsWith("player_");
      if (propsOnly && !isProp) return;
      if (!propsOnly && isProp) return;

      const dvSharp = devig(sm.outcomes);
      const tpMap = {};
      dvSharp.forEach((o) => { tpMap[`${o.name}|${o.point ?? ""}|${o.description ?? ""}`] = { tp: o.trueProb, sp: o.price }; });

      SOFT_BOOKS.forEach((sk) => {
        const sbm = bmMap[sk];
        if (!sbm) return;
        const sMarket = sbm.markets?.find((m) => m.key === mk);
        if (!sMarket) return;
        sMarket.outcomes.forEach((out) => {
          const lk = `${out.name}|${out.point ?? ""}|${out.description ?? ""}`;
          const sharp = tpMap[lk];
          if (!sharp) return;
          const ev2 = calcEV(out.price, sharp.tp);
          if (ev2 <= 0.005) return;

          let betType = mk === "spreads" ? "Spread" : mk === "totals" ? "Total" : isProp ? "Player Prop" : "Moneyline";
          let pick = out.name;
          if (out.point != null) {
            if (mk === "spreads") pick = `${out.name} ${out.point > 0 ? "+" : ""}${out.point}`;
            else if (mk === "totals") pick = `${out.name} ${out.point}`;
            else if (isProp) pick = `${out.description || out.name} ${out.name} ${out.point}`;
          } else if (isProp && out.description) {
            pick = `${out.description} — ${out.name}`;
          }

          bets.push({
            id: Math.random().toString(36).slice(2, 10),
            sport: sportLabel, icon: sportIcon, type: betType,
            marketLabel: isProp ? (PROP_LABELS[mk] || mk.replace("player_","").replace(/_/g," ")) : betType,
            game: isProp ? (out.description || game) : game,
            pick, time,
            bookId: sk,
            bookName: BOOK_DISPLAY[sk]?.name || sk,
            bookShort: BOOK_DISPLAY[sk]?.short || sk.slice(0,3).toUpperCase(),
            bookOdds: out.price, sharpOdds: sharp.sp,
            trueProb: sharp.tp, ev: ev2,
            impliedProb: toImplied(out.price),
            edge: sharp.tp - toImplied(out.price),
          });
        });
      });
    });
  });
  return bets;
};

// ─── COMPONENTS ───
const EVBadge = ({ ev }) => {
  const i = ev >= 0.06 ? 0 : ev >= 0.035 ? 1 : ev >= 0.02 ? 2 : 3;
  const c = [
    { bg:"#ff2d2d14",bd:"#ff2d2d50",cl:"#ff4d4d",p:"🔥 " },
    { bg:"#ff8c0014",bd:"#ff8c0050",cl:"#ffa033",p:"⚡ " },
    { bg:"#00e67614",bd:"#00e67650",cl:"#00e676",p:"" },
    { bg:"#66bb6a10",bd:"#66bb6a40",cl:"#81c784",p:"" },
  ][i];
  return <span style={{ background:c.bg, border:`1px solid ${c.bd}`, color:c.cl, padding:"3px 10px", borderRadius:6, fontFamily:"var(--m)", fontSize:"12.5px", fontWeight:700, letterSpacing:".4px", whiteSpace:"nowrap" }}>{c.p}{fmtEV(ev)} EV</span>;
};

const StatBox = ({ label, value, color }) => (
  <div style={{ background:"#111118", border:"1px solid #1a1a25", borderRadius:10, padding:"13px 16px", textAlign:"center", flex:1, minWidth:100 }}>
    <div style={{ fontSize:9, color:"#555", textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:5, fontFamily:"var(--m)" }}>{label}</div>
    <div style={{ fontSize:22, fontWeight:800, color, fontFamily:"var(--m)" }}>{value}</div>
  </div>
);

const Pill = ({ active, color, onClick, children }) => (
  <button onClick={onClick} style={{
    background: active ? `${color}18` : "transparent",
    border: `1px solid ${active ? `${color}55` : "#2a2a35"}`,
    color: active ? color : "#666", padding:"5px 13px", borderRadius:20,
    cursor:"pointer", fontSize:11, fontWeight:600, fontFamily:"var(--f)", transition:"all .12s",
  }}>{children}</button>
);

const BetCard = ({ bet }) => (
  <div style={{
    background:"linear-gradient(135deg,#141418,#1a1a22)", border:"1px solid #2a2a35",
    borderLeft:`3px solid ${bet.ev>=.03?"var(--a)":"#3a3a45"}`, borderRadius:10,
    padding:"14px 18px", display:"flex", flexDirection:"column", gap:9,
  }}>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
      <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
        <span style={{ fontSize:15 }}>{bet.icon}</span>
        <span style={{ fontSize:10, fontWeight:700, color:"#666", textTransform:"uppercase", letterSpacing:"1.2px", fontFamily:"var(--m)" }}>{bet.sport} · {bet.marketLabel}</span>
        {bet.time && <span style={{ fontSize:10, color:"#444", fontFamily:"var(--m)" }}>{bet.time}</span>}
      </div>
      <EVBadge ev={bet.ev} />
    </div>
    <div>
      <div style={{ color:"#999", fontSize:12, marginBottom:2 }}>{bet.game}</div>
      <div style={{ color:"#fff", fontSize:16, fontWeight:700, letterSpacing:"-.3px" }}>{bet.pick}</div>
    </div>
    <div style={{ display:"flex", gap:0, alignItems:"center", background:"#0d0d12", borderRadius:8, padding:"10px 0" }}>
      {[
        { label:bet.bookShort, value:fmtOdds(bet.bookOdds), color:"var(--a)" },
        { label:"Sharp", value:fmtOdds(bet.sharpOdds), color:"#999" },
        { label:"True%", value:fmtPct(bet.trueProb), color:"#ccc" },
        { label:"Edge", value:fmtPct(bet.edge), color:"#ffab40" },
      ].map((c,i) => (
        <div key={i} style={{ flex:1, textAlign:"center", borderLeft:i?"1px solid #1e1e28":"none" }}>
          <div style={{ fontSize:9, color:"#555", textTransform:"uppercase", letterSpacing:"1px", marginBottom:3, fontFamily:"var(--m)" }}>{c.label}</div>
          <div style={{ fontSize:17, fontWeight:800, color:c.color, fontFamily:"var(--m)" }}>{c.value}</div>
        </div>
      ))}
    </div>
  </div>
);

// ─── APP ───
export default function EVFinder() {
  const [apiKey, setApiKey] = useState("");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");
  const [bets, setBets] = useState([]);
  const [lastRefresh, setLastRefresh] = useState(null);

  const [activeSport, setActiveSport] = useState("ALL");
  const [activeType, setActiveType] = useState("ALL");
  const [minEV, setMinEV] = useState(1);
  const [sortBy, setSortBy] = useState("ev");
  const [showEmail, setShowEmail] = useState(false);
  const [copied, setCopied] = useState(false);
  const [includeProps, setIncludeProps] = useState(true);
  const [discordStatus, setDiscordStatus] = useState(null); // null | "sending" | "sent" | "error"

  const fetchAll = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true); setError(null); setBets([]); setStatus("");
    const all = [];

    try {
      for (const sport of SPORTS) {
        setStatus(`Fetching ${sport.label} lines...`);
        let events;
        try { events = await getGameOdds(apiKey, sport.key); }
        catch (e) {
          if (e.message.includes("401")) { setError("Invalid API key — grab one free at the-odds-api.com"); setLoading(false); return; }
          if (e.message.includes("429")) { setError("API rate limit hit. Try again later or upgrade your plan."); setLoading(false); return; }
          if (e.message.includes("422")) continue; // Sport not in season
          console.warn(`Skip ${sport.label}: ${e.message}`); continue;
        }
        if (!events?.length) continue;

        all.push(...extractEV(events, sport.label, sport.icon));

        if (includeProps) {
          const withSharp = events.filter((e) => e.bookmakers?.some((b) => SHARP_BOOKS.includes(b.key)));
          const limited = withSharp.slice(0, 5);
          for (let i = 0; i < limited.length; i++) {
            const ev = limited[i];
            setStatus(`${sport.label} props: ${ev.away_team} @ ${ev.home_team} (${i+1}/${limited.length})`);
            try {
              const pd = await getProps(apiKey, sport.key, ev.id);
              if (pd?.bookmakers) {
                const pe = { ...ev, bookmakers: pd.bookmakers };
                all.push(...extractEV([pe], sport.label, sport.icon, true));
              }
            } catch { /* skip individual prop failures */ }
          }
        }
      }

      // Deduplicate
      const seen = new Set();
      const deduped = all.filter((b) => {
        const k = `${b.bookId}|${b.pick}|${b.game}|${b.marketLabel}`;
        if (seen.has(k)) return false;
        seen.add(k); return true;
      }).sort((a, b) => b.ev - a.ev);

      setBets(deduped);
      setConnected(true);
      setLastRefresh(new Date());
    } catch (err) { setError(err.message); }
    finally { setLoading(false); setStatus(""); }
  }, [apiKey, includeProps]);

  const filtered = useMemo(() => {
    let r = bets.filter((b) => b.ev >= minEV / 100);
    if (activeSport !== "ALL") r = r.filter((b) => b.sport === activeSport);
    if (activeType !== "ALL") r = r.filter((b) => b.type === activeType);
    if (sortBy === "ev") r.sort((a, b) => b.ev - a.ev);
    else if (sortBy === "edge") r.sort((a, b) => b.edge - a.edge);
    else r.sort((a, b) => a.sport.localeCompare(b.sport) || b.ev - a.ev);
    return r;
  }, [bets, activeSport, activeType, minEV, sortBy]);

  const avgEV = filtered.length ? filtered.reduce((s, b) => s + b.ev, 0) / filtered.length : 0;
  const topEV = filtered[0]?.ev || 0;
  const sportTabs = ["ALL", ...new Set(bets.map((b) => b.sport))];
  const typeTabs = ["ALL", ...new Set(bets.map((b) => b.type))];

  const emailBody = useMemo(() => {
    const today = new Date().toLocaleDateString("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
    const top = filtered.slice(0, 15);
    let t = `+EV BEST BETS — ${today}\n${"═".repeat(54)}\n\n`;
    t += `📊 ${filtered.length} opportunities  |  📈 Avg: ${fmtEV(avgEV)}  |  🔥 Top: ${fmtEV(topEV)}\n\n`;
    t += `${"─".repeat(54)}\nTOP ${top.length} PLAYS\n${"─".repeat(54)}\n\n`;
    top.forEach((b, i) => {
      t += `${String(i+1).padStart(2)}. ${b.icon} ${b.sport} — ${b.marketLabel}\n`;
      t += `    ${b.game}\n`;
      t += `    PICK: ${b.pick}\n`;
      t += `    📍 ${b.bookName}: ${fmtOdds(b.bookOdds)}  |  Sharp: ${fmtOdds(b.sharpOdds)}\n`;
      t += `    💰 EV: ${fmtEV(b.ev)}  |  Edge: ${fmtPct(b.edge)}  |  True%: ${fmtPct(b.trueProb)}\n\n`;
    });
    t += `${"─".repeat(54)}\n⚠️ Sharp: Pinnacle (de-vigged). Lines move fast — bet early.\nGamble responsibly. +EV ≠ guaranteed profit.\n`;
    return t;
  }, [filtered, avgEV, topEV]);

  const copyEmail = () => { navigator.clipboard.writeText(emailBody); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const triggerDiscord = async () => {
    setDiscordStatus("sending");
    try {
      const res = await fetch("/.netlify/functions/trigger-scan", { method: "POST" });
      if (res.ok) { setDiscordStatus("sent"); setTimeout(() => setDiscordStatus(null), 3000); }
      else { setDiscordStatus("error"); setTimeout(() => setDiscordStatus(null), 3000); }
    } catch { setDiscordStatus("error"); setTimeout(() => setDiscordStatus(null), 3000); }
  };

  return (
    <div style={{ "--a":"#00e676","--a2":"#00bfa5","--m":"'JetBrains Mono','Fira Code',monospace","--f":"'Outfit','DM Sans',sans-serif", minHeight:"100vh", background:"#09090e", color:"#e0e0e0", fontFamily:"var(--f)" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:#0a0a0f}
        ::-webkit-scrollbar-thumb{background:#222;border-radius:3px}
        ::selection{background:#00e67633;color:#fff}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* HEADER */}
      <div style={{ borderBottom:"1px solid #161620", background:"linear-gradient(180deg,#0f0f16,#09090e)", padding:"22px 28px 18px" }}>
        <div style={{ maxWidth:1140, margin:"0 auto" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:3 }}>
                <span style={{ fontSize:24, fontWeight:900, letterSpacing:"-1px", background:"linear-gradient(135deg,var(--a),var(--a2))", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>+EV FINDER</span>
                {connected && <span style={{ fontSize:9, padding:"2px 7px", background:"#00e67612", border:"1px solid #00e67630", borderRadius:4, color:"var(--a)", fontWeight:700, fontFamily:"var(--m)", letterSpacing:"1px", animation:"pulse 2s infinite" }}>LIVE</span>}
              </div>
              <div style={{ fontSize:11, color:"#444", fontFamily:"var(--m)" }}>Pinnacle de-vig · {SOFT_BOOKS.length} books · game lines + player props</div>
            </div>

            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <div style={{ position:"relative" }}>
                <input type="password" placeholder="the-odds-api.com key" value={apiKey}
                  onChange={(e) => setApiKey(e.target.value.trim())}
                  onKeyDown={(e) => e.key === "Enter" && fetchAll()}
                  style={{ background:"#111118", border:`1px solid ${connected?"#00e67644":"#2a2a35"}`, color:"#ccc", padding:"8px 14px", borderRadius:8, fontSize:12, fontFamily:"var(--m)", width:210, outline:"none" }} />
                {connected && <span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"var(--a)", fontSize:14 }}>✓</span>}
              </div>
              <label style={{ display:"flex", alignItems:"center", gap:5, cursor:"pointer", fontSize:11, color:"#666", whiteSpace:"nowrap" }}>
                <input type="checkbox" checked={includeProps} onChange={(e) => setIncludeProps(e.target.checked)} style={{ accentColor:"var(--a)" }} />
                Props
              </label>
              <button onClick={fetchAll} disabled={!apiKey||loading} style={{
                background: !apiKey?"#1a1a25":"linear-gradient(135deg,var(--a),var(--a2))",
                border:"none", color:!apiKey?"#444":"#000", padding:"8px 22px", borderRadius:8,
                cursor:apiKey&&!loading?"pointer":"not-allowed", fontSize:12, fontWeight:700,
                fontFamily:"var(--f)", opacity:loading?.7:1,
              }}>{loading?"Scanning...":connected?"↻ Refresh":"Connect & Scan"}</button>
            </div>
          </div>

          {(status||error) && (
            <div style={{ marginTop:12, padding:"8px 14px", borderRadius:8, fontSize:12, fontFamily:"var(--m)",
              background:error?"#ff2d2d10":"#00e67608", border:`1px solid ${error?"#ff2d2d33":"#00e67622"}`, color:error?"#ff6b6b":"var(--a)",
            }}>{error||status}</div>
          )}

          {!connected && !loading && !bets.length && (
            <div style={{ marginTop:14, padding:"18px 22px", borderRadius:10, background:"#111118", border:"1px solid #1e1e28", fontSize:13, color:"#777", lineHeight:1.8 }}>
              <strong style={{ color:"#ccc", fontSize:14 }}>How it works</strong><br />
              1. Grab a free API key → <span style={{ color:"var(--a)", fontFamily:"var(--m)", fontSize:12 }}>the-odds-api.com</span> (500 req/mo free — plenty for daily use)<br />
              2. Paste it above and click <strong style={{ color:"#ccc" }}>Connect & Scan</strong><br />
              3. We pull live odds from {SOFT_BOOKS.length} sportsbooks, de-vig Pinnacle's sharp line, and surface every bet where the soft book's price implies a lower probability than the true line — that's your +EV edge<br />
              <span style={{ color:"#555", fontSize:11 }}>💡 Uncheck "Props" to use fewer API calls (~1 per sport vs ~6 with props)</span>
            </div>
          )}
        </div>
      </div>

      {/* CONTENT */}
      {bets.length > 0 && (
        <div style={{ maxWidth:1140, margin:"0 auto", padding:"20px 28px", animation:"slideUp .3s ease" }}>
          {/* Stats */}
          <div style={{ display:"flex", gap:10, marginBottom:18, flexWrap:"wrap" }}>
            <StatBox label="Opportunities" value={filtered.length} color="#fff" />
            <StatBox label="Avg EV" value={fmtEV(avgEV)} color="var(--a)" />
            <StatBox label="Top EV" value={fmtEV(topEV)} color="#ff4d4d" />
            <StatBox label="Props" value={filtered.filter(b=>b.type==="Player Prop").length} color="#ffab40" />
            <StatBox label="Last Scan" value={lastRefresh?.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})||"—"} color="#888" />
          </div>

          {/* Filters */}
          <div style={{ display:"flex", gap:18, marginBottom:18, alignItems:"center", flexWrap:"wrap" }}>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
              {sportTabs.map(s => <Pill key={s} active={activeSport===s} color="var(--a)" onClick={()=>setActiveSport(s)}>{s==="ALL"?"All Sports":`${SPORTS.find(sp=>sp.label===s)?.icon||""} ${s}`}</Pill>)}
            </div>
            <div style={{ display:"flex", gap:5, borderLeft:"1px solid #1e1e28", paddingLeft:16, flexWrap:"wrap" }}>
              {typeTabs.map(t => <Pill key={t} active={activeType===t} color="#ffab40" onClick={()=>setActiveType(t)}>{t==="ALL"?"All Types":t}</Pill>)}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8, borderLeft:"1px solid #1e1e28", paddingLeft:16 }}>
              <span style={{ fontSize:9, color:"#555", fontFamily:"var(--m)", textTransform:"uppercase", letterSpacing:"1px" }}>Min EV</span>
              <input type="range" min={0} max={10} step={.5} value={minEV} onChange={e=>setMinEV(+e.target.value)} style={{ width:70, accentColor:"var(--a)" }} />
              <span style={{ fontSize:12, color:"var(--a)", fontFamily:"var(--m)", fontWeight:700, minWidth:40 }}>+{minEV.toFixed(1)}%</span>
            </div>
            <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
              <button onClick={()=>setShowEmail(!showEmail)} style={{
                background:showEmail?"#00e67618":"#111118", border:`1px solid ${showEmail?"#00e67644":"#2a2a35"}`,
                color:showEmail?"var(--a)":"#888", padding:"6px 14px", borderRadius:8,
                cursor:"pointer", fontSize:11, fontWeight:600, fontFamily:"var(--f)",
              }}>✉ Email</button>
              <button onClick={triggerDiscord} disabled={discordStatus==="sending"} style={{
                background:discordStatus==="sent"?"#5865F218":"#111118",
                border:`1px solid ${discordStatus==="sent"?"#5865F255":"#2a2a35"}`,
                color:discordStatus==="sent"?"#5865F2":discordStatus==="error"?"#ff4d4d":"#888",
                padding:"6px 14px", borderRadius:8, cursor:"pointer", fontSize:11, fontWeight:600, fontFamily:"var(--f)",
                opacity:discordStatus==="sending"?.6:1,
              }}>{discordStatus==="sending"?"Sending...":discordStatus==="sent"?"✓ Sent to Discord":discordStatus==="error"?"✗ Failed":"🎮 Send to Discord"}</button>
              <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{
                background:"#111118", border:"1px solid #2a2a35", color:"#999",
                padding:"6px 10px", borderRadius:8, fontSize:11, fontFamily:"var(--f)", cursor:"pointer",
              }}>
                <option value="ev">Highest EV</option>
                <option value="edge">Biggest Edge</option>
                <option value="sport">By Sport</option>
              </select>
            </div>
          </div>

          {/* Email panel */}
          {showEmail && (
            <div style={{ background:"#111118", border:"1px solid #1e1e28", borderRadius:12, padding:20, marginBottom:18, animation:"slideUp .2s ease" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <span style={{ fontSize:14, fontWeight:700, color:"#fff" }}>✉ Email-Ready Summary — Top 15</span>
                <button onClick={copyEmail} style={{
                  background:copied?"#00e67618":"#1a1a25", border:`1px solid ${copied?"#00e67644":"#2a2a35"}`,
                  color:copied?"var(--a)":"#aaa", padding:"6px 16px", borderRadius:6,
                  cursor:"pointer", fontSize:12, fontWeight:600,
                }}>{copied?"✓ Copied!":"Copy to Clipboard"}</button>
              </div>
              <pre style={{ background:"#09090e", padding:18, borderRadius:8, fontSize:"11.5px", lineHeight:1.6, color:"#bbb", fontFamily:"var(--m)", whiteSpace:"pre-wrap", maxHeight:380, overflowY:"auto", margin:0 }}>{emailBody}</pre>
            </div>
          )}

          {/* Cards */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(480px,1fr))", gap:10 }}>
            {filtered.map(b => <BetCard key={b.id} bet={b} />)}
          </div>

          {!filtered.length && (
            <div style={{ textAlign:"center", padding:50, color:"#333" }}>
              <div style={{ fontSize:36, marginBottom:10 }}>📭</div>
              <div style={{ fontSize:15, fontWeight:600 }}>No +EV at this threshold</div>
              <div style={{ fontSize:12, marginTop:5, color:"#2a2a35" }}>Lower the min EV or broaden filters</div>
            </div>
          )}

          <div style={{ marginTop:28, padding:"18px 0", borderTop:"1px solid #161620", textAlign:"center" }}>
            <div style={{ fontSize:10, color:"#2a2a35", fontFamily:"var(--m)", lineHeight:1.9 }}>
              EV = (True Prob × Decimal Odds) − 1 · True prob = Pinnacle de-vig (multiplicative)
              <br />Edge = True Prob − Book Implied Prob · Powered by The Odds API
              <br />⚠️ Gamble responsibly. +EV does not guarantee profit on any individual bet.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
