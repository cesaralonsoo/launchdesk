# LaunchDesk

**Your startup team, for pennies.**

Pitch your idea. Seven AI specialists in a 3D office validate it, plan it and launch it.
Pay in BCH only for the stages you need. Never pay for a bad idea again.

Built for **BCH BLAZE 2026** (Mainnet track).

## How it works

1. **Stage 1 · Validate (10¢).** Mia (chief of staff) writes the brief and a 4-week plan, Leo (market research) scores the opportunity out of 10 with real competitors, Sam (strategy & finance) builds the business model, break-even and a 12-month projection. Estimates are labelled as estimates.
2. **You decide.** Go on, or stop and keep the report.
3. **Stage 2 · Build & Launch (20¢).** Nova (brand) proposes names, palette and voice, Dex (design) draws logo concepts and writes the landing page, Rae (marketing) plans a 30-day launch with ready-to-post copy, and Pip publishes the landing page at `/s/<slug>` with BCH pre-orders that go straight to the founder's wallet.
4. **Your startup pack.** Every result in one place, downloadable as a single HTML file, with a receipt of the real on-chain payments.

Each stage is paid on Bitcoin Cash mainnet through **WizardConnect** (Selene, Cashonize, Paytaca). Money moving between departments inside the office is internal bookkeeping and is always labelled "internal · not on-chain".

## Payments

- The browser builds the transaction from the wallet's coins; the wallet signs it via WizardConnect.
- The transaction pays the merchant address and carries an `OP_RETURN` tag `LD1:<project>:<stage>` that binds it to one order.
- The server decodes it, checks the amount and the tag, broadcasts it, and only then runs the AI. Each transaction can be used once.

## Run locally

```bash
cp .env.example .env   # MOCK_AI=1 runs without an API key
npm install
npm run dev            # web on :5173, API on :8790
npm test
```

## Pre-existing work

The idea and a visual sketch existed before the hackathon. No code was reused: all the code in this repository was written during BLAZE 2026 (14–22 Nov 2026).

## Licence

MIT for this code. WizardConnect libraries are LGPL-3.0-or-later.
