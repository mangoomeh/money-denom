# Pocket Apps

A set of small, mobile-friendly money tools. They need no installation or build step and run in any browser.
Live at https://mangoomeh.github.io/money-denom/

## Apps

### 💵 Petty Cash (`petty-cash/`)

A cash denomination counter with a transaction checker.

- **Opening balance setup:** enter how many of each note and coin you have (SGD, $100 down to 5¢).
- **Transaction checker:** enter the purchase amount, tap + for each note or coin you take out, and add any change you
  received. *Confirm* only deducts from your cash on hand when the cash you selected equals the purchase amount.
- **History with undo, and low cash warnings.**
- **Two themes:** modern, or retro Windows 95 (title bar, bevelled buttons, LCD balance, taskbar). The 🖥️ button in
  the header switches between them, and the choice is remembered on that device.

### 🍣 Sushiro Tracker (`sushiro/`)

Counts plates during a meal and works out the bill.

- **Plate counter:** one + and − per plate colour. The defaults are Red $2.30, Silver $2.90, Gold $3.90 and Black $4.90,
  and you can edit them under Settings to match your outlet.
- **Specials:** add any dish at a custom price (ramen, drinks, desserts).
- **Live bill:** the subtotal plus 10% service charge, then 9% GST on the subtotal and service charge, as Singapore
  requires. You can change either rate or set it to 0.
- **Saved visits:** save each meal with the outlet, the items and the bill, and see this month's visits, plates and spending.
  A saved visit keeps the prices it was charged at.
- **Receipt check:** snap the receipt, or paste its text from iPhone Live Text or Google Lens. The app reads the total
  and compares it with what you tracked, for example "The receipt is $2.76 more. Maybe 1 Red plate wasn't counted?".
  Text recognition runs on the phone with [Tesseract.js](https://tesseract.projectnaptha.com/), which downloads
  about 10 MB on first use. Nothing is uploaded. If the total is misread you can correct it by hand.
- **Plate counts from the receipt:** Sushiro receipts list items by price (`$2.3 Sushi 20 $46.00`), so the scan also
  reads each item. Sushi lines are matched to plate colours and shown next to your counts ("Red: receipt 20 · you
  19"), and other items (chawanmushi, soup, dishes) are listed. One button fills the meal in from the receipt. The
  reader is built to cope with common misreads on thermal paper, and it says when some lines couldn't be read,
  because the items then don't add up to the subtotal. Pasting text from Live Text or Google Lens gives the best
  results.
- **Receipt photos:** a compressed copy of each photo is kept with its saved visit in the browser's IndexedDB on that
  device.

### 🧮 GX-84 Calculator (`calc84/`)

A handheld graphing calculator modelled on the TI-84 Plus CE. It's a recreation, not an emulator: no Texas
Instruments software is used.

- **Keypad:** the full 84-style keypad with 2nd (blue) and ALPHA (green) functions, A-LOCK, an arrow pad that
  repeats while held, and keyboard support on computers (digits, operators, Enter, Backspace, Esc, arrows).
- **Home screen:** TI order of operations (`2^3^2 = 64`, `⁻2² = ⁻4`, implicit ×), automatic closing brackets, `Ans`
  (pressing + first gives `Ans+`), STO→ to variables A–Z and θ, ENTRY recall, ENTER to repeat, and TI-style
  errors with Quit/Goto.
- **Stacked fractions:** ALPHA + X,T,θ,n inserts an n/d fraction box, as on the TI-84 Plus CE. ▼ and ▲ move
  between the numerator and denominator. A calculation typed with fractions answers as a stacked fraction, and
  ALPHA + Y= (F1) opens the FRAC menu (n/d, ▶F◀▶D, ▶Frac, ▶Dec). Fractions also work in Y=.
- **Menus:** MATH (▶Frac, ▶Dec, ³, ³√(, ˣ√, nDeriv(, fnInt(), NUM (abs, round, iPart, fPart, int, min, max, lcm,
  gcd), PRB (rand, nPr, nCr, !, randInt), and VARS → Y-VARS.
- **Graphing:** Y= with ten colour-coded functions, WINDOW, ZOOM (ZBox, Zoom In/Out, ZDecimal, ZSquare, ZStandard,
  ZTrig, ZInteger, ZoomFit), TRACE (typing a number jumps to that X), GRAPH with a free cursor, and FORMAT (grid,
  axes, coordinates).
- **CALC:** value, zero, minimum, maximum, intersect, dy/dx and ∫f(x)dx, with Left/Right Bound and Guess prompts and
  shading for integrals.
- **TABLE and TBLSET, plus MODE** (Normal/Sci, Float/Fix 0–9, Radian/Degree). Everything is saved on the device.
- **Not yet:** STAT, lists, MATRIX, programs, APPS and complex numbers. Their keys show a short "not in this version"
  note.

### 🔎 Wallet Radar (`wallets/`)

Shows who went into a token, and when, on **Robinhood Chain** and **Solana**. It needs no keys by default and only
reads public blockchain data: there's no wallet connection and nothing to sign.

- **Search by name:** type a token's name or symbol (via DexScreener's free search) and pick it from a list of
  tokens on the chosen chain, most traded first. Copycats and tokens with "big liquidity, almost no trading" (a
  sign of a fake) are flagged. You can also paste the address directly.

- **Buyers:** the wallets that bought at least X% of a token's supply between two times. Each shows the first buy
  time, number of buys, amount sold in the window, net position, current holding, and flags:
  - **bundle:** one transaction bought for several wallets;
  - **likely a trading bot:** many buys;
  - **contract:** usually a smart wallet.

  You can save the list as a group or export it to CSV.
- **Compare:** which wallets of a saved group (or pasted addresses) bought or received another token in a time window.
- **Wallet:** which wallets an address sent tokens to (or received them from), with counts and amounts. Tap any
  wallet to follow the trail. ETH transfers need a free Blockscout key.
- **Scam flags:** token names with hidden characters (fake look-alike tokens) and look-alike addresses (address
  poisoning) are flagged.
- **Robinhood Chain data:** the chain's free public RPC. `src/onchain.js` splits requests to fit the node's limits,
  backs off when rate-limited, and fills in block times the node leaves out.
- **Solana data:** PublicNode's free node (`src/solana.js`). Solana's own public node blocks web pages, so it isn't
  used.
  - A **buy** is a wallet that signed a transaction and ended up with more of the token.
  - **Same block** flags wallets that bought in the same block, typical of launch snipers.
  - SOL transfers are included in the Wallet view.
  - Token accounts and wallet-vs-program checks are worked out on the device, so the node's restricted "indexed"
    calls aren't needed.
  - An optional Helius key can be set as a backup.

### ☯️ BaZi Calculator (`bazi/`)

Works out a Four Pillars of Destiny (八字) chart from a birth date and time.

- **Four Pillars:** the year, month, day and hour stems and branches, coloured by element, with each one's ten god
  (relative to the day master), hidden stems, 纳音 and life stage, in labelled rows. Tap any label or value for a
  plain-English explanation. If the birth time is unknown, the hour pillar is
  left out.
- **Solar terms:** the year changes at 立春 and each month at its solar term. The terms are worked out from the sun's
  position (abridged VSOP87, in `src/bazi.js`), so the app needs no tables or network and agrees with published
  times to within a minute. The chart shows which term the birth month began with.
- **Lunar (农历) birthdays:** switch the date to Lunar and pick the lunar year, month (including leap months) and
  day. The conversion (`src/lunar.js`) uses new moons and solar terms in Beijing time, as the official calendar does,
  for 1901–2099. The lunar date is also shown for any Western date.
- **Birthplace and historical time zones:** pick a city and the app uses the UTC offset that applied there on the
  birth date, from the browser's time zone history. For example, Singapore and Malaysia were UTC+7:30 until 1982,
  and China used daylight saving from 1986 to 1991. "Other" lets you pick any time zone region (which also handles daylight saving) or a fixed offset, and a longitude.
- **True solar time (optional):** the day and hour pillars use local solar time (the birthplace's longitude plus the
  equation of time). You can also choose whether 23:00 starts the next day.
- **Five elements, day master, and interactions:** element counts (with and without hidden stems), stem
  combinations and clashes, branch combinations, clashes, harms, punishments, three-harmony and directional groups,
  and the void branches.
- **Luck pillars (大运):** ten 10-year pillars, forward or backward by gender and year polarity. The start age is
  worked out from the days to the nearest solar term (3 days = 1 year). Tap a pillar to see its ten years (流年);
  the current ones are highlighted.
- **Summary:** one screen for people who don't want the detail: the pillars, you in a line, strengths, what to
  watch for, what helps, and whether this decade and year look favourable.
- **Reading (plain English):** what the day master says about your strengths and watch-outs, what each pillar covers
  in life, which ten-god themes are strong or missing, element balance, and what the current luck pillar and year
  bring, plus a short guide to reading a chart. The text is in `src/baziread.js` and is framed as traditional
  interpretation, not prediction.
- **Strength and favourable elements:** scores whether the day master is strong or weak (all stems and hidden
  stems, with the month counted double), shows the three classic checks (得令, 得地, 得势), and picks the useful
  element (用神) and the favourable ones. A winter or summer birth also counts Fire or Water as favourable for
  climate (调候). Luck pillars, years, months and days are marked favourable, mixed or demanding.
- **Now (Luck tab):** this year's, month's and day's pillars with their ten gods and any clashes or combinations
  with your chart, the twelve month pillars of the year (流月), and a calendar of this month's day pillars (流日).
- **Symbolic stars (神煞):** Nobleman, Academic Star, Peach Blossom, Travelling Horse, Canopy, Prosperity Star and
  Goat Blade, with where they fall.
- **No birth time:** all twelve possible hour pillars are shown; tap one to try it.
- **Share:** a link that opens the same chart (no account needed), or the chart copied as text.
- **Display:** both languages, Chinese labels only, or English labels with pinyin.
- **Match:** compares two charts (the current one and any saved one) on day masters, spouse star, spouse
  palaces (day branches), zodiac signs and whether each brings the other's favourable elements (`src/bazimatch.js`).
- **Saved charts** are kept on the device.

The home screen also links to [Web Monopoly](https://mangoomeh.github.io/web-monopoly/),
[Morning Pick](https://mangoomeh.github.io/FitnessTrackingApp/) and
[Deliberate](https://mangoomeh.github.io/learn-react/).

## Running it

```sh
npm start        # serves the apps at http://localhost:8000
npm test         # runs the unit tests (Node 18+)
```

Every push to the deploy branch runs the tests and publishes to GitHub Pages (`.github/workflows/pages.yml`).

## Layout

- `index.html`: the home screen with a tile for each app
- `shared/styles.css`: shared styles, including the Sushiro theme
- `petty-cash/`, `sushiro/`, `calc84/`, `wallets/`, `bazi/`: each app's page and UI script (`sushiro/ocr.js` and `sushiro/photos.js` handle receipts)
- `src/`: the logic as pure functions (`cash.js`, `sushiro.js`, `receipt.js`, `ti84.js`, `onchain.js`, `bazi.js`, `baziread.js`, `bazimatch.js`), with all money in integer cents
- `tests/`: unit tests for `src/`

To add an app, create a folder with an `index.html`, add a tile to the root `index.html`, and add the folder to the
`cp` line in the Pages workflow.
