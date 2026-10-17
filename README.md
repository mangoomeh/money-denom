# Petty Cash

A mobile-friendly petty cash tracker: a cash denomination counter with a transaction checker.
It needs no installation or build step and runs in any browser.

## Features

- **Opening balance setup**: on first launch, enter how many of each note and coin you have (SGD, $100 down to 5¢).
- **Transaction checker**: enter the purchase amount, tap + for each note or coin you take out, and add any
  change you received. The app shows the difference and warns you about a mismatch.
- **Deduct on confirm only**: your cash on hand changes only when you press *Confirm purchase*, and that button
  works only when the cash you selected equals the purchase amount and you have those notes and coins in the stash.
- **Live balance**: the total updates as soon as you confirm a purchase.
- **Transaction history**: shows what you spent, when, and which notes and coins went out and came back.
- **Undo**: reverses a purchase or a count adjustment in one tap. Undo is blocked if the cash has since been spent.
- **Low cash warning**: flags any note or coin you have fewer of than the threshold you set (0 turns it off).

All amounts are calculated in whole cents, so there are no floating-point rounding errors. Data is saved in
your browser's `localStorage` on that device.

## Running it

```sh
npm start        # serves the app at http://localhost:8000
npm test         # runs the unit tests for the cash logic (Node 18+)
```

To use it on your phone, host the folder on any static host (for example GitHub Pages) and open it there.
You can then use "Add to Home Screen" to open it like an app.

## Layout

- `index.html`, `styles.css`, `app.js`: the UI
- `src/cash.js`: the cash logic, written as pure functions (totals, parsing, checking a transaction, applying it)
- `tests/`: unit tests for `src/cash.js`
