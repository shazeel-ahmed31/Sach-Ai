import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/auth/AuthProvider";
import { RequireAuth } from "@/auth/RequireAuth";
import Index from "./pages/Index.tsx";
import Detect from "./pages/Detect.tsx";
import Report from "./pages/Report.tsx";
import Research from "./pages/Research.tsx";
import History from "./pages/History.tsx";
import BatchPage, { BatchDetailPage } from "./pages/Batch.tsx";
import { LoginPage, RegisterPage } from "./pages/Auth.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/detect"
              element={
                <RequireAuth>
                  <Detect />
                </RequireAuth>
              }
            />
            <Route
              path="/batch"
              element={
                <RequireAuth>
                  <BatchPage />
                </RequireAuth>
              }
            />
            <Route
              path="/batch/:id"
              element={
                <RequireAuth>
                  <BatchDetailPage />
                </RequireAuth>
              }
            />
            <Route
              path="/history"
              element={
                <RequireAuth>
                  <History />
                </RequireAuth>
              }
            />
            {/* The sample report is public; ?scan=<id> fetches private data
                and shows a sign-in prompt when there is no session. */}
            <Route path="/report" element={<Report />} />
            <Route path="/research" element={<Research />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
