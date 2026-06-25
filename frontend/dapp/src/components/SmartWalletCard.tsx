import type { ReactNode } from "react";
import type { SmartAccountState } from "../hooks/useSmartAccount";
import { NETWORKS } from "../lib/aa";
import { TxStatus } from "./TxStatus";

interface Props {
  account: string | null;
  chainId: number | null;
  sa: SmartAccountState;
}

const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export function SmartWalletCard({ account, chainId, sa }: Props) {
  const isUnsupported = account !== null && chainId !== null && !NETWORKS[chainId];
  const isBusy = sa.txStatus === "pending";

  return (
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-7 shadow-2xl">
      {!account ? (
        <p className="text-center text-slate-400 py-8">Conectá tu wallet (será el "owner" que firma)</p>
      ) : isUnsupported ? (
        <p className="text-center text-yellow-400 py-8">Red no soportada — cambiá a Sepolia</p>
      ) : (
        <>
          <div className="border border-slate-800 rounded-xl overflow-hidden mb-5 text-sm">
            <InfoRow label="EOA owner (firma)">{short(account)}</InfoRow>
            <InfoRow label="Smart account">
              {sa.accountAddress ? (
                <span className="flex items-center gap-2">
                  {short(sa.accountAddress)}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                      sa.deployed
                        ? "bg-green-950/60 border-green-800 text-green-400"
                        : "bg-slate-800 border-slate-700 text-slate-500"
                    }`}
                  >
                    {sa.deployed ? "desplegada" : "counterfactual"}
                  </span>
                </span>
              ) : sa.isLoading ? (
                "calculando…"
              ) : (
                "—"
              )}
            </InfoRow>
            <InfoRow label="Tus increments">{sa.myCount.toString()}</InfoRow>
            <InfoRow label="Total global" last>
              {sa.totalCount.toString()}
            </InfoRow>
          </div>

          <button
            onClick={sa.doIncrement}
            disabled={isBusy || !sa.ready || !sa.accountAddress}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-colors cursor-pointer"
          >
            {isBusy ? "Procesando UserOp…" : "⚡ Incrementar (gasless)"}
          </button>

          <p className="text-xs text-slate-500 text-center mt-3 leading-relaxed">
            La smart account ejecuta <code className="text-blue-400">increment()</code> aunque tenga{" "}
            <strong>0 ETH</strong>. Vos solo firmás; el <em>Paymaster</em> de Pimlico paga el gas.
            {!sa.deployed && sa.accountAddress && " La primera vez también se despliega la cuenta, gratis."}
          </p>

          <TxStatus
            status={sa.txStatus}
            txHash={sa.txHash}
            txError={sa.txError}
            chainId={chainId}
            onDismiss={sa.resetTx}
          />
        </>
      )}
    </div>
  );
}

function InfoRow({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <div
      className={`flex justify-between items-center px-4 py-3 bg-slate-800/40 ${
        last ? "" : "border-b border-slate-800"
      }`}
    >
      <span className="text-slate-400">{label}</span>
      <code className="text-slate-100 font-mono text-xs">{children}</code>
    </div>
  );
}
