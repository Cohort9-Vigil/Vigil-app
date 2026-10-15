import { createRoot } from "react-dom/client";
import "./styles/app.css";
import { ToastProvider } from "./state/toasts.tsx";
import { WalletProvider } from "./state/wallet.tsx";
import { StreamProvider } from "./state/stream.tsx";
import { applySavedTheme } from "./theme.ts";
import { MarketsPage } from "./pages/MarketsPage.tsx";

applySavedTheme();
createRoot(document.getElementById("root")!).render(
  <ToastProvider>
    <WalletProvider>
      <StreamProvider>
        <MarketsPage />
      </StreamProvider>
    </WalletProvider>
  </ToastProvider>,
);
