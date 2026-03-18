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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Index is the canonical report entry now */}
          <Route path="/" element={<SlideViewPage />} />
          <Route path="/landing" element={<Navigate to="/" replace />} />
          <Route path="/auth" element={<Auth />} />
          {/* Legacy report routes -> index */}
          <Route path="/tools/reports" element={<Navigate to="/" replace />} />
          <Route path="/tools/data-sources" element={<DataSourcesPage />} />
          <Route path="/tools/dimensions" element={<DimensionsPage />} />
          <Route path="/tools/data-sources/:accountId" element={<DataSourcesPage />} />
          <Route path="/tools/dimensions/:accountId" element={<DimensionsPage />} />
          {/* Legacy performance dashboard routes -> index */}
          <Route path="/tools/data" element={<Navigate to="/" replace />} />
          <Route path="/tools/data/:accountId" element={<Navigate to="/" replace />} />
          <Route path="/tools/reports/:accountId" element={<Navigate to="/" replace />} />
          <Route path="/tools/reports/:accountId/data-studio" element={<Navigate to="/" replace />} />
          <Route path="/tools/forecasting" element={<ForecastingDashboard />} />
          <Route path="/tools/forecasting/scenario/:scenarioId" element={<ForecastScenarioPage />} />
          <Route path="/tools/forecasting/:accountId" element={<ForecastingDashboard />} />
          <Route path="/tools/price-widget" element={<PriceWidgetPage />} />
          <Route path="/tools/price-widget/:accountId" element={<PriceWidgetPage />} />
          <Route path="/tools/price-widget/:accountId/:widgetId" element={<PriceWidgetDetailPage />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/shared/:slug" element={<SharedReport />} />
          <Route path="/:slug" element={<SharedReport />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;