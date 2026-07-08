# Security

Security notes for the aa-smart-wallet (ERC-4337) contracts: trust model, adversarial
review, and static-analysis triage. Written for a reviewer.

- **Scope:** [`src/MinimalAccount.sol`](src/MinimalAccount.sol) (ERC-4337 account) and
  [`src/AccountFactory.sol`](src/AccountFactory.sol) (CREATE2 counterfactual factory).
  `DemoCounter` is a test target. Dependencies (`lib/`, `@account-abstraction`) are out
  of scope.
- **Last reviewed:** F1 pass, 2026-07-08.
- **Prior hardening:** F0 brought all three contracts to 100% coverage, added an
  invariant, and a gas-snapshot CI check.

> ⚠️ **Portfolio / testnet posture.** A single `owner` EOA fully controls each account
> (as intended for a minimal account). Not audited for mainnet value.

## Verification performed

| Check | Result |
|---|---|
| `forge test` | **16 passed, 0 failed** (unit + fuzz + 1 invariant) |
| Slither (solc via foundry) | 6 results, **none actionable** — triage below |
| Manual adversarial review | No High/Medium |

## Trust model

An ERC-4337 minimal account is, by design, fully controlled by its `owner`. The security
properties that matter here are: (1) **only** the owner can authorize actions, and
(2) the account plugs into the EntryPoint correctly.

- **Signature validation.** `_validateSignature` reconstructs the EIP-191
  (`personal_sign`) hash of the `userOpHash` and returns `SIG_VALIDATION_SUCCESS` **only**
  if `ECDSA.recover` matches `owner`, else `SIG_VALIDATION_FAILED` (never reverts — the
  EntryPoint expects the sentinel). The nonce/replay and prefund handling come from the
  audited `BaseAccount` wrapper.
- **Execution gate.** `execute`/`executeBatch` are guarded by
  `requireFromEntryPointOrOwner` — reachable only via a validated UserOp (EntryPoint) or
  the owner directly. `owner` is `immutable`.
- **Factory determinism.** `getAddress` and `createAccount` hash the **same**
  `creationCode + (entryPoint, owner)` under the same salt, so the counterfactual address
  equals the deployed one; `createAccount` is idempotent (returns the existing account if
  code is already present), preventing redeploy/griefing on a known address.

## Static analysis (Slither)

6 results, **all non-actionable** — they flag exactly the mechanisms that make a smart
wallet a smart wallet:

| Detector | Verdict |
|---|---|
| `low-level-calls` (`dest.call{value:}` in `execute`/`executeBatch`) | **Intentional.** Arbitrary low-level call IS the wallet's purpose; it is owner/EntryPoint-gated and the return is checked (reverts with `MinimalAccount__CallFailed`). |
| `calls-loop` (`executeBatch` loop) | **Intentional.** Batching multiple calls in one UserOp; owner-gated, each call's success is checked. |
| `missing-zero-check` (`anOwner` in constructor, `dest` in `execute`) | **Accepted.** A zero `owner` would only brick that one account (the deployer's own choice/counterfactual); `dest` is chosen by the authorized owner per call — a zero-check would add gas without adding a security property. |
| `too-many-digits` (`creationCode` literal in `getAddress`) | **False positive.** It is the compiler-provided `type(MinimalAccount).creationCode`, not a hand-typed literal. |

## Residual risks (known, accepted)

1. **Single-key account** — no social recovery / multisig / session keys; loss or
   compromise of the owner key is total loss of the account. This is the intended
   "minimal" scope; richer authorization is out of scope for this piece.

## Reporting

Personal portfolio project — open an issue or contact the author rather than disclosing
publicly.
