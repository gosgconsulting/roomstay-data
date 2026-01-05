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
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";
import { TaskDetailsModal } from "./TaskDetailsModal";
import { Feature, FeatureColumnId, Subtask } from "@/types/kanban";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface FeatureDetailBoardProps {
  feature: Feature;
  onBack: () => void;
}

export function FeatureDetailBoard({ feature, onBack }: FeatureDetailBoardProps) {
  const [subtasks, setSubtasks] = useState<Subtask[]>(feature.subtasks || []);
  const [activeSubtask, setActiveSubtask] = useState<Subtask | null>(null);
  const [selectedSubtask, setSelectedSubtask] = useState<Subtask | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const subtask = subtasks.find((s) => s.task === event.active.id);
    setActiveSubtask(subtask || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveSubtask(null);

    if (!over) return;

    const subtaskTask = active.id as string;
    const newStatus = over.id as FeatureColumnId;

    // Check if dropping on a column
    if (["docs", "backlog", "in-progress", "done"].includes(newStatus)) {
      setSubtasks((prevSubtasks) =>
        prevSubtasks.map((subtask) =>
          subtask.task === subtaskTask
            ? {
                ...subtask,
                status:
                  newStatus === "done"
                    ? "Done"
                    : newStatus === "in-progress"
                    ? "In Progress"
                    : newStatus === "docs"
                    ? "Docs"
                    : "Todo",
              }
            : subtask
        )
      );
    }
  };

  const getSubtasksByStatus = (status: FeatureColumnId): Subtask[] => {
    return subtasks.filter((subtask) => {
      if (status === "done") return subtask.status === "Done";
      if (status === "in-progress") return subtask.status === "In Progress";
      if (status === "backlog") return subtask.status === "Todo";
      if (status === "docs") return subtask.status === "Docs";
      return false;
    });
  };

  const columns: { id: FeatureColumnId; title: string }[] = [
    { id: "docs", title: "Docs" },
    { id: "backlog", title: "Backlog" },
    { id: "in-progress", title: "In Progress" },
    { id: "done", title: "Done" },
  ];

  return (
    <>
      <div className="p-4 border-b bg-white">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-semibold">{feature.title}</h1>
          {feature.description && (
            <p className="text-sm text-gray-600">{feature.description}</p>
          )}
        </div>
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 p-6 h-[calc(100vh-8rem)] overflow-x-auto">
          {columns.map((column) => {
            const columnSubtasks = getSubtasksByStatus(column.id);
            return (
              <KanbanColumn
                key={column.id}
                id={column.id}
                title={column.title}
                tasks={columnSubtasks.map((subtask) => ({
                  id: subtask.task,
                  title: subtask.task,
                  date: "",
                  description: subtask.description,
                  status:
                    subtask.status === "Done"
                      ? "done"
                      : subtask.status === "In Progress"
                      ? "in-progress"
                      : subtask.status === "Docs"
                      ? "docs"
                      : "backlog",
                  filesTouched: subtask.filesTouched,
                }))}
                onTaskClick={(task) => {
                  const subtask = subtasks.find((s) => s.task === task.title);
                  if (subtask) {
                    setSelectedSubtask(subtask);
                  }
                }}
              />
            );
          })}
        </div>
        <DragOverlay>
          {activeSubtask ? (
            <TaskCard
              task={{
                id: activeSubtask.task,
                title: activeSubtask.task,
                date: "",
                description: activeSubtask.description,
                status:
                  activeSubtask.status === "Done"
                    ? "done"
                    : activeSubtask.status === "In Progress"
                    ? "in-progress"
                    : activeSubtask.status === "Docs"
                    ? "docs"
                    : "backlog",
              }}
              isDragging
            />
          ) : null}
        </DragOverlay>
      </DndContext>
      {selectedSubtask && (
        <TaskDetailsModal
          task={{
            id: selectedSubtask.task,
            title: selectedSubtask.task,
            date: "",
            description: selectedSubtask.description,
            status:
              selectedSubtask.status === "Done"
                ? "done"
                : selectedSubtask.status === "In Progress"
                ? "in-progress"
                : selectedSubtask.status === "Docs"
                ? "docs"
                : "backlog",
            filesTouched: selectedSubtask.filesTouched,
          }}
          open={!!selectedSubtask}
          onOpenChange={(open) => !open && setSelectedSubtask(null)}
        />
      )}
    </>
  );
}
