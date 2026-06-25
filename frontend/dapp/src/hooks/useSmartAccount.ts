import { useState, useCallback, useEffect } from "react";
import type { Address, WalletClient } from "viem";
import { buildSmartAccount, readCounter, isDeployed, COUNTER, incrementCallData } from "../lib/aa";

export type TxStatus = "idle" | "pending" | "confirmed" | "error";

export interface SmartAccountState {
  accountAddress: Address | null;
  deployed: boolean;
  myCount: bigint;
  totalCount: bigint;
  isLoading: boolean;
  txStatus: TxStatus;
  txHash: string | null;
  txError: string | null;
  doIncrement: () => Promise<void>;
  resetTx: () => void;
  ready: boolean;
}

export function useSmartAccount(
  walletClient: WalletClient | null,
  owner: Address | null,
  chainId: number | null,
): SmartAccountState {
  const [client, setClient] = useState<Awaited<ReturnType<typeof buildSmartAccount>> | null>(null);
  const [accountAddress, setAccountAddress] = useState<Address | null>(null);
  const [deployed, setDeployed] = useState(false);
  const [myCount, setMyCount] = useState(0n);
  const [totalCount, setTotalCount] = useState(0n);
  const [isLoading, setIsLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const ready = !!walletClient && !!owner && chainId === 11155111;

  const refresh = useCallback(async (addr: Address | null) => {
    if (!addr) return;
    try {
      const [{ mine, total }, dep] = await Promise.all([readCounter(addr), isDeployed(addr)]);
      setMyCount(mine);
      setTotalCount(total);
      setDeployed(dep);
    } catch {
      /* lecturas best-effort */
    }
  }, []);

  // Construye el cliente de la smart account cuando hay wallet en Sepolia.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!ready || !owner || !walletClient) {
        setClient(null);
        setAccountAddress(null);
        return;
      }
      try {
        setIsLoading(true);
        const built = await buildSmartAccount(owner, walletClient);
        if (cancelled) return;
        setClient(built);
        setAccountAddress(built.accountAddress);
        await refresh(built.accountAddress);
      } catch (e) {
        if (!cancelled) setTxError(e instanceof Error ? e.message : "Error al inicializar la cuenta");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, owner, walletClient, refresh]);

  const doIncrement = useCallback(async () => {
    if (!client) return;
    setTxStatus("pending");
    setTxError(null);
    setTxHash(null);
    try {
      const hash = await client.smartAccountClient.sendTransaction({
        to: COUNTER,
        value: 0n,
        data: incrementCallData(),
      });
      setTxHash(hash);
      setTxStatus("confirmed");
      await refresh(client.accountAddress);
    } catch (e: unknown) {
      setTxStatus("error");
      setTxError(e instanceof Error ? e.message.slice(0, 220) : "Error al mandar la UserOp");
    }
  }, [client, refresh]);

  const resetTx = useCallback(() => {
    setTxStatus("idle");
    setTxHash(null);
    setTxError(null);
  }, []);

  return {
    accountAddress, deployed, myCount, totalCount, isLoading,
    txStatus, txHash, txError, doIncrement, resetTx, ready,
  };
}
