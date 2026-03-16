import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import ReportTool from "./pages/ReportTool";
import ReportDashboard from "./pages/ReportDashboard";
import ForecastingTool from "./pages/ForecastingTool";
import ForecastingDashboard from "./pages/ForecastingDashboard";
import Auth from "./pages/Auth";
import SharedReport from "./pages/SharedReport";
import SharedAISummary from "./pages/SharedAISummary";
import NotFound from "./pages/NotFound";
import AISummaryPage from "./pages/AISummaryPage";
import SlidesPage from "./pages/SlidesPage";
import SlideViewPage from "./pages/SlideViewPage";
import DataSourcesPage from "./pages/DataSourcesPage";
import DimensionsPage from "./pages/DimensionsPage";

import ForecastScenarioPage from "./pages/ForecastScenarioPage";
import { ReportsSidebarDemo } from "./components/ReportsSidebarDemo";
import DevPage from "./pages/DevPage";
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
          <Route path="/tools/data-sources/:accountId" element={<DataSourcesPage />} />
          <Route path="/tools/dimensions/:accountId" element={<DimensionsPage />} />
          <Route path="/tools/data" element={<ReportTool />} />
          <Route path="/tools/data/:accountId" element={<ReportDashboard />} />
          <Route path="/tools/reports/:accountId" element={<SlidesPage />} />
          <Route path="/tools/reports/:accountId/view/:slideId" element={<SlideViewPage />} />
          <Route path="/tools/reports/:accountId/brady" element={<SlideViewPage />} />
          <Route path="/tools/reports/:accountId/master-report" element={<SlideViewPage />} />
          <Route path="/tools/reports/:accountId/data-studio" element={<SlideViewPage />} />
          <Route path="/tools/forecasting" element={<ForecastingTool />} />
          <Route path="/tools/forecasting/scenario/:scenarioId" element={<ForecastScenarioPage />} />
          <Route path="/tools/forecasting/:accountId" element={<ForecastingDashboard />} />
          <Route path="/tools/price-widget/:accountId" element={<PriceWidgetPage />} />
          <Route path="/tools/price-widget/:accountId/:widgetId" element={<PriceWidgetDetailPage />} />
          <Route path="/tools/report/:reportName" element={<AISummaryPage />} />
          {/* Legacy route support - redirect old UUID-based routes */}
          <Route path="/tools/report/:accountId/:summaryId" element={<AISummaryPage />} />
          <Route path="/demo/sidebar" element={<ReportsSidebarDemo />} />
          <Route path="/dev" element={<DevPage />} />
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