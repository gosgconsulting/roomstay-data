import { DashboardHeader } from "@/components/DashboardHeader";
import { KPIChartsGrid } from "@/components/KPIChartsGrid";
import { PerformanceTable } from "@/components/PerformanceTable";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <main className="container mx-auto px-6 py-6 space-y-6">
        <KPIChartsGrid />
        <PerformanceTable />
      </main>
    </div>
  );
};

export default Index;
