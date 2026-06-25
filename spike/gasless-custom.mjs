// E1.2/E1.3 puente — Gasless con NUESTRA cuenta propia (MinimalAccount + AccountFactory).
//
// Valida el camino más riesgoso ANTES del frontend: que permissionless sepa
// desplegar/manejar nuestra cuenta (no la stock) y que un UserOp patrocinado
// llame DemoCounter.increment() — con la cuenta teniendo 0 ETH.
//
// Correr: cd spike && npm run gasless:custom

import { createPublicClient, http, encodeFunctionData } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  toSmartAccount,
  entryPoint07Address,
  entryPoint07Abi,
  getUserOperationHash,
} from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";

// --- Contratos desplegados en Sepolia (E1.2-deploy) ---
const FACTORY = "0xA54A593141328CB7e44987487b8757A5444025C6";
const COUNTER = "0x6DF770026D4dC7cd368423261fA1f12eE0B76993";
const SALT = 0n;

const apiKey = process.env.PIMLICO_API_KEY;
const rpcUrl = process.env.SEPOLIA_RPC_URL;
let pk = process.env.PRIVATE_KEY;
if (!apiKey || !rpcUrl || !pk) { console.error("❌ Faltan vars en .env"); process.exit(1); }
if (!pk.startsWith("0x")) pk = "0x" + pk;

const factoryAbi = [
  { type: "function", name: "createAccount", stateMutability: "nonpayable",
    inputs: [{ name: "owner", type: "address" }, { name: "salt", type: "uint256" }],
    outputs: [{ name: "account", type: "address" }] },
  { type: "function", name: "getAddress", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "salt", type: "uint256" }],
    outputs: [{ name: "", type: "address" }] },
];
const accountAbi = [
  { type: "function", name: "execute", stateMutability: "nonpayable",
    inputs: [{ name: "dest", type: "address" }, { name: "value", type: "uint256" }, { name: "func", type: "bytes" }],
    outputs: [] },
  { type: "function", name: "executeBatch", stateMutability: "nonpayable",
    inputs: [{ name: "dest", type: "address[]" }, { name: "value", type: "uint256[]" }, { name: "func", type: "bytes[]" }],
    outputs: [] },
];
const counterAbi = [
  { type: "function", name: "increment", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "countOf", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "total", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
];

const owner = privateKeyToAccount(pk);
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const pimlicoUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${apiKey}`;
const pimlicoClient = createPimlicoClient({
  transport: http(pimlicoUrl),
  entryPoint: { address: entryPoint07Address, version: "0.7" },
});

// Dirección counterfactual según NUESTRO factory.
const accountAddress = await publicClient.readContract({
  address: FACTORY, abi: factoryAbi, functionName: "getAddress", args: [owner.address, SALT],
});
console.log("EOA owner      :", owner.address);
console.log("Smart account  :", accountAddress, "(MinimalAccount propia)");

// Stub para la estimación de gas: una firma ESTRUCTURALMENTE válida de 65 bytes.
// No necesita ser la firma correcta (recupera otra dirección → SIG_VALIDATION_FAILED,
// sin revertir), solo tener largo 65 para que ECDSA.recover no rompa.
const STUB_SIG = await owner.signMessage({ message: "stub-for-gas-estimation" });

// Adaptador de cuenta propia para viem/permissionless.
const account = await toSmartAccount({
  client: publicClient,
  entryPoint: { abi: entryPoint07Abi, address: entryPoint07Address, version: "0.7" },
  async getAddress() { return accountAddress; },
  async getFactoryArgs() {
    return {
      factory: FACTORY,
      factoryData: encodeFunctionData({ abi: factoryAbi, functionName: "createAccount", args: [owner.address, SALT] }),
    };
  },
  async encodeCalls(calls) {
    if (calls.length === 1) {
      return encodeFunctionData({ abi: accountAbi, functionName: "execute",
        args: [calls[0].to, calls[0].value ?? 0n, calls[0].data ?? "0x"] });
    }
    return encodeFunctionData({ abi: accountAbi, functionName: "executeBatch",
      args: [calls.map(c => c.to), calls.map(c => c.value ?? 0n), calls.map(c => c.data ?? "0x")] });
  },
  async getStubSignature() { return STUB_SIG; },
  async signUserOperation(parameters) {
    const { chainId = sepolia.id, ...userOperation } = parameters;
    const hash = getUserOperationHash({
      userOperation: { ...userOperation, sender: userOperation.sender ?? accountAddress },
      entryPointAddress: entryPoint07Address,
      entryPointVersion: "0.7",
      chainId,
    });
    // personal_sign (EIP-191) → matchea MinimalAccount._validateSignature (toEthSignedMessageHash).
    return await owner.signMessage({ message: { raw: hash } });
  },
});

const smartAccountClient = createSmartAccountClient({
  account,
  chain: sepolia,
  bundlerTransport: http(pimlicoUrl),
  paymaster: pimlicoClient,
  userOperation: {
    estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
  },
});

const before = await publicClient.readContract({ address: COUNTER, abi: counterAbi, functionName: "countOf", args: [accountAddress] });
console.log("countOf antes  :", before.toString());

console.log("\nMandando UserOp gasless → DemoCounter.increment() …");
const txHash = await smartAccountClient.sendTransaction({
  to: COUNTER,
  value: 0n,
  data: encodeFunctionData({ abi: counterAbi, functionName: "increment" }),
});

const after = await publicClient.readContract({ address: COUNTER, abi: counterAbi, functionName: "countOf", args: [accountAddress] });
console.log("\n✅ Tx incluida :", txHash);
console.log("countOf después:", after.toString());
console.log("Etherscan      : https://sepolia.etherscan.io/tx/" + txHash);
