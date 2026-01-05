import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { Task, Subtask } from "@/types/kanban";
import { Button } from "@/components/ui/button";

interface TaskDetailsModalProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetailsModal({ task, open, onOpenChange }: TaskDetailsModalProps) {
  if (!task) return null;

  // Use task subtasks if available, otherwise create a default subtask from the task itself
  const subtasks: Subtask[] = task.subtasks || [
    {
      task: task.title,
      description: task.description || "No description",
      status: task.status === "done" ? "Done" : task.status === "in-progress" ? "In Progress" : "Todo",
      filesTouched: task.filesTouched || [],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[95vh] p-0 flex flex-col [&>button]:hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-semibold">{task.title}</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
            >
              <X className="h-5 w-5 text-purple-600" />
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto px-6 py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Files Touched</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subtasks.length > 0 ? (
                subtasks.map((subtask, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{subtask.task}</TableCell>
                    <TableCell>
                      <span className="text-blue-600 hover:underline cursor-pointer">
                        {subtask.description}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{subtask.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {subtask.filesTouched.length > 0 ? (
                        subtask.filesTouched.map((file, fileIndex) => (
                          <Badge
                            key={fileIndex}
                            variant="secondary"
                            className="bg-blue-100 text-blue-700 mr-2"
                          >
                            {file}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-gray-400">
                    No subtasks available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
