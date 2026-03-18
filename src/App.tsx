import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import ReportDashboard from "./pages/ReportDashboard";
import ForecastingDashboard from "./pages/ForecastingDashboard";
import Auth from "./pages/Auth";
import SharedReport from "./pages/SharedReport";
import SharedAISummary from "./pages/SharedAISummary";
import NotFound from "./pages/NotFound";
import AISummaryPage from "./pages/AISummaryPage";
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
          <Route path="/" element={<Landing />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/tools/reports" element={<SlideViewPage />} />
          <Route path="/tools/data-sources" element={<DataSourcesPage />} />
          <Route path="/tools/dimensions" element={<DimensionsPage />} />
          <Route path="/tools/data-sources/:accountId" element={<DataSourcesPage />} />
          <Route path="/tools/dimensions/:accountId" element={<DimensionsPage />} />
          <Route path="/tools/data" element={<ReportDashboard />} />
          <Route path="/tools/data/:accountId" element={<ReportDashboard />} />
          <Route path="/tools/reports/:accountId" element={<SlideViewPage />} />
          <Route path="/tools/reports/:accountId/data-studio" element={<SlideViewPage />} />
          <Route path="/tools/forecasting" element={<ForecastingDashboard />} />
          <Route path="/tools/forecasting/scenario/:scenarioId" element={<ForecastScenarioPage />} />
          <Route path="/tools/forecasting/:accountId" element={<ForecastingDashboard />} />
          <Route path="/tools/price-widget" element={<PriceWidgetPage />} />
          <Route path="/tools/price-widget/:accountId" element={<PriceWidgetPage />} />
          <Route path="/tools/price-widget/:accountId/:widgetId" element={<PriceWidgetDetailPage />} />
          <Route path="/tools/report/:reportName" element={<AISummaryPage />} />
          {/* Legacy route support - redirect old UUID-based routes */}
          <Route path="/tools/report/:accountId/:summaryId" element={<AISummaryPage />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/shared/:slug" element={<SharedReport />} />
          <Route path="/shared/reports/:slug" element={<SharedAISummary />} />
          <Route path="/:slug" element={<SharedReport />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;