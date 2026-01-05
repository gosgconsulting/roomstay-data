import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TaskCard } from "./TaskCard";
import { Task, ColumnId, FeatureColumnId, FeatureStatus } from "@/types/kanban";
import { Badge } from "@/components/ui/badge";

interface KanbanColumnProps {
  id: ColumnId | FeatureColumnId | FeatureStatus | "features";
  title: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export function KanbanColumn({ id, title, tasks, onTaskClick }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({
    id,
  });

  return (
    <div className="flex flex-col w-80 flex-shrink-0">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
        <Badge variant="secondary" className="bg-blue-100 text-blue-700">
          {tasks.length}
        </Badge>
      </div>
      <div
        ref={setNodeRef}
        className="flex-1 bg-gray-50 rounded-lg p-4 min-h-[500px] space-y-3"
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
