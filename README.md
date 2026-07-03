# MinimalAccount — Smart Wallet ERC-4337 con gas patrocinado (gasless)

Una **smart wallet (account abstraction, ERC-4337)** de punta a punta: contrato de cuenta
propio en Solidity + factory determinística + dApp que ejecuta una acción on-chain **sin que
la cuenta tenga ETH** — el usuario solo firma y un **Paymaster** paga el gas.

> Portfolio de [@guillemustafa-ux](https://github.com/guillemustafa-ux). Stack: Solidity + Foundry + OpenZeppelin · viem + permissionless.js · Pimlico (bundler + paymaster) · React/Vite/TS/Tailwind.

## 🔗 En vivo

- **dApp:** [aa-smart-wallet.vercel.app](https://aa-smart-wallet.vercel.app)
- **Red:** Sepolia · **EntryPoint v0.7:** [`0x0000…da032`](https://sepolia.etherscan.io/address/0x0000000071727De22E5E9d8BAf0edAc6f37da032)

### Contratos desplegados y verificados (tilde verde en Etherscan)

| Contrato | Dirección |
| --- | --- |
| `AccountFactory` | [`0xA54A593141328CB7e44987487b8757A5444025C6`](https://sepolia.etherscan.io/address/0xA54A593141328CB7e44987487b8757A5444025C6) |
| `DemoCounter` | [`0x6DF770026D4dC7cd368423261fA1f12eE0B76993`](https://sepolia.etherscan.io/address/0x6DF770026D4dC7cd368423261fA1f12eE0B76993) |

### Pruebas gasless reales en Sepolia

- Cuenta con **0 ETH** ejecutando una acción, gas pagado por el paymaster:
  [`0xebbdbf38…c82a6a`](https://sepolia.etherscan.io/tx/0xebbdbf38c7f381e03c97663fa823ac5594beb462e528f850b8169a3d39c82a6a)
  (la smart account `0xd4C3…ED74` se autodesplegó en esa misma UserOp y llamó `DemoCounter.increment()`).

## 🧠 Qué es account abstraction (y por qué importa)

En Ethereum "normal" tu wallet es un **EOA** (una clave privada) y para hacer cualquier cosa
necesitás ETH para el gas. ERC-4337 reemplaza eso por una **cuenta que es un contrato**: define
sus propias reglas de validación y **otro puede pagarle el gas**. Eso habilita onboarding sin
fricción (el usuario no necesita ETH), pago de gas en otros tokens, transacciones en lote, social
recovery, etc.

Flujo de una `UserOperation`:

```
Usuario firma UserOp ──▶ Bundler ──▶ EntryPoint ──▶ tu cuenta.validateUserOp() ──▶ ejecuta
                                          │
                                     Paymaster paga el gas
```

## 🏗️ Arquitectura

| Pieza | Rol |
| --- | --- |
| [`src/MinimalAccount.sol`](src/MinimalAccount.sol) | La cuenta. Hereda `BaseAccount`; valida que la UserOp esté firmada por el `owner` (ECDSA/EIP-191) y ejecuta `execute` / `executeBatch`. |
| [`src/AccountFactory.sol`](src/AccountFactory.sol) | Despliega cuentas con `CREATE2` → dirección **counterfactual** (se conoce antes de existir; el EntryPoint la crea en la 1ra UserOp vía `initCode`). |
| [`src/DemoCounter.sol`](src/DemoCounter.sol) | Target trivial del demo (`increment()`). |
| EntryPoint v0.7 | Singleton canónico de ERC-4337 (no se redepliega). |
| Pimlico | Bundler + Paymaster de patrocinio (vía `permissionless.js`). |
| `frontend/dapp` | dApp en viem + permissionless: conectás un EOA (owner), firmás la UserOp, el paymaster paga. |

## ✅ Tests (Foundry)

8 tests, incluida una prueba de **integración real** que recorre `EntryPoint.handleOps`:

```bash
forge test -vv
```

Cubren: dirección determinística del factory, `validateUserOp` (firma válida → `0`, inválida → `1`),
control de acceso de `execute`, fuzz de firmantes, y el ciclo completo UserOp → handleOps → cambio
de estado del target.

## 🚀 Cómo correr

```bash
# 1) Tests
forge test -vv

# 2) Deploy a Sepolia (necesita .env con PRIVATE_KEY, SEPOLIA_RPC_URL, ETHERSCAN_API_KEY)
cp .env.example .env   # y completá
forge script script/Deploy.s.sol:Deploy --rpc-url sepolia --broadcast --verify -vvvv

# 3) Spike gasless (prueba el flujo end-to-end desde Node)
cd spike && npm install && npm run gasless         # cuenta stock
npm run gasless:custom                              # nuestra cuenta propia

# 4) Frontend
cd frontend/dapp && npm install
echo "VITE_PIMLICO_API_KEY=tu_key" > .env
npm run dev
```

## 🔒 Nota de seguridad

Este es un **demo de testnet**: la API key de Pimlico va embebida en el cliente (`VITE_*`).
En producción el paymaster se proxea por un backend o se restringe con **sponsorship policies**
de Pimlico (origen/contratos permitidos). Las claves privadas reales nunca van al repo (`.env`
está en `.gitignore`); el deploy usa una wallet de prueba descartable.

## 📂 Estructura

```
src/         MinimalAccount.sol · AccountFactory.sol · DemoCounter.sol
test/        MinimalAccount.t.sol (8 tests)
script/      Deploy.s.sol
spike/       gasless.mjs (cuenta stock) · gasless-custom.mjs (cuenta propia)
frontend/    dApp viem + permissionless (React/Vite/TS/Tailwind)
```
