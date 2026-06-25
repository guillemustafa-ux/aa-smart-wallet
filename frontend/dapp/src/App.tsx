import { useWallet } from "./hooks/useWallet";
import { useSmartAccount } from "./hooks/useSmartAccount";
import { ConnectWallet } from "./components/ConnectWallet";
import { NetworkBadge } from "./components/NetworkBadge";
import { SmartWalletCard } from "./components/SmartWalletCard";
import { NETWORKS, FACTORY, COUNTER } from "./lib/aa";

export default function App() {
  const wallet = useWallet();
  const sa = useSmartAccount(wallet.walletClient, wallet.account, wallet.chainId);

  const net = wallet.chainId ? NETWORKS[wallet.chainId] : null;

  async function switchToSepolia() {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }],
      });
    } catch {
      /* el usuario canceló o la red no está agregada */
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col">
      {/* ── Header ── */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight">MinimalAccount</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 border border-slate-700 select-none">
            ERC-4337 · gasless · testnet
          </span>
        </div>
        <div className="flex items-center gap-3">
          <NetworkBadge chainId={wallet.chainId} onSwitch={switchToSepolia} />
          <ConnectWallet
            account={wallet.account}
            isConnecting={wallet.isConnecting}
            onConnect={wallet.connect}
            onDisconnect={wallet.disconnect}
          />
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 gap-8">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-bold mb-2 tracking-tight">Smart wallet con gas patrocinado</h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            Una cuenta inteligente <code className="text-blue-400 text-xs bg-blue-950/40 px-1 py-0.5 rounded">ERC-4337</code>{" "}
            (contrato <code className="text-blue-400 text-xs bg-blue-950/40 px-1 py-0.5 rounded">MinimalAccount</code> propio)
            ejecuta una acción on-chain sin tener ETH: vos firmás la <em>UserOperation</em> y un{" "}
            <em>Paymaster</em> paga el gas. Account abstraction de punta a punta.
          </p>
        </div>

        <SmartWalletCard account={wallet.account} chainId={wallet.chainId} sa={sa} />

        {wallet.error && (
          <p className="text-sm text-red-400 text-center max-w-sm">{wallet.error}</p>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800 px-6 py-4 text-center text-xs text-slate-600 flex flex-col gap-1">
        {net && (
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a href={`${net.explorer}/address/${FACTORY}`} target="_blank" rel="noopener noreferrer" className="hover:text-slate-400 transition-colors">
              AccountFactory ↗
            </a>
            <span className="opacity-30">|</span>
            <a href={`${net.explorer}/address/${COUNTER}`} target="_blank" rel="noopener noreferrer" className="hover:text-slate-400 transition-colors">
              DemoCounter ↗
            </a>
          </div>
        )}
        <span>MinimalAccount — ERC-4337 con Solidity + Foundry · cuenta propia + Pimlico (bundler/paymaster)</span>
      </footer>
    </div>
  );
}
