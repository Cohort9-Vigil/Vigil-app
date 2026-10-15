import { createRoot } from "react-dom/client";
import "./styles/landing.css";
import { ToastProvider } from "./state/toasts.tsx";
import { WalletProvider } from "./state/wallet.tsx";
import { StreamProvider } from "./state/stream.tsx";
import { applySavedTheme } from "./theme.ts";
import { LandingPage } from "./pages/LandingPage.tsx";

applySavedTheme();
createRoot(document.getElementById("root")!).render(
  <ToastProvider>
    <WalletProvider>
      <StreamProvider>
        <LandingPage />
      </StreamProvider>
    </WalletProvider>
  </ToastProvider>,
);
