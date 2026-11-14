# LaunchDesk

**Your startup team, for pennies.**

Pitch your idea. An AI team validates it, plans it and builds your launch kit.
Pay in BCH only for the stages you need. Never pay for a bad idea again.

Built for **BCH BLAZE 2026** (Mainnet track).

## How it works

1. **Nova — Validation (10¢).** Score out of 100, go / pivot / no-go, market, competitors, risks and the cheapest test to run this week.
2. **You decide.** Stop and keep your money, or go further.
3. **Max — Business plan (25¢).** Customers, pricing, channels, costs and a 90-day roadmap.
4. **Pip — Launch kit (25¢).** Names, tagline, landing page copy, social posts, launch email and checklist.

Each stage is paid on Bitcoin Cash mainnet through **WizardConnect** (Selene, Cashonize, Paytaca).

## Payments

- The browser builds the transaction from the wallet's coins; the wallet signs it via WizardConnect.
- The transaction pays the merchant address and carries an `OP_RETURN` tag `LD1:<project>:<stage>` that binds it to one order.
- The server decodes it, checks the amount and the tag, broadcasts it, and only then runs the AI. Each transaction can be used once.

## Run locally

```bash
cp .env.example .env   # MOCK_AI=1 runs without an API key
npm install
npm run dev            # web on :5173, API on :8787
npm test
```

## Pre-existing work

The idea and a visual sketch existed before the hackathon. No code was reused: all the code in this repository was written during BLAZE 2026 (14–22 Nov 2026).

## Licence

MIT for this code. WizardConnect libraries are LGPL-3.0-or-later.
