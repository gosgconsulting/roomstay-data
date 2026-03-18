import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ForecastingDashboard from "./pages/ForecastingDashboard";
import Auth from "./pages/Auth";
import SharedReport from "./pages/SharedReport";
import NotFound from "./pages/NotFound";
import SlideViewPage from "./pages/SlideViewPage";
import DataSourcesPage from "./pages/DataSourcesPage";
import DimensionsPage from "./pages/DimensionsPage";
import ForecastScenarioPage from "./pages/ForecastScenarioPage";
import PriceWidgetPage from "./pages/PriceWidgetPage";
import PriceWidgetDetailPage from "./pages/PriceWidgetDetailPage";
import Integrations from "./pages/Integrations";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/auth" element={<Auth />} />
          <Route path="/shared/:slug" element={<SharedReport />} />

          {/* Protected routes — redirect to /auth if not logged in */}
          <Route path="/" element={<ProtectedRoute><SlideViewPage /></ProtectedRoute>} />
          <Route path="/landing" element={<Navigate to="/" replace />} />
          <Route path="/tools/data-sources" element={<ProtectedRoute><DataSourcesPage /></ProtectedRoute>} />
          <Route path="/tools/data-sources/:accountId" element={<ProtectedRoute><DataSourcesPage /></ProtectedRoute>} />
          <Route path="/tools/dimensions" element={<ProtectedRoute><DimensionsPage /></ProtectedRoute>} />
          <Route path="/tools/dimensions/:accountId" element={<ProtectedRoute><DimensionsPage /></ProtectedRoute>} />
          <Route path="/tools/forecasting" element={<ProtectedRoute><ForecastingDashboard /></ProtectedRoute>} />
          <Route path="/tools/forecasting/scenario/:scenarioId" element={<ProtectedRoute><ForecastScenarioPage /></ProtectedRoute>} />
          <Route path="/tools/forecasting/:accountId" element={<ProtectedRoute><ForecastingDashboard /></ProtectedRoute>} />
          <Route path="/tools/price-widget" element={<ProtectedRoute><PriceWidgetPage /></ProtectedRoute>} />
          <Route path="/tools/price-widget/:accountId" element={<ProtectedRoute><PriceWidgetPage /></ProtectedRoute>} />
          <Route path="/tools/price-widget/:accountId/:widgetId" element={<ProtectedRoute><PriceWidgetDetailPage /></ProtectedRoute>} />
          <Route path="/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />

          {/* Legacy routes -> index */}
          <Route path="/tools/reports" element={<Navigate to="/" replace />} />
          <Route path="/tools/data" element={<Navigate to="/" replace />} />
          <Route path="/tools/data/:accountId" element={<Navigate to="/" replace />} />
          <Route path="/tools/reports/:accountId" element={<Navigate to="/" replace />} />
          <Route path="/tools/reports/:accountId/data-studio" element={<Navigate to="/" replace />} />

          {/* Catch-all slug for shared reports, then 404 */}
          <Route path="/:slug" element={<SharedReport />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;