import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { FeatureDetailBoard } from "./FeatureDetailBoard";
import { Feature, FeatureStatus } from "@/types/kanban";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";

const features: Feature[] = [
  {
    id: "feature-1",
    title: "Data Studio",
    date: "Oct 30, 2024",
    status: "done",
    description: "Looker Studio feature for adding and managing data sources",
    subtasks: [
      {
        task: "Data Sources Integration",
        description: "Google Sheets and CSV URL support with column mapping and auto-sync",
        status: "Done",
        filesTouched: ["src/components/UnifiedDataSourceModal.tsx", "src/components/DataSourcesListModal.tsx", "supabase/migrations/20250111194655_add_csv_url_support.sql"],
      },
      {
        task: "Dimensions System",
        description: "Custom, account, and global scope dimensions with formula support",
        status: "Done",
        filesTouched: ["src/components/DimensionsListModal.tsx", "src/components/DimensionModal.tsx", "supabase/migrations/20251030161614_83a8084e-208b-466e-8d3c-779e51573fe7.sql"],
      },
      {
        task: "Auto-sync Functionality",
        description: "Scheduled data synchronization with configurable frequency and timezone",
        status: "Done",
        filesTouched: ["supabase/functions/sync-data-source", "AUTO_SYNC_SETUP.md", "AUTO_SYNC_CRON_SETUP.md"],
      },
    ],
  },
  {
    id: "feature-2",
    title: "Reporting",
    date: "Oct 30, 2024",
    status: "done",
    description: "Current reports created with AI summary slug",
    subtasks: [
      {
        task: "Reports Dashboard",
        description: "Performance table with grouping, filtering, sorting, KPI metrics, and charts",
        status: "Done",
        filesTouched: ["src/pages/ReportDashboard.tsx", "src/components/PerformanceTable.tsx", "src/components/KPIMetricsCards.tsx", "src/components/KPIChart.tsx"],
      },
      {
        task: "AI Summary Cards",
        description: "AI-generated insights with pivot tables and budget integration",
        status: "Done",
        filesTouched: ["src/pages/AISummaryPage.tsx", "src/components/AISummaryPivotTable.tsx", "src/components/FormattedAISummary.tsx"],
      },
      {
        task: "Report Views",
        description: "Saved view configurations with filters, grouping, and column visibility",
        status: "Done",
        filesTouched: ["src/components/PerformanceSettingsModal.tsx", "supabase/migrations/20251031020444_6fb64a28-230f-48cd-9b1d-df215e0bdcbe.sql"],
      },
      {
        task: "KPI Settings",
        description: "Customizable KPI metrics, ordering, and drag-and-drop reordering",
        status: "Done",
        filesTouched: ["src/components/KPISettingsModal.tsx", "src/components/KPIMetricsCards.tsx"],
      },
      {
        task: "Dimension Visibility Sync",
        description: "Synchronized visibility across Performance Table, KPI Settings, and Dimensions List",
        status: "Done",
        filesTouched: ["src/components/DimensionsListModal.tsx", "src/components/KPISettingsModal.tsx", "SYNCHRONIZED_VISIBILITY_IMPLEMENTATION.md"],
      },
      {
        task: "Monthly Aggregation",
        description: "Performance optimization for large datasets with pre-aggregated monthly data",
        status: "Done",
        filesTouched: ["supabase/migrations/20251209130505_f3f44b39-008d-4354-ba04-32571ea3c558.sql", "LARGE_DATASET_OPTIMIZATION_SUMMARY.md"],
      },
    ],
  },
  {
    id: "feature-3",
    title: "Budget",
    date: "Dec 09, 2024",
    status: "in-progress",
    description: "Budget feature inside reporting",
    subtasks: [
      {
        task: "Budget Management",
        description: "Budget tracking in performance tables and AI summaries",
        status: "Done",
        filesTouched: ["src/components/AISummaryBudgetTable.tsx", "src/components/PerformanceTable/TableRow.tsx", "supabase/migrations/20251209044312_2fcc2b33-5100-47b9-ba0e-9f95f37b2717.sql"],
      },
      {
        task: "Budget Tool Page",
        description: "Dedicated budget management page (marked available but no route exists)",
        status: "In Progress",
        filesTouched: ["src/pages/Landing.tsx"],
      },
    ],
  },
  {
    id: "feature-4",
    title: "Link Sharing",
    date: "Nov 24, 2024",
    status: "in-progress",
    description: "Share link feature inside reporting",
    subtasks: [
      {
        task: "Share Links",
        description: "Password-protected report sharing with slug-based URLs",
        status: "Done",
        filesTouched: ["src/pages/SharedReport.tsx", "src/pages/SharedAISummary.tsx", "src/components/CreateShareLinkModal.tsx"],
      },
      {
        task: "API Endpoints",
        description: "Public REST API for report data access via domain",
        status: "Done",
        filesTouched: ["server.js", "API_ENDPOINT_SETUP.md", "supabase/migrations/20251204180244_487ff008-eab7-47db-a616-5d0532ada7b2.sql"],
      },
      {
        task: "API Key Management UI",
        description: "User interface for managing API keys (table exists, UI needed)",
        status: "In Progress",
        filesTouched: ["supabase/migrations", "API_KEY_SETUP.md"],
      },
    ],
  },
  {
    id: "feature-5",
    title: "Data Point",
    date: "Feb 15, 2025",
    status: "backlog",
    description: "Collect data from Google Sheets with Make.com for security",
    subtasks: [
      {
        task: "Make.com Integration",
        description: "Implement Make.com integration for secure Google Sheets data collection",
        status: "Todo",
        filesTouched: [],
      },
    ],
  },
  {
    id: "feature-6",
    title: "Notifications (Slack)",
    date: "Feb 20, 2025",
    status: "backlog",
    description: "Slack notification feature with results",
    subtasks: [
      {
        task: "Slack Integration",
        description: "Send Slack notifications with report results and insights",
        status: "Todo",
        filesTouched: [],
      },
    ],
  },
  {
    id: "feature-7",
    title: "Booking Status",
    date: "Feb 25, 2025",
    status: "backlog",
    description: "List of orders with dates",
    subtasks: [
      {
        task: "Booking Status Dashboard",
        description: "Display list of orders with dates and status tracking",
        status: "Todo",
        filesTouched: [],
      },
    ],
  },
  {
    id: "feature-8",
    title: "Price Parity Checker",
    date: "Mar 01, 2025",
    status: "backlog",
    description: "Price parity checker feature",
    subtasks: [
      {
        task: "Price Parity Checker",
        description: "Compare prices across different channels and detect parity issues",
        status: "Todo",
        filesTouched: [],
      },
    ],
  },
];

export function FeaturesBoard() {
  const [featuresList, setFeaturesList] = useState<Feature[]>(features);
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [activeTask, setActiveTask] = useState<Feature | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const feature = featuresList.find((f) => f.id === event.active.id);
    setActiveTask(feature || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const featureId = active.id as string;
    const newStatus = over.id as FeatureStatus;

    // Check if dropping on a column
    if (["backlog", "in-progress", "quality-assurance", "done"].includes(newStatus)) {
      setFeaturesList((prevFeatures) =>
        prevFeatures.map((feature) =>
          feature.id === featureId ? { ...feature, status: newStatus } : feature
        )
      );
    }
  };

  const handleFeatureClick = (feature: Feature) => {
    setSelectedFeature(feature);
  };

  const handleBackToFeatures = () => {
    setSelectedFeature(null);
  };

  const getFeaturesByStatus = (status: FeatureStatus) => {
    return featuresList.filter((feature) => feature.status === status);
  };

  const columns: { id: FeatureStatus; title: string }[] = [
    { id: "backlog", title: "Backlog" },
    { id: "in-progress", title: "In Progress" },
    { id: "quality-assurance", title: "Quality Assurance" },
    { id: "done", title: "Done" },
  ];

  // If a feature is selected, show the detail board
  if (selectedFeature) {
    return (
      <FeatureDetailBoard
        feature={selectedFeature}
        onBack={handleBackToFeatures}
      />
    );
  }

  // Show features board with columns
  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 p-6 h-[calc(100vh-2rem)] overflow-x-auto">
          {columns.map((column) => (
            <KanbanColumn
              key={column.id}
              id={column.id}
              title={column.title}
              tasks={getFeaturesByStatus(column.id).map((feature) => ({
                id: feature.id,
                title: feature.title,
                date: feature.date,
                description: feature.description,
                status: feature.status,
              }))}
              onTaskClick={(task) => {
                const feature = featuresList.find((f) => f.id === task.id);
                if (feature) handleFeatureClick(feature);
              }}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask ? (
            <TaskCard
              task={{
                id: activeTask.id,
                title: activeTask.title,
                date: activeTask.date,
                description: activeTask.description,
                status: activeTask.status,
              }}
              isDragging
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}
