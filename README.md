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
- **Receipt photos:** a compressed copy of each photo is kept with its saved visit in the browser's IndexedDB on that
  device.

### 📈 Function Plotter (`graph/`)

A small, Desmos-style graphing calculator.

- **Expressions:** type a function of `x` to plot it (`x^2 - 2`, `sin 2x`, `y = (x+1)(x-1)`). A row without `x` is
  worked out as a calculation (`√2 × π = 4.442882938`).
- **Graph:** drag to move and pinch or scroll to zoom. Tap a curve to trace its coordinates, and tapping near an
  x-intercept snaps to it. x-intercepts are also marked on the graph. Tap a colour dot to show or hide its curve.
- **Maths keypad:** sin, cos, tan, ln, log, √, π, powers and more. It's on by default on touch screens, and ⌨
  switches to the phone keyboard. There's also a DEG/RAD switch for angles.
- **Safe parsing:** expressions go through a small parser (`src/expr.js`) instead of `eval`, so typed text can't run
  as code. It handles implicit multiplication (`2x`, `3sin(x)`, `2pi`) and real cube roots of negative numbers.

### 🧮 GX-84 Calculator (`calc84/`)

A handheld graphing calculator modelled on the TI-84 Plus CE. It's a recreation, not an emulator: no Texas
Instruments software is used.

- **Keypad:** the full 84-style keypad with 2nd (blue) and ALPHA (green) functions, A-LOCK, an arrow pad that
  repeats while held, and keyboard support on computers (digits, operators, Enter, Backspace, Esc, arrows).
- **Home screen:** TI order of operations (`2^3^2 = 64`, `⁻2² = ⁻4`, implicit ×), automatic closing brackets, `Ans`
  (pressing + first gives `Ans+`), STO→ to variables A–Z and θ, ENTRY recall, ENTER to repeat, and TI-style
  errors with Quit/Goto.
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

The home screen also links to [Web Monopoly](https://mangoomeh.github.io/web-monopoly/) and
[Morning Pick](https://mangoomeh.github.io/FitnessTrackingApp/).

## Running it

```sh
npm start        # serves the apps at http://localhost:8000
npm test         # runs the unit tests (Node 18+)
```

Every push to the deploy branch runs the tests and publishes to GitHub Pages (`.github/workflows/pages.yml`).

## Layout

- `index.html`: the home screen with a tile for each app
- `shared/styles.css`: shared styles, including the Sushiro theme
- `petty-cash/`, `sushiro/`, `graph/`, `calc84/`: each app's page and UI script (`sushiro/ocr.js` and `sushiro/photos.js` handle receipts)
- `src/`: the logic as pure functions (`cash.js`, `sushiro.js`, `receipt.js`, `expr.js`, `ti84.js`), with all money in integer cents
- `tests/`: unit tests for `src/`

To add an app, create a folder with an `index.html`, add a tile to the root `index.html`, and add the folder to the
`cp` line in the Pages workflow.
