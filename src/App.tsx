import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

import ChatWidget from "@/components/ChatWidget/ChatWidget";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminVaults = lazy(() => import("./pages/admin/Vaults"));
const VaultDetail = lazy(() => import("./pages/admin/VaultDetail"));
const VaultPermissions = lazy(() => import("./pages/admin/VaultPermissions"));
const ClientVault = lazy(() => import("./pages/client/Vault"));
const DocumentViewer = lazy(() => import("./pages/DocumentViewer"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PageLoader = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

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
          <Suspense fallback={<PageLoader />}>
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
          </Suspense>
        </BrowserRouter>
        <AuthenticatedChatWidget />
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
