import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import AdminUsers from "./pages/admin/Users";
import AdminVaults from "./pages/admin/Vaults";
import VaultDetail from "./pages/admin/VaultDetail";
import VaultPermissions from "./pages/admin/VaultPermissions";
import ClientVault from "./pages/client/Vault";
import DocumentViewer from "./pages/DocumentViewer";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import ChatWidget from "@/components/ChatWidget/ChatWidget";

const queryClient = new QueryClient();

const AuthenticatedChatWidget = () => {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  return <ChatWidget />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/vaults" element={<AdminVaults />} />
            <Route path="/admin/vaults/:vaultId" element={<VaultDetail />} />
            <Route path="/admin/vaults/:vaultId/permissions" element={<VaultPermissions />} />
            <Route path="/vault" element={<ClientVault />} />
            <Route path="/vault/:vaultId" element={<ClientVault />} />
            <Route path="/document/:documentId" element={<DocumentViewer />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <AuthenticatedChatWidget />
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
