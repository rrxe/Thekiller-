import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./comic.css";
import "./comicx-v3.css";
import App from "./App.tsx";
import { LanguageProvider } from "./i18n/LanguageContext";

type ErrorBoundaryState = { error: Error | null };

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ComicX render error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{minHeight:"100vh",padding:24,display:"flex",alignItems:"center",justifyContent:"center",background:"#101318",color:"#fffbed",fontFamily:"system-ui,sans-serif",textAlign:"center"}}>
        <div style={{maxWidth:460}}>
          <div style={{fontSize:22,fontWeight:800,marginBottom:10}}>ComicX</div>
          <div style={{color:"#6d695f",lineHeight:1.6,fontSize:13}}>Please reopen the app.</div>
          <button type="button" onClick={() => window.location.reload()} style={{marginTop:16,border:"2px solid #11131a",background:"#ffd447",color:"#11131a",borderRadius:10,padding:"10px 16px",cursor:"pointer"}}>Retry</button>
        </div>
      </div>
    );
  }
}

function prepareTelegramWebApp() {
  try {
    const webApp = (window as any).Telegram?.WebApp;
    if (!webApp) return;
    webApp.ready?.();
    webApp.expand?.();
    webApp.setHeaderColor?.("#17120e");
    webApp.setBackgroundColor?.("#f6edd9");
  } catch (error) {
    console.warn("Telegram WebApp setup failed", error);
  }
}

prepareTelegramWebApp();

const root = document.getElementById("root");
if (!root) throw new Error("ComicX root element was not found");

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ErrorBoundary>
  </StrictMode>,
);
