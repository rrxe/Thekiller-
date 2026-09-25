import { useEffect, useMemo, useState } from "react";
import UiIcons from "../components/UiIcons";
import { useLanguage } from "../i18n/LanguageContext";
import "../styles/profile.css";

type ActivityTone = "info" | "reward" | "exchange";
type Activity = { id:string; title:string; meta:string; tone:ActivityTone };
type WithdrawalHistoryEntry = { id:number; amount:number; method:"binance"|"bnb"; target:string|null; bnbAmount:number|null; status:"pending"|"completed"|"rejected"; createdAt:string };
type Props = { lifetimeCoins:number; lifetimeSpent:number; usdtBalance:number; activities:Activity[]; serverWalletAddress?:string|null; withdrawalHistory?:WithdrawalHistoryEntry[]; onOpenExchange:()=>void; onOpenWithdraw:()=>void; onWalletConnected?:(address:string)=>void; onWalletDisconnected?:()=>void };
const WALLET_STORAGE_KEY = "stormy.wallet.bep20.v1";
const TON_ADDRESS_PATTERN = /^(-?[0-9]:[a-fA-F0-9]{64}|[A-Za-z0-9_-]{48})$/;
function loadStoredAddress():string|null{try{const raw=window.localStorage.getItem(WALLET_STORAGE_KEY);return raw&&TON_ADDRESS_PATTERN.test(raw)?raw:null}catch{return null}}
function truncateAddress(address:string){return `${address.slice(0,6)}...${address.slice(-4)}`}
function formatHistoryDate(value:string){const date=new Date(value);return Number.isNaN(date.getTime())?"":date.toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
function formatHistoryTarget(entry:{method:"binance"|"bnb";target:string|null}){if(!entry.target)return "—";return entry.method==="bnb"&&entry.target.length>16?truncateAddress(entry.target):entry.target}

export default function Profile({ lifetimeCoins,lifetimeSpent,usdtBalance,serverWalletAddress,withdrawalHistory,onOpenExchange,onOpenWithdraw,onWalletConnected,onWalletDisconnected }:Props){
  const {t}=useLanguage();
  const STATUS_LABELS:Record<string,string>={pending:t("profile.statusPending"),completed:t("profile.statusApproved"),rejected:t("profile.statusRejected")};
  const [connectedAddress,setConnectedAddress]=useState<string|null>(()=>serverWalletAddress??loadStoredAddress());
  const [inputValue,setInputValue]=useState(""); const [error,setError]=useState(""); const [copied,setCopied]=useState(false); const [confirmingDisconnect,setConfirmingDisconnect]=useState(false);
  useEffect(()=>{if(!copied)return;const timer=window.setTimeout(()=>setCopied(false),1600);return()=>window.clearTimeout(timer)},[copied]);
  const usdApprox=useMemo(()=>`≈ $${usdtBalance.toFixed(2)}`,[usdtBalance]);
  const syncWalletToServer=async(address:string|null)=>{try{const initData=(window as any).Telegram?.WebApp?.initData||"";await fetch("/api/profile/wallet",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`tga ${initData}`},body:JSON.stringify({walletAddress:address})})}catch{}};
  const handleConnect=()=>{const trimmed=inputValue.trim();if(!trimmed)return setError(t("profile.errorEmptyAddress"));if(!TON_ADDRESS_PATTERN.test(trimmed))return setError(t("profile.errorInvalidAddress"));try{window.localStorage.setItem(WALLET_STORAGE_KEY,trimmed)}catch{}setConnectedAddress(trimmed);setInputValue("");setError("");syncWalletToServer(trimmed);onWalletConnected?.(trimmed)};
  const handleDisconnect=()=>{try{window.localStorage.removeItem(WALLET_STORAGE_KEY)}catch{}setConnectedAddress(null);setConfirmingDisconnect(false);syncWalletToServer(null);onWalletDisconnected?.()};
  const handleCopy=async()=>{if(!connectedAddress)return;try{await navigator.clipboard.writeText(connectedAddress);setCopied(true)}catch{}};
  return <section className="profile-page">
    <section className="identity-card">
      <div className="profile-avatar">C<span>X</span></div><div className="identity-main"><span className="profile-kicker">COMICX / PROFILE</span><h1>{connectedAddress?t("profile.walletConnected"):t("profile.connectWallet")}</h1><p>{t("profile.walletLead")}</p></div><div className="identity-chip">TON</div>
      <div className="identity-balance"><span>{t("profile.usdt")}</span><strong>{usdtBalance.toFixed(4)}</strong><small>{usdApprox}</small></div>
      <div className="identity-balance coins"><span>{t("profile.earned")}</span><strong>{lifetimeCoins.toLocaleString()}</strong><small>{t("profile.exchanged")}: {lifetimeSpent.toLocaleString()}</small></div>
    </section>

    <section className={`wallet-vault ${connectedAddress?"connected":""}`}>
      <div className="vault-heading"><span>WALLET VAULT</span><i>●</i></div>
      {connectedAddress?<>
        <div className="vault-address"><small>{t("profile.connectedAddress")}</small><strong>{truncateAddress(connectedAddress)}</strong></div>
        <div className="vault-actions"><button onClick={handleCopy}>{copied?t("profile.copied"):t("profile.copy")}</button><button className="danger" onClick={()=>setConfirmingDisconnect(true)}>{t("profile.disconnect")}</button></div>
        {confirmingDisconnect?<div className="vault-confirm"><span>{t("profile.disconnectConfirm")}</span><div><button onClick={()=>setConfirmingDisconnect(false)}>{t("profile.cancel")}</button><button className="danger" onClick={handleDisconnect}>{t("profile.disconnect")}</button></div></div>:null}
      </>:<>
        <div className="vault-connect"><input value={inputValue} onChange={(e)=>{setInputValue(e.target.value);if(error)setError("")}} placeholder={t("profile.walletPlaceholder")} spellCheck={false} autoCapitalize="off" autoCorrect="off"/><button onClick={handleConnect}>{t("profile.connect")}</button></div>
        {error?<p className="vault-error">{error}</p>:null}
      </>}
    </section>

    <section className="profile-actions"><button className="action-main" onClick={onOpenExchange}><span><UiIcons name="exchange"/></span><div><small>COINS → USDT</small><strong>{t("profile.exchangeCoins")}</strong></div><b>↗</b></button><button className="action-secondary" onClick={onOpenWithdraw}><span><UiIcons name="withdraw"/></span><div><small>USDT</small><strong>{t("profile.withdrawUsdt")}</strong></div><b>→</b></button></section>

    <section className="history-panel"><div className="history-heading"><div><span>{t("profile.yourRequests")}</span><h2>{t("profile.withdrawalHistory")}</h2></div><UiIcons name="withdraw"/></div>{!withdrawalHistory||withdrawalHistory.length===0?<div className="history-empty">{t("profile.noWithdrawalsYet")}</div>:<div className="history-list">{withdrawalHistory.map((entry)=><div key={entry.id} className="history-item"><div className="history-index">#{entry.id}</div><div className="history-details"><strong>{Number(entry.amount).toFixed(4)} USDT</strong><small>{entry.method==="binance"?t("profile.binanceId"):t("profile.gramWallet")} · {formatHistoryTarget(entry)}</small><small>{formatHistoryDate(entry.createdAt)}</small></div><span className={`history-status ${entry.status}`}>{STATUS_LABELS[entry.status]||entry.status}</span></div>)}</div>}</section>
  </section>;
}
