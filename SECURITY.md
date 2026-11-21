# Security: what LaunchDesk can and cannot do with your money

This page covers the **10¢ idea report** ("Validate"). When escrow is on (`ESCROW=1`), that payment goes into a small
Bitcoin Cash contract, not straight to us. The contract is [`contracts/LaunchDeskEscrow.cash`](contracts/LaunchDeskEscrow.cash)
(about 45 lines). The 50¢ launch kit and the "offices" tasks are **not** in escrow. They are plain payments to our
address.

## The short version

- Your wallet pays a contract address made for your order alone.
- From there the coins can go to **only two places**:
  1. **To LaunchDesk**, together with an on-chain fingerprint of the report we delivered.
  2. **Back to your own wallet address** (the one that paid), once about an hour has passed.
- We cannot send your coins anywhere else. Nobody else can either. That holds even if someone steals our server key.

## The two ways out of the contract

### 1. Release: LaunchDesk is paid
For a release, the contract checks all of this. If any check fails, the transaction is invalid and no node accepts it.
- The transaction is signed by the LaunchDesk release key.
- It carries a signature from the LaunchDesk report key over *(your order id + the report's SHA-256 fingerprint)*.
- It has exactly one input and exactly two outputs.
- Output 1 pays the LaunchDesk merchant address, and holds the whole amount minus a network fee of at most 2,000 sats.
- Output 1 creates no tokens.
- Output 2 is an `OP_RETURN` with exactly `"LD1"` and the 32-byte report fingerprint, and holds 0 sats.

### 2. Refund: you get your money back
- It opens **6 blocks after your payment confirms** (about one hour). The contract enforces this with a relative time
  lock (BIP68/BIP112).
- **It needs no signature.** We do not have to approve it, and neither do you. Anyone may broadcast it: our server,
  you, or a stranger.
- The contract allows exactly one output. That output must pay **your own address** with the whole amount minus a
  network fee of at most 2,000 sats.
- Our server's watcher sends the refund on its own when no report was delivered in time. The page also has a
  "Get my refund now" button once the hour is up.

### What the 2,000-sat fee limit means for you
Whoever builds the release or the refund chooses the network fee, up to 2,000 sats. At about $206 per BCH (the price on
16 Nov 2026), that is under one US cent. It is the most you can lose this way. Our own builder pays about 1 sat per byte
(599 sats on the mainnet release below).

### Both ways are open after the hour
The contract does not close the release path when the hour is up. After the timeout, a release and a refund are both
valid, and the first one mined wins. Our server **chooses** to refund instead of release once the timeout has passed
(`server/escrow/watch.ts`). That is a rule in our server code, not in the contract.

## Who holds which keys

| Key | Who has it | What it can do |
|---|---|---|
| Your wallet key | You only (for example in Selene) | Sends the payment. We never see it: your wallet signs through WizardConnect |
| LaunchDesk release key (`ESCROW_WIF`) | Our server, as a secret setting on the host | Signs a release. A release can only pay the merchant address |
| LaunchDesk report key (`ESCROW_ORACLE_WIF`) | Our server. **If it is not set, it is the same key as the release key** | Signs "this report was delivered for this order" |
| Refund | Nobody: it needs no key | Sends the coins back to your address after the timeout |

- The keys are never in the repository. `.env` is git-ignored, and `contracts/keygen.mjs` prints a fresh key for you
  to store yourself.
- Each order's contract is built from **public keys only**. Those keys are stored with the order, so a refund still
  works after we change the server key.
- If our server is gone, you can still get a refund. [`contracts/refund-offline.ts`](contracts/refund-offline.ts)
  rebuilds the contract from its public settings and prints a refund transaction that anyone can broadcast. It needs
  the order reference, your address, the funding coin and our public keys. While your payment waits in the contract,
  the proof panel under the report has **"Download refund details"**: a text file with those public values and the
  exact command to run. Your own refund address is filled in only for the browser that started the project (owner
  key); anyone else gets a placeholder.
- **One key today.** In production `ESCROW_ORACLE_WIF` is not set, so the report key equals the release key. The
  release signature already covers the `OP_RETURN`, so the report signature is not a second factor yet. It is a hook
  for a future independent checker with its own key, kept off the web host. Your protection does not depend on it:
  the contract only allows the two ways out above.

## The honest caveat: what the fingerprint proves, and what it does not

The release needs a signature from **our** report key. So the on-chain fingerprint proves that:
- **we recorded this exact report** for this order,
- the report has not changed since (one changed byte gives a different fingerprint),
- and the money went to us only together with that record.

It does **not** prove that the report is any good. Our server signs it, and no outside judge does. A dishonest
operator holding both keys could release a payment with an empty report, and the chain would accept it. The contract
stops us from **taking your money somewhere else** or **taking it without a public record**. It cannot stop us from
delivering a bad report. What you get is a permanent, public fingerprint of exactly what you paid for, which you can
hold us to.

## How to check a report fingerprint yourself

1. On the report page, open **"Proof on Bitcoin Cash" → "Check it yourself"** and download the report data
   (`launchdesk-report.json`). It is the exact text that was fingerprinted. The PDF is a printout of the page, so its
   fingerprint is different.
2. Hash it:
   - Mac or Linux: `shasum -a 256 launchdesk-report.json`
   - Windows: `certutil -hashfile launchdesk-report.json SHA256`
3. Open the release transaction in a block explorer (the "See the record" link). The last output is an `OP_RETURN`.
   Its data is `4c4431` ("LD1"), then `20` (push 32 bytes), then the fingerprint. It must equal your hash.

The **"Check it"** button does steps 1 and 2 in your browser. It then compares the result with the fingerprint **our
server reports**. For an independent check, compare with the explorer as in step 3.

Real example on mainnet (16 Nov 2026), release
[`661ca57b…ee23`](https://blockchair.com/bitcoin-cash/transaction/661ca57bd66b7bbc61667724fb104c506b263f68474d6a068a97b5ba91abee23):
the `OP_RETURN` is `6a 03 4c4431 20 8447cc7290ece01c91673ef4eb8137c9332581040af710030aa3c9195350ecd5`.

## How the contract is tested

- `test/escrow.test.ts`: the normal paths and the main rejections.
- `test/escrow-flow.test.ts`: end to end through the real app: quote, pay, run, release, the refund drill, and a
  re-quote by someone who is not the owner (refused with 403, and the owner's contract address and refund address
  stay as they were).
- `test/escrow-attacks.test.ts`: 41 named attacks and controls. Each attack has a control that differs in only the one
  tampered detail, and the control passes. Most release attacks assume the attacker **holds both LaunchDesk keys**.
  They include:
  - paying another address, or a P2SH script with the merchant's hash;
  - a missing or forged report signature, or one over another hash or for another order;
  - a fee 1 sat over the limit;
  - extra outputs or inputs, or outputs in the wrong order;
  - a tampered `OP_RETURN`;
  - minting a token from the funding coin;
  - replaying a signature on another coin;
  - a refund before the timeout, with the lock disabled, or in a version 1 transaction;
  - a refund to another address, or for 1 sat less;
  - a refund that merges two payments so a miner keeps one.
- Every transaction is checked by the real BCH virtual machine (libauth, through CashScript's `MockNetworkProvider`),
  offline.
- **Mutation check (`npm run mutate`).** [`scripts/mutate-contract.mjs`](scripts/mutate-contract.mjs) removes each of
  the contract's 15 `require` lines one at a time, recompiles with cashc, and runs `escrow-attacks.test.ts` against
  that weaker contract, in a temporary copy. It prints a table. Result on 16 Nov 2026: 15 of 15 caught, so no single
  check in the contract is untested.
- **Limit:** the mock network does not track block heights. The tests check the sequence rules the contract enforces.
  The real wait (6 confirmations) is enforced by Bitcoin Cash nodes. On mainnet, both paths are proven (see the
  README): the release on 16 Nov 2026, and on 21 Nov 2026 a refund drill where an early refund was rejected by nodes
  (`non-BIP68-final`) and the keyless refund went through after 6 blocks (`33219ae2…e4d8`).
- No outside security review has been done.

## Other limits worth knowing

- Your refund goes to the address your wallet gave when you asked for the price. It must be a standard `q…` (P2PKH)
  address.
- Coins sent to the contract outside the app, a second payment to the same order, or a payment below the price are
  never released by our server and never start a run. Once such a coin is 6 blocks deep, the watcher sends it back
  through the same keyless refund (to the refund address of that order) within a few minutes. Coins too small to
  pay the network fee and still leave a valid output (dust) cannot be sent back.
- The watcher runs inside our web server. While the server is down, nothing is released or refunded automatically.
  The refund stays valid, and anyone can broadcast it later.
- Only the 10¢ report is held in the contract. The 50¢ launch kit is a plain payment to LaunchDesk, and its pay card
  says so.
- Asking for an escrow price with a refund address needs the owner key of the project, so nobody else can swap the
  contract address under your payment.
- Our server may release as soon as it has seen your payment, before it confirms. If a payment were double-spent
  after that, LaunchDesk would have delivered a report without being paid. That is a risk for us, not for you.
- **Accepted risk (0-conf):** the 10¢ report (and the other small payments) start the run on an unconfirmed payment; a
  double-spend could get one report for free, which at these prices we accept instead of making you wait for a block.

## What is public

- `GET /api/escrow/:id/:stage` (the order's state, transactions and public contract values) and
  `GET /api/escrow/:id/:stage/report` (the exact report bytes whose SHA-256 is on chain) need no key. This is on
  purpose: anyone holding the project link can already read the report, and the fingerprint is only useful if
  anyone can re-hash it. Your refund address is returned only with the owner key.
- The finished example on the home page has its proof at `GET /api/examples/:id/proof` and
  `GET /api/examples/:id/proof/report` (for example `ex-coffee-bcn`): the 16 Nov 2026 mainnet payment and release.

## Reporting a problem

If you find a way to move escrowed coins anywhere other than the two places above, or any other security issue:
- Open a GitHub issue that says only "security contact wanted", with no details, and we will reply with a private
  channel. Or use GitHub's private vulnerability reporting on this repository if it is enabled.
- Please do not test attacks against other people's orders on mainnet.
- No bug bounty is offered.
