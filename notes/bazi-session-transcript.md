# Building a BaZi calculator: Claude Code session transcript

Repository: [mangoomeh/money-denom](https://github.com/mangoomeh/money-denom). Live site: https://mangoomeh.github.io/money-denom/

This is a cleaned copy of the conversation. It contains every message and reply. Claude's tool calls (file edits, test runs, browser checks) are summarised in *italics* rather than shown in full.

---

## 1. Context

**User:**

> Repo mangoomeh/money-denom, branch ccr-491f8a0c-svplkf (the default branch; GitHub Pages deploys from it via
> .github/workflows/pages.yml). Live at https://mangoomeh.github.io/money-denom/. Apps:
> Petty Cash (petty-cash/, with a Win95 theme)
> Sushiro Tracker (sushiro/, receipt OCR via Tesseract.js plus plate parsing in src/receipt.js)
> GX-84 TI-84-style calculator (calc84/, engine in src/ti84.js)
> Wallet Radar (wallets/): Robinhood Chain via the public RPC in src/onchain.js, Solana via PublicNode in
> src/solana.js, name search via DexScreener in src/tokensearch.js
> The home screen (index.html) also links to Web Monopoly, Morning Pick and Deliberate. Run tests with npm test.

*Claude checked the repository state and ran the tests.*

**Claude:**

> I've got the repo context, but your message doesn't say what you'd like changed. Here's where things stand now:
>
> - **Branch:** I'm on `ccr-07176c18-kh2itk`, the branch this session is set up to push to. It's at the same commit
>   as the default branch `ccr-491f8a0c-svplkf`. The work branch doesn't exist on GitHub yet; my first push will create it.
> - **Tests:** `npm test` passes, 61 of 61.
>
> Pages deploys from `ccr-491f8a0c-svplkf`, so anything I push stays off the live site until it's merged into that
> branch. I can open a PR for that, or push straight to the default branch if you'd rather.
>
> What should I work on?

---

## 2. The request

**User:**

> can you build a bazi calculator as a miniapp

*Claude read the existing apps to match their layout, styles and conventions, then:*

- *wrote the calculation engine in `src/bazi.js`;*
- *checked the solar-term times against published times for 2023–2024 (all within a minute), and checked a well-known
  published chart (26 Dec 1893, 辰 hour → 甲辰 丁酉 甲子 癸巳);*
- *built the page in `bazi/index.html` and `bazi/app.js`, with styles in `shared/styles.css`;*
- *added a home-screen tile, added `bazi` to the Pages deploy workflow, and documented the app in the README;*
- *wrote `tests/bazi.test.js` (12 tests);*
- *opened the page in a headless browser at phone size, in light and dark mode, and fixed one issue it found (the
  current year was off-screen in the years row).*

**User (sent while Claude was working):**

> after that, can you assess how i can let another person read this session conversation without needing a claude account?

**Claude:**

> I've built the BaZi Calculator as a new mini-app at `bazi/`, with a ☯️ tile on the home screen. It's pushed to
> `ccr-07176c18-kh2itk` but isn't live yet: Pages only deploys from `ccr-491f8a0c-svplkf`, so it needs merging.
>
> **Checks:** all 73 tests pass, including the new ones in `tests/bazi.test.js`. I also used the page in Chromium at
> phone size, in light and dark mode: no layout overflow, no script errors, and saving a chart works.
>
> **Accuracy**
> - **Solar terms:** the app works out when each solar term falls from the sun's position, so it needs no lookup
>   tables and no network. The times I checked for 2023–2024 were all within a minute of published times.
> - **Known chart:** 26 Dec 1893 at 8am gives 甲辰 丁酉 甲子 癸巳, which matches the published chart for that birth.
> - **Year boundary:** the year and month change at 立春, not on 1 January.
>
> **What the app shows**
> - **Four Pillars:** hour, day, month and year, coloured by element, each with its ten god relative to the day
>   master, its hidden stems, 纳音 and life stage. If the birth time is unknown, the hour pillar is left out.
> - **Day master:** its element and a short description.
> - **Five elements:** a count of the eight characters, plus a second count that includes hidden stems.
> - **Interactions** between the pillars (combinations, clashes, harms, punishments), and the void branches (空亡).
> - **Luck pillars (大运):** forward or backward depending on gender and the year's yin/yang, with the start age from
>   the days to the nearest solar term (3 days = 1 year). Tapping a luck pillar shows its 10 years (流年).
> - **Options:** time zone; true solar time from a city list or a longitude; and whether 23:00 starts the next day.
> - **Saved charts** are kept in the browser on that device only.
>
> **Limitations**
> - Birth dates must be entered on the Western calendar. There's no lunar-date input yet.
> - Daylight saving isn't detected, so you enter the standard time.
>
> **Letting someone read this conversation without a Claude account:** I can't confirm whether a session link opens
> for someone who isn't signed in, so assume it doesn't. These routes work for certain:
>
> 1. **I write the transcript to a file.** You can send it as an attachment or paste it into a GitHub Gist, which
>    anyone can read without an account.
> 2. **Publish it as a web page on your existing GitHub Pages site.** Anyone with the link can read it without
>    signing in, but it's public to anyone who finds the URL.
> 3. **Screenshots or copy-paste,** for a quick one-off.
>
> I'd go with option 1, and use a Gist if you want a link to share.

---

## 3. Sharing

**User:**

> ok go with option 1.

*Claude wrote this file.*

---

## 4. Later changes (summarised)

The rest of the session is summarised: each user message is quoted, and Claude's work and replies are described
briefly.

**User:** "have you deployed the bazi calculator on the pocket apps page?" → *Not yet; on request, Claude pushed it
to the deploy branch and confirmed it was live.*

**User:** "four pillars value is very odd can you check" (a 10 Dec 1996 chart, hour unknown) → *Claude checked every
value by hand (year 丙子, month 庚子, day 辛巳, ten gods, 纳音, life stages) and found them correct; the layout was
the confusing part.* **User:** "yes please" → *The pillar grid got labelled rows and tap-to-explain.*

**User:** "can you also add explanations on how to understand each of those values in english. how the readings
help with life?" → *Added a Reading tab: day master character, what each pillar covers, main ten-god themes, element
balance, and the current decade and year, framed as traditional interpretation rather than prediction.*

**User:** "what other additions do you think is useful to the bazi calculator" → *Claude suggested nine; the user
chose the recommended three:* historical time zones by birthplace (e.g. Singapore UTC+7:30 before 1982), day master
strength with favourable elements, and a Match tab for compatibility.

**User:** "i dont think youre supposed to list so much information." → *Claude agreed to keep replies short.*

**User:** "what are the things that we have skipped?" then "ok build all of it" → *Added lunar birthday input,
this year/month/day (流年/流月/流日) with a calendar, symbolic stars, share link and copy-as-text, the twelve possible
hour pillars when the time is unknown, a Chinese / English / both display setting, the climate (调候) adjustment,
and time-zone regions (with daylight saving) for unlisted birthplaces.*

---

## What changed in the repository

First commit `f4c89b9` on branch `ccr-07176c18-kh2itk`: "Add BaZi Calculator: Four Pillars from solar terms, ten gods,
elements and luck pillars". Later commits added `src/baziread.js` (readings), `src/bazimatch.js` (compatibility) and
`src/lunar.js` (lunar calendar).

| File | Change |
| --- | --- |
| `src/bazi.js` | New: the calculation engine (sun position, solar terms, pillars, ten gods, luck pillars) |
| `bazi/index.html`, `bazi/app.js` | New: the app's page and UI |
| `tests/bazi.test.js` | New: 12 tests |
| `shared/styles.css` | BaZi theme, element colours, pillar and luck-pillar layout |
| `index.html` | Home-screen tile |
| `.github/workflows/pages.yml` | Deploys the `bazi/` folder |
| `README.md` | App description |

The app is live at https://mangoomeh.github.io/money-denom/bazi/
