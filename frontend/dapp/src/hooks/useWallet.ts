import { useState, useCallback, useEffect } from "react";
import { createWalletClient, custom, type WalletClient, type Address } from "viem";
import { sepolia } from "viem/chains";

export interface WalletState {
  account: Address | null;
  chainId: number | null;
  walletClient: WalletClient | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useWallet(): WalletState {
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("No se detectó wallet. Instalá MetaMask.");
      return;
    }
    try {
      setIsConnecting(true);
      setError(null);
      const accounts: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
      const hexChain: string = await window.ethereum.request({ method: "eth_chainId" });
      const wc = createWalletClient({ chain: sepolia, transport: custom(window.ethereum) });
      setWalletClient(wc);
      setAccount(accounts[0] as Address);
      setChainId(parseInt(hexChain, 16));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al conectar");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
    setChainId(null);
    setWalletClient(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    const reload = () => window.location.reload();
    window.ethereum.on("accountsChanged", reload);
    window.ethereum.on("chainChanged", reload);
    return () => {
      window.ethereum?.removeListener("accountsChanged", reload);
      window.ethereum?.removeListener("chainChanged", reload);
    };
  }, []);

  // Auto-conecta si la wallet ya autorizó este sitio.
  useEffect(() => {
    if (window.ethereum?.selectedAddress) connect();
  }, [connect]);

  return { account, chainId, walletClient, isConnecting, error, connect, disconnect };
}
