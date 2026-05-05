import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import ForecastingDashboard from "./pages/ForecastingDashboard";
import Auth from "./pages/Auth";
import SharedReport from "./pages/SharedReport";
import SharedCustomReportPage from "./pages/SharedCustomReportPage";
import NotFound from "./pages/NotFound";
import SlideViewPage from "./pages/SlideViewPage";
import DataSourcesPage from "./pages/DataSourcesPage";
import DimensionsPage from "./pages/DimensionsPage";
import UsersPage from "./pages/UsersPage";
import ForecastScenarioPage from "./pages/ForecastScenarioPage";
import PriceWidgetPage from "./pages/PriceWidgetPage";
import PriceWidgetDetailPage from "./pages/PriceWidgetDetailPage";
import Integrations from "./pages/Integrations";
import TagsPage from "./pages/TagsPage";
import CustomReportsPage from "./pages/CustomReportsPage";
import CustomReportViewPage from "./pages/CustomReportViewPage";
import SlidesPage from "./pages/SlidesPage";
import SlideViewerPage from "./pages/SlideViewerPage";
import ScriptPage from "./pages/ScriptPage";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

/** Redirect legacy short-URL share links (/:slug) → /shared/:slug */
function LegacySlugRedirect() {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/shared/${slug}`} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/auth" element={<Auth />} />
          <Route path="/script/:slideId" element={<ScriptPage />} />
          <Route path="/shared/:slug" element={<SharedReport />} />
          <Route path="/shared/:slug/studio" element={<SlideViewPage />} />
          <Route path="/shared/:slug/report" element={<SharedCustomReportPage />} />

          {/* Protected routes — redirect to /auth if not logged in */}
          <Route path="/" element={<ProtectedRoute><SlideViewPage /></ProtectedRoute>} />
          <Route path="/landing" element={<Navigate to="/" replace />} />
          <Route path="/tools/data-sources" element={<ProtectedRoute><DataSourcesPage /></ProtectedRoute>} />
          <Route path="/tools/data-sources/:accountId" element={<ProtectedRoute><DataSourcesPage /></ProtectedRoute>} />
          <Route path="/tools/dimensions" element={<ProtectedRoute><DimensionsPage /></ProtectedRoute>} />
          <Route path="/tools/dimensions/:accountId" element={<ProtectedRoute><DimensionsPage /></ProtectedRoute>} />
          <Route path="/tools/tags" element={<ProtectedRoute><TagsPage /></ProtectedRoute>} />
          <Route path="/tools/tags/:accountId" element={<ProtectedRoute><TagsPage /></ProtectedRoute>} />
          <Route path="/tools/reports" element={<ProtectedRoute><CustomReportsPage /></ProtectedRoute>} />
          <Route path="/tools/reports/:accountId" element={<ProtectedRoute><CustomReportsPage /></ProtectedRoute>} />
          <Route path="/tools/reports/:accountId/:reportId" element={<ProtectedRoute><CustomReportViewPage /></ProtectedRoute>} />
          <Route path="/tools/slides" element={<ProtectedRoute><SlidesPage /></ProtectedRoute>} />
          <Route path="/tools/slides/:accountId" element={<ProtectedRoute><SlidesPage /></ProtectedRoute>} />
          <Route path="/tools/slides/:accountId/:slideId" element={<ProtectedRoute><SlideViewerPage /></ProtectedRoute>} />
          <Route path="/tools/users" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
          <Route path="/tools/users/:accountId" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
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

          {/* Legacy short-URL redirect: /:slug → /shared/:slug */}
          <Route path="/:slug" element={<LegacySlugRedirect />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;