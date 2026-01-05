export type ColumnId = "backlog" | "in-progress" | "done" | "docs";
export type FeatureColumnId = "docs" | "backlog" | "in-progress" | "done";
export type FeatureStatus = "backlog" | "in-progress" | "quality-assurance" | "done";

export interface Feature {
  id: string;
  title: string;
  date: string;
  description?: string;
  status: FeatureStatus;
  subtasks?: Subtask[];
}

export interface Task {
  id: string;
  title: string;
  date: string;
  description?: string;
  status: ColumnId | FeatureStatus;
  filesTouched?: string[];
  subtasks?: Subtask[];
}

export interface Subtask {
  task: string;
  description: string;
  status: "Done" | "In Progress" | "Todo" | "Docs";
  filesTouched: string[];
}
