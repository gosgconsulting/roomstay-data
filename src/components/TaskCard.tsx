import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Task } from "@/types/kanban";
import { Card } from "@/components/ui/card";

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  isDragging?: boolean;
}

export function TaskCard({ task, onClick, isDragging }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: task.id,
    disabled: !!isDragging,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.5 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="p-4 bg-white cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      <h3 className="font-semibold text-gray-900 mb-2">{task.title}</h3>
      <p className="text-sm text-blue-600">{task.date}</p>
    </Card>
  );
}
