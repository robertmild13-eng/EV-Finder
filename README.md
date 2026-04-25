# +EV Finder — Best Bets Dashboard

Finds positive expected value betting opportunities by comparing sportsbook odds against Pinnacle's de-vigged sharp line. Sends daily alerts to Discord.

## What You Need

| Thing | Link | Cost |
|-------|------|------|
| **Odds API Key** | [the-odds-api.com/#get-access](https://the-odds-api.com/#get-access) | Free (500 req/mo) |
| **Discord Webhook** | Your Discord Server → Channel Settings → Integrations → Webhooks | Free |
| **Netlify Account** | [app.netlify.com](https://app.netlify.com) | Free |
| **GitHub Account** | [github.com](https://github.com) | Free |

## Setup — Step by Step

### 1. Get your Odds API key
- Go to **https://the-odds-api.com/#get-access**
- Enter your email, pick the free plan
- Check your email for the API key
- Save it somewhere — you'll need it in step 4

### 2. Create a Discord webhook
- Open Discord → go to the channel you want alerts in
- Click the ⚙️ gear icon (Edit Channel)
- Go to **Integrations** → **Webhooks** → **New Webhook**
- Name it "+EV Finder" or whatever you like
- Click **Copy Webhook URL**
- Save it — you'll need it in step 4

### 3. Deploy to Netlify
- Push this entire folder to a new GitHub repo
- Go to **https://app.netlify.com**
- Click **"Add new site"** → **"Import an existing project"**
- Connect your GitHub and select the repo
- Build settings should auto-detect:
  - Build command: `npm run build`
  - Publish directory: `dist`
- Click **Deploy**

### 4. Add environment variables
- In Netlify: go to **Site configuration** → **Environment variables**
- Add these two:

| Key | Value |
|-----|-------|
| `ODDS_API_KEY` | Your key from step 1 |
| `DISCORD_WEBHOOK` | Your webhook URL from step 2 |

- **Redeploy** the site after adding variables

### 5. Test it
- Visit your Netlify site URL — that's your live dashboard
- Enter your Odds API key in the dashboard to browse interactively
- Click the **"Send to Discord"** button to trigger a manual scan
- Or hit `https://your-site.netlify.app/.netlify/functions/trigger-scan` directly

### 6. Automatic daily scans
The scheduled function runs **every day at 9:00 AM ET** automatically.
No extra setup needed — Netlify Scheduled Functions handle it.

To change the time, edit the cron in `netlify/functions/daily-scan.mjs`:
```js
// Current: 9 AM ET (14:00 UTC during EDT)
export const dailyScan = schedule("0 14 * * *", handler);

// Example: 7 AM ET = 12:00 UTC during EDT
export const dailyScan = schedule("0 12 * * *", handler);
```

## Project Structure

```
ev-finder/
├── index.html                        # HTML shell
├── netlify.toml                      # Netlify build config
├── package.json                      # Dependencies
├── vite.config.js                    # Vite bundler config
├── src/
│   ├── main.jsx                      # React entry point
│   └── App.jsx                       # Dashboard UI
└── netlify/functions/
    ├── daily-scan.mjs                # Scheduled function → Discord
    └── trigger-scan.mjs              # Manual trigger endpoint
```

## How +EV Works

1. We pull odds from ~11 sportsbooks (DraftKings, FanDuel, BetMGM, etc.)
2. We also pull Pinnacle's odds — the sharpest book in the world
3. We **de-vig** Pinnacle's line to get the "true" probability of each outcome
4. For every bet at every soft book, we check: does this book's price imply a **lower** probability than the true line?
5. If yes → that's a **+EV opportunity**. You're getting better odds than the true probability warrants.

**Formula:** `EV = (True Probability × Decimal Odds) - 1`

A +3% EV bet means that over many bets, you'd expect to profit $3 for every $100 wagered.

## API Usage

The free Odds API tier gives 500 requests/month. A single daily scan uses roughly:
- ~6 requests for game lines (1 per sport)
- ~24 requests for player props (4 events × 6 sports)
- **~30 requests total per scan**

At 30/day, you can run ~16 scans per month. If you only scan once daily, you'll use ~30 × 30 = 900 — you'd need the $12/month plan (10,000 requests). To stay on free, either reduce sports or skip props.

## FAQ

**Can I add more sportsbooks?**
Yes — edit the `SOFT_BOOKS` array in `App.jsx` and `daily-scan.mjs`. See the full list at [the-odds-api.com/sports-odds-data/bookmaker-apis.html](https://the-odds-api.com/sports-odds-data/bookmaker-apis.html)

**Can I add more sports?**
Yes — add entries to the `SPORTS` array. Full list at [the-odds-api.com/sports-odds-data/sports-apis.html](https://the-odds-api.com/sports-odds-data/sports-apis.html)

**Lines are different from what I see on the app?**
Odds move fast. The API updates every 1-5 minutes depending on the sport. Always verify on the book before placing.
