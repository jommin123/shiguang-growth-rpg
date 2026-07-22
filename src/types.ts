export interface Profile {
  id: "player";
  name: string;
  title: string;
  level: number;
  totalXp: number;
  startedAt: string;
}

export interface HabitDefinition {
  id: string;
  label: string;
  icon: string;
  xp: number;
  skillId: string;
  cadence?: "day" | "week" | "month" | "quarter";
  parentId?: string;
  relation?: "aggregate" | "transform";
  target?: number;
  custom?: boolean;
}

export interface Checkin {
  date: string;
  habits: Record<string, boolean>;
  energy: number;
  mood: number;
  sleepHours: number;
  note: string;
  updatedAt: string;
}

export interface GrowthLog {
  id: string;
  date: string;
  category: "career" | "life" | "health" | "relationship" | "learning";
  title: string;
  detail: string;
  insight: string;
  createdAt: string;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  stageId: string;
  category: string;
  xp: number;
  skillId: string;
  role?: "main" | "side";
  routeId?: string;
  status: "todo" | "doing" | "done";
  completedAt?: string;
  custom?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  icon: string;
  color: string;
  level: number;
  xp: number;
  nextXp: number;
  description: string;
  branch: string;
  tier: number;
  parentId?: string;
  custom?: boolean;
}

export interface ActionProgress {
  id: string;
  actionId: string;
  periodKey: string;
  value: number;
  completed: boolean;
  updatedAt: string;
}

export interface Stage {
  id: string;
  order: number;
  title: string;
  subtitle: string;
  minXp: number;
  goal: string;
  reward: string;
}

export interface BackupData {
  version: 3;
  exportedAt: string;
  profile: Profile;
  habits: HabitDefinition[];
  checkins: Checkin[];
  logs: GrowthLog[];
  quests: Quest[];
  skills: Skill[];
  actionProgress: ActionProgress[];
}
