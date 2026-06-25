// E1.1 — Spike gasless con cuenta STOCK (de-riesga la infra ANTES de tocar Solidity).
//
// Qué prueba: que con la key de Pimlico podemos (1) crear una smart account ERC-4337,
// (2) que el Paymaster patrocine el gas y (3) mandar una UserOperation que se incluye
// on-chain en Sepolia — todo sin que la cuenta tenga ETH propio.
//
// Correr:  cd spike && npm install && npm run gasless
// Requiere en ../.env: PIMLICO_API_KEY, SEPOLIA_RPC_URL, PRIVATE_KEY (wallet de prueba).

import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { entryPoint07Address } from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";

const apiKey = process.env.PIMLICO_API_KEY;
const rpcUrl = process.env.SEPOLIA_RPC_URL;
let pk = process.env.PRIVATE_KEY;

if (!apiKey) { console.error("❌ Falta PIMLICO_API_KEY en .env"); process.exit(1); }
if (!rpcUrl) { console.error("❌ Falta SEPOLIA_RPC_URL en .env"); process.exit(1); }
if (!pk) { console.error("❌ Falta PRIVATE_KEY en .env"); process.exit(1); }
if (!pk.startsWith("0x")) pk = "0x" + pk;

const owner = privateKeyToAccount(pk);
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });

// Una sola URL de Pimlico sirve para bundler Y paymaster.
const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${apiKey}`;
const pimlicoClient = createPimlicoClient({
  transport: http(pimlicoUrl),
  entryPoint: { address: entryPoint07Address, version: "0.7" },
});

// Cuenta STOCK (SimpleAccount de permissionless) — en E1.3 la cambiamos por la propia.
const account = await toSimpleSmartAccount({
  client: publicClient,
  owner,
  entryPoint: { address: entryPoint07Address, version: "0.7" },
});

console.log("EOA owner       :", owner.address);
console.log("Smart account   :", account.address);
const code = await publicClient.getCode({ address: account.address });
console.log("¿Ya desplegada? :", code && code !== "0x" ? "sí" : "no (se despliega en la 1ra UserOp)");

const smartAccountClient = createSmartAccountClient({
  account,
  chain: sepolia,
  bundlerTransport: http(pimlicoUrl),
  paymaster: pimlicoClient,
  userOperation: {
    estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
  },
});

console.log("\nMandando UserOp gasless (0 wei a 0x…dEaD, gas pagado por el Paymaster)…");
const txHash = await smartAccountClient.sendTransaction({
  to: "0x000000000000000000000000000000000000dEaD",
  value: 0n,
  data: "0x",
});

console.log("\n✅ Tx incluida:", txHash);
console.log("Etherscan : https://sepolia.etherscan.io/tx/" + txHash);
console.log("Jiffyscan : https://jiffyscan.xyz/tx/" + txHash + "?network=sepolia");
