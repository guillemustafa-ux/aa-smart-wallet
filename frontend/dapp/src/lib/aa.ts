import {
  createPublicClient,
  http,
  encodeFunctionData,
  type Address,
  type Hex,
  type WalletClient,
  type SignableMessage,
} from "viem";
import { sepolia } from "viem/chains";
import {
  toSmartAccount,
  entryPoint07Address,
  entryPoint07Abi,
  getUserOperationHash,
} from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";

// ── Red y contratos (desplegados + verificados en Sepolia, E1.2-deploy) ───────
export const CHAIN = sepolia;
export const FACTORY: Address = "0xA54A593141328CB7e44987487b8757A5444025C6";
export const COUNTER: Address = "0x6DF770026D4dC7cd368423261fA1f12eE0B76993";
export const ENTRYPOINT: Address = entryPoint07Address;
export const SALT = 0n;

export const NETWORKS: Record<number, { name: string; explorer: string }> = {
  11155111: { name: "Sepolia", explorer: "https://sepolia.etherscan.io" },
};

// ⚠️ En un demo de testnet la key de Pimlico va embebida en el cliente. En producción
//    se proxea por un backend o se restringe con sponsorship policies (ver README).
const PIMLICO_API_KEY = import.meta.env.VITE_PIMLICO_API_KEY ?? "";
export const PIMLICO_URL = `https://api.pimlico.io/v2/${CHAIN.id}/rpc?apikey=${PIMLICO_API_KEY}`;

// Stub de 65 bytes para la estimación de gas (firma estructuralmente válida, recupera
// una dirección cualquiera → SIG_VALIDATION_FAILED sin revertir). Evita pedir firma real.
const STUB_SIG: Hex =
  "0xd0a374462c98909ff425259804dbe91bb2d4415aa2e95dc24664ce60a914e1cf5f41dd0b9acdb9582729660806603ab1e0c4d91da040fa680c0661cc8905fbbd1b";

// ── ABIs mínimas ──────────────────────────────────────────────────────────────
export const factoryAbi = [
  { type: "function", name: "createAccount", stateMutability: "nonpayable",
    inputs: [{ name: "owner", type: "address" }, { name: "salt", type: "uint256" }],
    outputs: [{ name: "account", type: "address" }] },
  { type: "function", name: "getAddress", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "salt", type: "uint256" }],
    outputs: [{ name: "", type: "address" }] },
] as const;

export const accountAbi = [
  { type: "function", name: "execute", stateMutability: "nonpayable",
    inputs: [{ name: "dest", type: "address" }, { name: "value", type: "uint256" }, { name: "func", type: "bytes" }],
    outputs: [] },
  { type: "function", name: "executeBatch", stateMutability: "nonpayable",
    inputs: [{ name: "dest", type: "address[]" }, { name: "value", type: "uint256[]" }, { name: "func", type: "bytes[]" }],
    outputs: [] },
] as const;

export const counterAbi = [
  { type: "function", name: "increment", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "countOf", stateMutability: "view",
    inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "total", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

// Cliente de lectura (RPC público de Sepolia, o el de .env si se setea).
export const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http(import.meta.env.VITE_SEPOLIA_RPC_URL),
});

// ── Construye el cliente de la smart account propia, listo para mandar UserOps ──
export async function buildSmartAccount(ownerAddress: Address, walletClient: WalletClient) {
  // Dirección counterfactual según NUESTRO factory (igual que en los tests Foundry).
  const accountAddress = (await publicClient.readContract({
    address: FACTORY, abi: factoryAbi, functionName: "getAddress", args: [ownerAddress, SALT],
  })) as Address;

  const pimlicoClient = createPimlicoClient({
    transport: http(PIMLICO_URL),
    entryPoint: { address: ENTRYPOINT, version: "0.7" },
  });

  const account = await toSmartAccount({
    client: publicClient,
    entryPoint: { abi: entryPoint07Abi, address: ENTRYPOINT, version: "0.7" },
    async getAddress() {
      return accountAddress;
    },
    async getFactoryArgs() {
      return {
        factory: FACTORY,
        factoryData: encodeFunctionData({
          abi: factoryAbi, functionName: "createAccount", args: [ownerAddress, SALT],
        }),
      };
    },
    async encodeCalls(calls) {
      if (calls.length === 1) {
        const c = calls[0];
        return encodeFunctionData({
          abi: accountAbi, functionName: "execute", args: [c.to, c.value ?? 0n, c.data ?? "0x"],
        });
      }
      return encodeFunctionData({
        abi: accountAbi, functionName: "executeBatch",
        args: [calls.map((c) => c.to), calls.map((c) => c.value ?? 0n), calls.map((c) => c.data ?? "0x")],
      });
    },
    async getStubSignature() {
      return STUB_SIG;
    },
    async signUserOperation(parameters) {
      const { chainId = CHAIN.id, ...userOperation } = parameters;
      const hash = getUserOperationHash({
        userOperation: { ...userOperation, sender: userOperation.sender ?? accountAddress },
        entryPointAddress: ENTRYPOINT,
        entryPointVersion: "0.7",
        chainId,
      });
      // personal_sign (EIP-191) → matchea MinimalAccount._validateSignature on-chain.
      return await walletClient.signMessage({ account: ownerAddress, message: { raw: hash } });
    },
    // ERC-1271 / firmas genéricas: se delegan al owner. No se usan en el demo de increment.
    async signMessage({ message }: { message: SignableMessage }) {
      return walletClient.signMessage({ account: ownerAddress, message });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async signTypedData(typedData: any): Promise<Hex> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return walletClient.signTypedData({ account: ownerAddress, ...typedData } as any);
    },
  });

  const smartAccountClient = createSmartAccountClient({
    account,
    chain: CHAIN,
    bundlerTransport: http(PIMLICO_URL),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
    },
  });

  return { accountAddress, smartAccountClient };
}

// Lecturas de estado del demo.
export async function readCounter(account: Address) {
  const [mine, total] = await Promise.all([
    publicClient.readContract({ address: COUNTER, abi: counterAbi, functionName: "countOf", args: [account] }),
    publicClient.readContract({ address: COUNTER, abi: counterAbi, functionName: "total" }),
  ]);
  return { mine: mine as bigint, total: total as bigint };
}

export async function isDeployed(account: Address) {
  const code = await publicClient.getCode({ address: account });
  return !!code && code !== "0x";
}

export const incrementCallData = () =>
  encodeFunctionData({ abi: counterAbi, functionName: "increment" });
