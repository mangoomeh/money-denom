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

### 🍣 Sushiro Tracker (`sushiro/`)

Counts plates during a meal and works out the bill.

- **Plate counter:** one + and − per plate colour. The defaults are Red $2.30, Silver $2.90, Gold $3.90 and Black $4.90,
  and you can edit them under Settings to match your outlet.
- **Specials:** add any dish at a custom price (ramen, drinks, desserts).
- **Live bill:** the subtotal plus 10% service charge, then 9% GST on the subtotal and service charge, as Singapore
  requires. You can change either rate or set it to 0.
- **Saved visits:** save each meal with the outlet, the items and the bill, and see this month's visits, plates and spending.
  A saved visit keeps the prices it was charged at.

## Running it

```sh
npm start        # serves the apps at http://localhost:8000
npm test         # runs the unit tests (Node 18+)
```

Every push to the deploy branch runs the tests and publishes to GitHub Pages (`.github/workflows/pages.yml`).

## Layout

- `index.html`: the home screen with a tile for each app
- `shared/styles.css`: shared styles, including the Sushiro theme
- `petty-cash/`, `sushiro/`: each app's page and UI script
- `src/`: the logic as pure functions (`cash.js`, `sushiro.js`), with all money in integer cents
- `tests/`: unit tests for `src/`

To add an app, create a folder with an `index.html`, add a tile to the root `index.html`, and add the folder to the
`cp` line in the Pages workflow.
