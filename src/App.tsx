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
import AllReports from "./pages/AllReports";
import AISummaryPage from "./pages/AISummaryPage";

import ForecastScenarioPage from "./pages/ForecastScenarioPage";
import { ReportsSidebarDemo } from "./components/ReportsSidebarDemo";

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
          <Route path="/all-reports/:accountId" element={<AllReports />} />
          <Route path="/all-reports" element={<AllReports />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/tools/report" element={<ReportTool />} />
          <Route path="/tools/report/:accountId" element={<ReportDashboard />} />
          <Route path="/tools/forecasting" element={<ForecastingTool />} />
          <Route path="/tools/forecasting/scenario/:scenarioId" element={<ForecastScenarioPage />} />
          <Route path="/tools/forecasting/:accountId" element={<ForecastingDashboard />} />
          <Route path="/tools/ai-summary/:accountId" element={<AISummaryPage />} />
          <Route path="/tools/ai-summary/:accountId/:summaryId" element={<AISummaryPage />} />
          <Route path="/demo/sidebar" element={<ReportsSidebarDemo />} />
          <Route path="/shared/:slug" element={<SharedReport />} />
          <Route path="/shared/ai-summary/:slug" element={<SharedAISummary />} />
          <Route path="/:slug" element={<SharedReport />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;