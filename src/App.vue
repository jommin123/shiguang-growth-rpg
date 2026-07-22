<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import habitsSeed from "./config/habits.json";
import questsSeed from "./config/quests.json";
import skillsSeed from "./config/skills.json";
import stagesSeed from "./config/stages.json";
import skillCatalogSeed from "./config/skillCatalog.json";
import microSkillsSeed from "./config/microSkills.json";
import { growthDb } from "./lib/db";
import type { ActionProgress, BackupData, Checkin, GrowthLog, HabitDefinition, Profile, Quest, Skill, Stage } from "./types";

type View = "actions" | "routes" | "skills" | "archive";
type Cadence = "day" | "week" | "month" | "quarter";
type ArchiveTab = "profile" | "quests" | "logs";
const views = [
  { id: "actions", label: "行动首页", icon: "⌁" },
  { id: "routes", label: "成长路线", icon: "◇" },
  { id: "skills", label: "技能星图", icon: "✦" },
  { id: "archive", label: "我的成长", icon: "◉" },
] as const;
const cadenceTabs: { id: Cadence; label: string; caption: string }[] = [
  { id: "day", label: "日", caption: "今天" }, { id: "week", label: "周", caption: "本周" },
  { id: "month", label: "月", caption: "本月" }, { id: "quarter", label: "季度", caption: "本季度" },
];
const routeDimensions = [
  { id: "health", name: "身体与能量", icon: "ϟ", color: "#9d7bff", nodes: ["规律补给","稳定睡眠","主动恢复","身体自由"] },
  { id: "life", name: "生活秩序", icon: "⌂", color: "#7f5cff", nodes: ["照顾自己","建立节奏","创造生活","拥有选择"] },
  { id: "creation", name: "创造表达", icon: "✎", color: "#b89cff", nodes: ["留下记录","持续输出","形成作品","表达自我"] },
  { id: "career", name: "职业能力", icon: "⬡", color: "#6f48ea", nodes: ["整理经验","形成判断","产生影响","职业自主"] },
  { id: "relationship", name: "关系连接", icon: "∞", color: "#a988ff", nodes: ["主动连接","稳定关系","亲密表达","共同生活"] },
  { id: "finance", name: "财务选择", icon: "◫", color: "#8768d8", nodes: ["看见现金流","增加收入","建立资产","选择自由"] },
];
const skillCatalog = skillCatalogSeed as Record<string, string[]>;
const microSkillCatalog = microSkillsSeed as Record<string, string[]>;
const skillDomains = Object.keys(skillCatalog);
const stages = stagesSeed as Stage[];
const today = new Date().toISOString().slice(0, 10);

const activeView = ref<View>("actions");
const selectedCadence = ref<Cadence>("day");
const archiveTab = ref<ArchiveTab>("profile");
const selectedSkillDomain = ref("产品与业务");
const selectedRouteId = ref("life");
const ready = ref(false);
const saved = ref(true);
const showActionForm = ref(false);
const showQuestForm = ref(false);
const showSkillForm = ref(false);
const showLogForm = ref(false);
const selectedCatalogSkill = ref("用户研究");
const selectedMicroSkill = ref("");
const skillAssignTarget = ref<"main" | Cadence>("main");
const skillAssignParentId = ref("");
const habits = ref<HabitDefinition[]>([]);
const quests = ref<Quest[]>([]);
const skills = ref<Skill[]>([]);
const checkins = ref<Checkin[]>([]);
const logs = ref<GrowthLog[]>([]);
const actionProgress = ref<ActionProgress[]>([]);

const profile = reactive<Profile>({ id: "player", name: "Jommin", title: "重新上线", level: 1, totalXp: 0, startedAt: today });
const currentCheckin = reactive<Checkin>({ date: today, habits: {}, energy: 5, mood: 5, sleepHours: 7, note: "", updatedAt: new Date().toISOString() });
const actionDraft = reactive({ label: "", icon: "✦", xp: 10, skillId: "life", cadence: "day" as Cadence, parentId: "", relation: "aggregate" as "aggregate" | "transform", target: 1 });
const questDraft = reactive({ title: "", description: "", category: "个人", xp: 40, skillId: "life", stageId: "foundation", role: "main" as "main" | "side", routeId: "life" });
const skillDraft = reactive({ catalogName: "", customName: "", icon: "✧", domain: "产品与业务", tier: 2, parentId: "", parentName: "用户研究", description: "" });
const logDraft = reactive({ category: "career" as GrowthLog["category"], title: "", detail: "", insight: "" });

const mergeSeeds = <T extends { id: string }>(seed: T[], savedItems: T[]) => [
  ...seed.map(item => ({ ...item, ...savedItems.find(saved => saved.id === item.id) })),
  ...savedItems.filter(saved => !seed.some(item => item.id === saved.id)),
];
const cadenceLabel = (cadence?: Cadence) => ({ day: "每日", week: "每周", month: "每月", quarter: "每季度" }[cadence ?? "day"]);
const parseDate = (value: string) => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day, 12); };
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const periodKey = (cadence: Cadence, source = new Date()) => {
  const date = new Date(source); const year = date.getFullYear();
  if (cadence === "day") return dateKey(date);
  if (cadence === "month") return `${year}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  if (cadence === "quarter") return `${year}-Q${Math.floor(date.getMonth() / 3) + 1}`;
  const start = new Date(year, 0, 1); const week = Math.ceil((((date.getTime() - start.getTime()) / 86400000) + start.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
};
const periodBounds = (cadence: Cadence, anchor = new Date()) => {
  const start = new Date(anchor); start.setHours(12, 0, 0, 0);
  if (cadence === "day") return { start, end: new Date(start) };
  if (cadence === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (cadence === "month") start.setDate(1);
  if (cadence === "quarter") { start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1); }
  const end = new Date(start);
  if (cadence === "week") end.setDate(end.getDate() + 6);
  if (cadence === "month") end.setMonth(end.getMonth() + 1, 0);
  if (cadence === "quarter") { end.setMonth(end.getMonth() + 3, 0); }
  return { start, end };
};
const nextCadence = (cadence: Cadence) => ({ day: "week", week: "month", month: "quarter", quarter: undefined } as const)[cadence];
const parentAction = (action: HabitDefinition) => habits.value.find(item => item.id === action.parentId);
const childrenOf = (id: string) => habits.value.filter(item => item.parentId === id);
const actionFlowLabel = (action: HabitDefinition) => {
  const labels = [action.label]; const seen = new Set([action.id]); let current = parentAction(action);
  while (current && !seen.has(current.id)) { labels.push(current.label); seen.add(current.id); current = parentAction(current); }
  return labels.join(" → ");
};
const actionParentOptions = computed(() => {
  const parentCadence = nextCadence(actionDraft.cadence);
  return parentCadence ? habits.value.filter(item => (item.cadence ?? "day") === parentCadence) : [];
});
const selectedActionSkill = computed(() => skills.value.find(skill => skill.id === actionDraft.skillId));
const selectedActionRoute = computed(() => routeDimensions.find(route => route.id === (selectedActionSkill.value ? skillRoute(domainForSkill(selectedActionSkill.value)) : "life")) ?? routeDimensions[1]);
const actionsForCadence = computed(() => habits.value.filter(item => (item.cadence ?? "day") === selectedCadence.value));
const progressRecordAt = (action: HabitDefinition, anchor = new Date()) => actionProgress.value.find(item => item.id === `${periodKey((action.cadence ?? "day") as Cadence, anchor)}:${action.id}`);
const progressRecord = (action: HabitDefinition) => progressRecordAt(action);
const checkinDoneAt = (action: HabitDefinition, anchor: Date) => {
  const key = dateKey(anchor);
  if (key === today) return !!currentCheckin.habits[action.id];
  return !!checkins.value.find(item => item.date === key)?.habits[action.id];
};
const childPeriodAnchors = (parentCadence: Cadence, childCadence: Cadence, anchor: Date) => {
  const { start, end } = periodBounds(parentCadence, anchor); const seen = new Set<string>(); const anchors: Date[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const key = periodKey(childCadence, cursor);
    if (!seen.has(key)) { seen.add(key); anchors.push(new Date(cursor)); }
  }
  return anchors;
};
const actionValueAt = (action: HabitDefinition, anchor = new Date(), visited = new Set<string>()): number => {
  const cadence = (action.cadence ?? "day") as Cadence;
  if (cadence === "day") return checkinDoneAt(action, anchor) ? 1 : 0;
  const visitKey = `${periodKey(cadence, anchor)}:${action.id}`;
  if (visited.has(visitKey)) return 0;
  const branch = new Set(visited); branch.add(visitKey);
  const manualValue = progressRecordAt(action, anchor)?.value ?? 0;
  const autoValue = childrenOf(action.id).reduce((sum, child) => {
    const childCadence = (child.cadence ?? "day") as Cadence;
    return sum + childPeriodAnchors(cadence, childCadence, anchor).filter(childAnchor => actionDoneAt(child, childAnchor, branch)).length;
  }, 0);
  return Math.max(manualValue, autoValue);
};
const actionDoneAt = (action: HabitDefinition, anchor = new Date(), visited = new Set<string>()): boolean => {
  const cadence = (action.cadence ?? "day") as Cadence;
  if (cadence === "day") return checkinDoneAt(action, anchor);
  if (progressRecordAt(action, anchor)?.completed) return true;
  return actionValueAt(action, anchor, visited) >= Math.max(1, action.target ?? 1);
};
const actionDone = (action: HabitDefinition) => actionDoneAt(action);
const actionValue = (action: HabitDefinition) => actionValueAt(action);
const actionPercent = (action: HabitDefinition) => actionDone(action) ? 100 : Math.min(100, Math.round(actionValue(action) / Math.max(1, action.target ?? 1) * 100));
const cadenceCompletion = computed(() => {
  if (!actionsForCadence.value.length) return 0;
  return Math.round(actionsForCadence.value.reduce((sum, action) => sum + actionPercent(action), 0) / actionsForCadence.value.length);
});
const todayDoneCount = computed(() => habits.value.filter(h => (h.cadence ?? "day") === "day" && currentCheckin.habits[h.id]).length);
const streak = computed(() => {
  const dates = new Set(checkins.value.filter(d => Object.values(d.habits).some(Boolean)).map(d => d.date)); let count = 0; const cursor = new Date();
  while (dates.has(cursor.toISOString().slice(0, 10))) { count++; cursor.setDate(cursor.getDate() - 1); } return count;
});
const totalXp = computed(() => {
  const dailyXp = checkins.value.reduce((sum, day) => sum + habits.value.filter(h => (h.cadence ?? "day") === "day").reduce((xp, habit) => xp + (day.habits[habit.id] ? habit.xp : 0), 0), 0);
  const periodXp = habits.value.filter(item => (item.cadence ?? "day") !== "day").reduce((sum, action) => sum + actionCompletionCount(action) * action.xp, 0);
  return dailyXp + periodXp + quests.value.filter(q => q.status === "done").reduce((sum, q) => sum + q.xp, 0);
});
const currentStage = computed(() => [...stages].reverse().find(stage => totalXp.value >= stage.minXp) ?? stages[0]);
const nextStage = computed(() => stages.find(stage => stage.order === currentStage.value.order + 1));
const stageProgress = computed(() => !nextStage.value ? 100 : Math.min(100, Math.round((totalXp.value - currentStage.value.minXp) / (nextStage.value.minXp - currentStage.value.minXp) * 100)));
const mainQuests = computed(() => quests.value.filter(q => (q.role ?? "main") === "main"));
const sideQuests = computed(() => quests.value.filter(q => q.role === "side"));
const currentMainQuest = computed(() => mainQuests.value.find(q => q.status !== "done"));
const recentLogs = computed(() => [...logs.value].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6));
const growthBars = computed(() => Array.from({ length: 8 }, (_, offset) => {
  const date = new Date(); date.setDate(date.getDate() - (7 - offset)); const key = date.toISOString().slice(0, 10); const record = checkins.value.find(item => item.date === key);
  return { key, label: key.slice(5), value: record ? Object.values(record.habits).filter(Boolean).length : 0 };
}));
const logRoute = (category: GrowthLog["category"]) => ({ health: "health", life: "life", career: "career", relationship: "relationship", learning: "creation" }[category]);
const actionRoute = (action: HabitDefinition) => {
  const skill = skills.value.find(item => item.id === action.skillId);
  return skill ? skillRoute(domainForSkill(skill)) : "life";
};
const historyAnchors = (cadence: Cadence) => {
  const start = parseDate(profile.startedAt || today); const end = parseDate(today); const seen = new Set<string>(); const anchors: Date[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const key = periodKey(cadence, cursor);
    if (!seen.has(key)) { seen.add(key); anchors.push(new Date(cursor)); }
  }
  return anchors;
};
const actionCompletionCount = (action: HabitDefinition) => {
  const cadence = (action.cadence ?? "day") as Cadence;
  if (cadence === "day") return checkins.value.filter(record => record.habits[action.id]).length + (checkins.value.some(record => record.date === today) ? 0 : (currentCheckin.habits[action.id] ? 1 : 0));
  return historyAnchors(cadence).filter(anchor => actionDoneAt(action, anchor)).length;
};
const routeSources = (routeId: string) => {
  const relatedActions = habits.value.filter(action => actionRoute(action) === routeId);
  const actionCounts = { day: 0, week: 0, month: 0, quarter: 0 } as Record<Cadence, number>;
  let actionXp = 0;
  relatedActions.forEach(action => {
    const count = actionCompletionCount(action);
    actionCounts[(action.cadence ?? "day") as Cadence] += count;
    actionXp += count * action.xp;
  });
  const relatedLogs = logs.value.filter(log => logRoute(log.category) === routeId);
  const doneQuests = quests.value.filter(quest => quest.routeId === routeId && quest.status === "done");
  return { actionCounts, actionXp, logCount: relatedLogs.length, logXp: relatedLogs.length * 24, questCount: doneQuests.length, questXp: doneQuests.reduce((sum, quest) => sum + quest.xp, 0) };
};
const routePoints = (routeId: string) => {
  const source = routeSources(routeId);
  return source.actionXp + source.logXp + source.questXp;
};
const routeThresholds = [1, 80, 190, 360];
const routeThresholdLabel = (index: number) => index === 0 ? "首次记录" : `${routeThresholds[index]} XP`;
const routeProgress = (routeId: string) => Math.min(100, Math.round(routePoints(routeId) / routeThresholds[3] * 100));
const routeNodeReached = (routeId: string, index: number) => routePoints(routeId) >= routeThresholds[index];
const routeNextNodeIndex = (routeId: string) => routeThresholds.findIndex(threshold => routePoints(routeId) < threshold);
const routeNextText = (routeId: string) => {
  const index = routeNextNodeIndex(routeId);
  if (index < 0) return "路线已完成，继续积累你的真实证据";
  const route = routeDimensions.find(item => item.id === routeId);
  return `距离「${route?.nodes[index]}」还差 ${Math.max(0, routeThresholds[index] - routePoints(routeId))} 点成长值`;
};
const routeEvidence = (routeId: string) => {
  const evidence: { id: string; date: string; type: string; title: string; xp: number }[] = [];
  checkins.value.forEach(record => {
    const done = habits.value.filter(action => (action.cadence ?? "day") === "day" && record.habits[action.id] && actionRoute(action) === routeId);
    if (done.length) evidence.push({ id: `day-${routeId}-${record.date}`, date: record.date, type: "日常行动", title: done.map(item => item.label).join("、"), xp: done.reduce((sum, item) => sum + item.xp, 0) });
  });
  habits.value.filter(action => (action.cadence ?? "day") !== "day" && actionRoute(action) === routeId).forEach(action => {
    const cadence = action.cadence as Cadence;
    historyAnchors(cadence).filter(anchor => actionDoneAt(action, anchor)).forEach(anchor => {
      const period = periodKey(cadence, anchor); const completedOn = periodBounds(cadence, anchor).end; const visibleDate = completedOn > parseDate(today) ? parseDate(today) : completedOn;
      evidence.push({ id: `period-${period}-${action.id}`, date: dateKey(visibleDate), type: `${cadenceLabel(cadence)}汇聚`, title: action.label, xp: action.xp });
    });
  });
  logs.value.filter(log => logRoute(log.category) === routeId).forEach(log => evidence.push({ id: log.id, date: log.date, type: "成长日志", title: log.title, xp: 24 }));
  quests.value.filter(quest => quest.routeId === routeId && quest.status === "done").forEach(quest => evidence.push({ id: quest.id, date: quest.completedAt?.slice(0, 10) ?? today, type: quest.role === "side" ? "支线达成" : "主线达成", title: quest.title, xp: quest.xp }));
  return evidence.sort((a, b) => b.date.localeCompare(a.date));
};
const selectedRoute = computed(() => routeDimensions.find(route => route.id === selectedRouteId.value) ?? routeDimensions[0]);
const routeOverview = computed(() => ({
  lit: routeDimensions.reduce((sum, route) => sum + route.nodes.filter((_, index) => routeNodeReached(route.id, index)).length, 0),
  evidence: routeDimensions.reduce((sum, route) => sum + routeEvidence(route.id).length, 0),
  progress: Math.round(routeDimensions.reduce((sum, route) => sum + routeProgress(route.id), 0) / routeDimensions.length),
}));
const dimensionScores = computed(() => [
  routeProgress("health"), routeProgress("life"), routeProgress("career"),
  routeProgress("creation"), routeProgress("relationship"), routeProgress("finance"),
]);
const radarPolygon = computed(() => {
  const angles = [-90,-30,30,90,150,210];
  return dimensionScores.value.map((score, index) => { const radius = score * .46; const angle = angles[index] * Math.PI / 180; return `${50 + Math.cos(angle) * radius}% ${50 + Math.sin(angle) * radius}%`; }).join(",");
});
const domainForSkill = (skill: Skill) => {
  if (skill.branch && skill.branch in skillCatalog) return skill.branch;
  if (["health","sleep","nutrition","movement","energy"].includes(skill.id)) return "身体健康";
  if (["life","cooking"].includes(skill.id)) return "生活管理";
  if (["reading","writing","aesthetic","creator"].includes(skill.id)) return "创造表达";
  if (["data","ai"].includes(skill.id)) return "数据科技";
  if (["relationship","friendship","communication","boundaries"].includes(skill.id)) return "人际沟通";
  if (skill.id === "intimacy") return "关系亲密";
  return "产品与业务";
};
const activeSkillNodes = computed(() => skills.value.filter(skill => domainForSkill(skill) === selectedSkillDomain.value).sort((a,b) => a.tier - b.tier));
const secondaryNamesForDomain = (domain: string) => Array.from(new Set([
  ...(skillCatalog[domain] ?? []),
  ...skills.value.filter(skill => domainForSkill(skill) === domain && skill.tier === 2).map(skill => skill.name),
]));
const availableSkillNames = computed(() => secondaryNamesForDomain(selectedSkillDomain.value));
const availableMicroSkills = computed(() => Array.from(new Set([
  ...(microSkillCatalog[selectedCatalogSkill.value] ?? [`${selectedCatalogSkill.value}基础`, `${selectedCatalogSkill.value}实践`, `${selectedCatalogSkill.value}复盘`, `${selectedCatalogSkill.value}进阶`]),
  ...skills.value.filter(skill => skill.tier === 3 && skills.value.find(parent => parent.id === skill.parentId)?.name === selectedCatalogSkill.value).map(skill => skill.name),
])));
const skillUnlocked = (skill: Skill) => !skill.parentId || (skills.value.find(item => item.id === skill.parentId)?.level ?? 0) > 0;
const skillName = (id?: string) => skills.value.find(skill => skill.id === id)?.name ?? "起点";
const catalogCount = computed(() => Object.values(skillCatalog).reduce((sum, names) => sum + names.length, 0));
const selectedPlanSkillName = computed(() => selectedMicroSkill.value || selectedCatalogSkill.value);
const selectedSkillRecord = computed(() => skills.value.find(skill => skill.name === selectedPlanSkillName.value));
const selectedSkillIndex = computed(() => Math.max(0, availableSkillNames.value.indexOf(selectedCatalogSkill.value)));
const skillRoute = (domain: string) => domain === "身体健康" ? "health" : domain === "生活管理" ? "life" : domain === "创造表达" ? "creation" : domain.includes("关系") || domain === "人际沟通" ? "relationship" : domain === "财务资产" ? "finance" : "career";
const skillParentOptions = computed(() => skillAssignTarget.value === "main" ? quests.value.filter(q => q.status !== "done") : habits.value.filter(h => (h.cadence ?? "day") !== skillAssignTarget.value));

function navigate(view: View) {
  activeView.value = view;
  if (view === "archive") archiveTab.value = "profile";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function initialize() {
  const [savedProfile, savedHabits, savedCheckins, savedLogs, savedQuests, savedSkills, savedProgress] = await Promise.all([
    growthDb.getProfile(), growthDb.getHabits(), growthDb.getCheckins(), growthDb.getLogs(), growthDb.getQuests(), growthDb.getSkills(), growthDb.getActionProgress(),
  ]);
  if (savedProfile) Object.assign(profile, savedProfile); else await growthDb.saveProfile({ ...profile });
  habits.value = mergeSeeds(habitsSeed as HabitDefinition[], savedHabits).map(h => ({ cadence: "day", target: 1, ...h }));
  quests.value = mergeSeeds(questsSeed as Quest[], savedQuests).map(q => ({ role: "main", routeId: "career", ...q }));
  skills.value = mergeSeeds(skillsSeed as Skill[], savedSkills).map(skill => ({ ...skill, branch: skill.branch || domainForSkill(skill), tier: skill.tier || 1 }));
  checkins.value = savedCheckins; logs.value = savedLogs; actionProgress.value = savedProgress;
  const savedToday = savedCheckins.find(item => item.date === today); if (savedToday) Object.assign(currentCheckin, JSON.parse(JSON.stringify(savedToday)));
  habits.value.filter(h => h.cadence === "day").forEach(h => { if (!(h.id in currentCheckin.habits)) currentCheckin.habits[h.id] = false; });
  await Promise.all([...habits.value.map(x => growthDb.saveHabit({ ...x })), ...quests.value.map(x => growthDb.saveQuest({ ...x })), ...skills.value.map(x => growthDb.saveSkill({ ...x }))]);
  await syncProfile(); ready.value = true;
}
async function syncProfile() { profile.totalXp = totalXp.value; profile.level = Math.floor(totalXp.value / 120) + 1; profile.title = currentStage.value.title; await growthDb.saveProfile({ ...profile }); }
async function saveCheckin() {
  saved.value = false; currentCheckin.updatedAt = new Date().toISOString(); const clone = JSON.parse(JSON.stringify(currentCheckin)); await growthDb.saveCheckin(clone);
  const index = checkins.value.findIndex(item => item.date === today); if (index >= 0) checkins.value[index] = clone; else checkins.value.push(clone); await syncProfile(); saved.value = true;
}
async function toggleAction(action: HabitDefinition) {
  if ((action.cadence ?? "day") === "day") { const done = !currentCheckin.habits[action.id]; currentCheckin.habits[action.id] = done; await adjustSkillXp(action.skillId, done ? action.xp : -action.xp); await saveCheckin(); return; }
  const key = `${periodKey(action.cadence as Cadence)}:${action.id}`; let record = actionProgress.value.find(item => item.id === key);
  if (!record) { record = { id: key, actionId: action.id, periodKey: periodKey(action.cadence as Cadence), value: 0, completed: false, updatedAt: new Date().toISOString() }; actionProgress.value.push(record); }
  record.completed = !record.completed; record.value = record.completed ? (action.target ?? 1) : 0; record.updatedAt = new Date().toISOString(); await growthDb.saveActionProgress({ ...record }); await adjustSkillXp(action.skillId, record.completed ? action.xp : -action.xp); await syncProfile();
}
async function adjustSkillXp(skillId: string, delta: number) {
  const skill = skills.value.find(item => item.id === skillId); if (!skill) return;
  skill.xp = Math.max(0, skill.xp + delta);
  while (skill.xp >= skill.nextXp) { skill.xp -= skill.nextXp; skill.level += 1; skill.nextXp = Math.round(skill.nextXp * 1.3); }
  await growthDb.saveSkill({ ...skill });
  if (skill.parentId) await adjustSkillXp(skill.parentId, Math.round(delta * .4));
}
async function addAction() {
  if (!actionDraft.label.trim()) return;
  const validParent = actionParentOptions.value.some(item => item.id === actionDraft.parentId) ? actionDraft.parentId : undefined;
  const action: HabitDefinition = { id: `action-${crypto.randomUUID()}`, label: actionDraft.label.trim(), icon: actionDraft.icon || "✦", xp: Number(actionDraft.xp), skillId: actionDraft.skillId, cadence: actionDraft.cadence, parentId: validParent, relation: actionDraft.relation, target: Number(actionDraft.target), custom: true };
  habits.value.push(action); if (action.cadence === "day") currentCheckin.habits[action.id] = false; await growthDb.saveHabit(action); actionDraft.label = ""; showActionForm.value = false;
}
async function toggleQuest(quest: Quest) { quest.status = quest.status === "done" ? "todo" : "done"; quest.completedAt = quest.status === "done" ? new Date().toISOString() : undefined; await growthDb.saveQuest({ ...quest }); await syncProfile(); }
async function addQuest() {
  if (!questDraft.title.trim()) return; const quest: Quest = { id: `quest-${crypto.randomUUID()}`, ...questDraft, title: questDraft.title.trim(), description: questDraft.description.trim(), xp: Number(questDraft.xp), status: "todo", custom: true };
  quests.value.push(quest); await growthDb.saveQuest(quest); questDraft.title = ""; questDraft.description = ""; showQuestForm.value = false;
}
async function addSkill() {
  const name = skillDraft.catalogName === "__custom" ? skillDraft.customName.trim() : skillDraft.catalogName; if (!name) return;
  const skill: Skill = { id: `skill-${crypto.randomUUID()}`, name, icon: skillDraft.icon || "✧", color: "#8f6cff", level: 0, xp: 0, nextXp: 90, description: skillDraft.description.trim() || "由你加入个人技能星图的新节点", branch: skillDraft.domain, tier: Number(skillDraft.tier), parentId: skillDraft.parentId || undefined, custom: true };
  skills.value.push(skill); await growthDb.saveSkill(skill); selectedSkillDomain.value = skill.branch; skillDraft.catalogName = ""; skillDraft.customName = ""; showSkillForm.value = false;
}
async function addCustomTreeSkill() {
  const name = skillDraft.customName.trim(); if (!name) return;
  let parentSkill: Skill | undefined;
  if (Number(skillDraft.tier) === 3) {
    if (!skillDraft.parentName) return;
    parentSkill = skills.value.find(skill => skill.name === skillDraft.parentName && domainForSkill(skill) === skillDraft.domain);
    if (!parentSkill) {
      parentSkill = { id: `skill-${crypto.randomUUID()}`, name: skillDraft.parentName, icon: "◇", color: "#8b68df", level: 0, xp: 0, nextXp: 120, description: `${skillDraft.domain}下的二级能力`, branch: skillDraft.domain, tier: 2, custom: false };
      skills.value.push(parentSkill); await growthDb.saveSkill(parentSkill);
    }
  }
  const existing = skills.value.find(skill => skill.name === name && domainForSkill(skill) === skillDraft.domain);
  if (!existing) {
    const skill: Skill = { id: `skill-${crypto.randomUUID()}`, name, icon: Number(skillDraft.tier) === 3 ? "✦" : "◇", color: "#9b75ff", level: 0, xp: 0, nextXp: 90, description: skillDraft.description.trim() || `自定义${Number(skillDraft.tier) === 3 ? "三级技能点" : "二级能力"}`, branch: skillDraft.domain, tier: Number(skillDraft.tier), parentId: parentSkill?.id, custom: true };
    skills.value.push(skill); await growthDb.saveSkill(skill);
  }
  selectedSkillDomain.value = skillDraft.domain;
  selectedCatalogSkill.value = Number(skillDraft.tier) === 3 ? skillDraft.parentName : name;
  selectedMicroSkill.value = Number(skillDraft.tier) === 3 ? name : "";
  skillDraft.customName = ""; showSkillForm.value = false;
}
async function addSelectedSkillToPlan() {
  const name = selectedPlanSkillName.value || (skillDraft.catalogName === "__custom" ? skillDraft.customName.trim() : skillDraft.catalogName); if (!name) return;
  let parentSkill = skills.value.find(item => item.name === selectedCatalogSkill.value);
  if (selectedMicroSkill.value && !parentSkill) {
    parentSkill = { id: `skill-${crypto.randomUUID()}`, name: selectedCatalogSkill.value, icon: "◇", color: "#8b68df", level: 0, xp: 0, nextXp: 120, description: `${selectedSkillDomain.value}下的二级能力`, branch: selectedSkillDomain.value, tier: 2, custom: false };
    skills.value.push(parentSkill); await growthDb.saveSkill(parentSkill);
  }
  let skill = skills.value.find(item => item.name === name);
  if (!skill) {
    skill = { id: `skill-${crypto.randomUUID()}`, name, icon: selectedMicroSkill.value ? "✦" : "◇", color: "#9b75ff", level: 0, xp: 0, nextXp: 90, description: `通过真实行动点亮「${name}」`, branch: selectedSkillDomain.value, tier: selectedMicroSkill.value ? 3 : 2, parentId: selectedMicroSkill.value ? parentSkill?.id : undefined, custom: !!selectedMicroSkill.value };
    skills.value.push(skill); await growthDb.saveSkill(skill);
  }
  if (skillAssignTarget.value === "main") {
    const quest: Quest = { id: `quest-${crypto.randomUUID()}`, title: `点亮「${name}」`, description: `完成与「${name}」相关的一项真实成果。`, stageId: currentStage.value.id, category: selectedSkillDomain.value, xp: 80, skillId: skill.id, role: "main", routeId: skillRoute(selectedSkillDomain.value), status: "todo", custom: true };
    quests.value.push(quest); await growthDb.saveQuest(quest);
  } else {
    const action: HabitDefinition = { id: `action-${crypto.randomUUID()}`, label: `练习：${name}`, icon: "✦", xp: skillAssignTarget.value === "day" ? 10 : skillAssignTarget.value === "week" ? 35 : skillAssignTarget.value === "month" ? 90 : 220, skillId: skill.id, cadence: skillAssignTarget.value, parentId: skillAssignParentId.value || undefined, relation: "aggregate", target: 1, custom: true };
    habits.value.push(action); if (action.cadence === "day") currentCheckin.habits[action.id] = false; await growthDb.saveHabit(action);
  }
  showSkillForm.value = false; skillAssignParentId.value = "";
}
async function addLog() {
  if (!logDraft.title.trim() || !logDraft.detail.trim()) return; const entry: GrowthLog = { id: crypto.randomUUID(), date: today, category: logDraft.category, title: logDraft.title.trim(), detail: logDraft.detail.trim(), insight: logDraft.insight.trim(), createdAt: new Date().toISOString() };
  logs.value.push(entry); await growthDb.saveLog(entry); Object.assign(logDraft, { category: "career", title: "", detail: "", insight: "" }); showLogForm.value = false;
}
async function removeLog(id: string) { await growthDb.deleteLog(id); logs.value = logs.value.filter(log => log.id !== id); }
function exportData() {
  const payload: BackupData = { version: 3, exportedAt: new Date().toISOString(), profile: { ...profile }, habits: habits.value, checkins: checkins.value, logs: logs.value, quests: quests.value, skills: skills.value, actionProgress: actionProgress.value };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = `growth-rpg-${today}.json`; link.click(); URL.revokeObjectURL(url);
}
async function importData(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = ""; if (!file) return;
  try {
    const parsed = JSON.parse(await file.text()) as Partial<BackupData>;
    const collections = [parsed.habits, parsed.checkins, parsed.logs, parsed.quests, parsed.skills, parsed.actionProgress];
    if (parsed.version !== 3 || parsed.profile?.id !== "player" || !collections.every(Array.isArray)) throw new Error("存档格式不正确或版本不受支持");
    if (!window.confirm(`将用「${file.name}」覆盖当前设备上的任务、技能、打卡和日志。建议先导出当前存档。是否继续？`)) return;
    await growthDb.restoreBackup(parsed as BackupData);
    window.alert("存档恢复完成，页面将重新载入。"); window.location.reload();
  } catch (error) { window.alert(error instanceof Error ? error.message : "无法读取这份存档"); }
}
onMounted(initialize);
</script>

<template>
  <main v-if="ready" class="app-shell">
    <div class="aurora a1"></div><div class="aurora a2"></div>
    <div class="galaxy-flow" aria-hidden="true"><i></i><i></i><span></span></div>
    <div class="celestial-orbit" aria-hidden="true"><i>✦</i><i>✧</i><i>⋆</i></div>
    <aside class="sidebar">
      <button type="button" class="brand" @click="navigate('actions')"><span>R</span><div><b>RE:ALIVE</b><small>GROWTH OPERATING SYSTEM</small></div></button>
      <nav><button v-for="view in views" :key="view.id" type="button" :data-view="view.id" :class="{ active: activeView === view.id }" @click="navigate(view.id)"><i>{{ view.icon }}</i><span>{{ view.label }}</span></button></nav>
      <button type="button" class="profile-dock" @click="navigate('archive')"><span>{{ profile.name.slice(0,1) }}</span><div><b>{{ profile.name }}</b><small>LV.{{ profile.level }} · {{ profile.title }}</small></div><i>→</i></button>
      <div class="sidebar-foot"><span><i></i>{{ saved ? '记录已保存到此设备' : '正在保存' }}</span><div class="archive-actions"><button @click="exportData">导出完整存档</button><label>导入并恢复<input type="file" accept="application/json,.json" @change="importData"></label></div></div>
    </aside>

    <section class="content">
      <header class="topbar"><div><p class="kicker">{{ activeView === 'actions' ? 'YOUR CURRENT CYCLE' : views.find(v => v.id === activeView)?.label }}</p><h1>{{ activeView === 'actions' ? '今天，从自己开始' : views.find(v => v.id === activeView)?.label }}</h1></div><div class="top-actions"><span>{{ new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'short'}) }}</span><button @click="activeView = 'archive'">{{ profile.name.slice(0,1) }}</button></div></header>

      <template v-if="activeView === 'actions'">
        <section class="progress-hero panel" :class="{ 'cycle-complete': cadenceCompletion === 100 }">
          <div class="home-cosmos" aria-hidden="true"><i></i><i></i><i></i><span></span><span></span><b>✦</b><b>✧</b></div>
          <div class="progress-copy"><p class="kicker">{{ cadenceTabs.find(t => t.id === selectedCadence)?.caption }}完成度</p><div class="hero-percent"><b>{{ cadenceCompletion }}</b><span>%</span></div><p>不是完成越多越好，而是让重要的事持续发生。</p></div>
          <div class="hero-progress"><div class="progress-track"><i :style="{width:cadenceCompletion+'%'}"></i><span class="progress-comet" :style="{left:cadenceCompletion+'%'}">✦</span></div><div class="progress-meta"><span>{{ actionsForCadence.filter(actionDone).length }} 项已完成</span><span>{{ actionsForCadence.length }} 项计划</span></div><div class="cycle-stats"><div><small>连续记录</small><b>{{ streak }} 天</b></div><div><small>当前阶段</small><b>{{ currentStage.title }}</b></div><div><small>总成长值</small><b>{{ totalXp }} XP</b></div></div></div>
        </section>
        <div class="cadence-switch"><button v-for="tab in cadenceTabs" :key="tab.id" :class="{active:selectedCadence===tab.id}" @click="selectedCadence=tab.id"><b>{{ tab.label }}</b><span>{{ tab.caption }}</span></button><button class="create-action" @click="actionDraft.cadence=selectedCadence;showActionForm=!showActionForm">＋ 新建{{ cadenceTabs.find(t=>t.id===selectedCadence)?.label }}行动</button></div>
        <form v-if="showActionForm" class="smart-form action-builder panel" @submit.prevent="addAction"><div class="form-title"><span>NEW ACTION</span><b>创建一个{{ cadenceLabel(actionDraft.cadence) }}行动</b></div><label class="icon-field">图标<input v-model="actionDraft.icon" maxlength="2"></label><label class="grow">行动名称<input v-model="actionDraft.label" placeholder="清晰、可完成，例如：周日整理下周菜单"></label><label>周期<select v-model="actionDraft.cadence" @change="actionDraft.parentId='' "><option v-for="tab in cadenceTabs" :key="tab.id" :value="tab.id">{{ tab.label }}</option></select></label><label v-if="nextCadence(actionDraft.cadence)">汇入哪个{{ cadenceLabel(nextCadence(actionDraft.cadence)) }}目标<select v-model="actionDraft.parentId"><option value="">暂不汇入</option><option v-for="item in actionParentOptions" :key="item.id" :value="item.id">{{ item.label }}</option></select></label><label v-if="actionDraft.parentId">汇聚方式<select v-model="actionDraft.relation"><option value="aggregate">累计：每次完成都计入上级</option><option value="transform">成果：本周期达标后计入一次</option></select></label><label>本周期目标<input v-model.number="actionDraft.target" type="number" min="1" max="99"></label><label>点亮技能<select v-model="actionDraft.skillId"><option v-for="skill in skills" :key="skill.id" :value="skill.id">{{ skill.name }}</option></select></label><button class="primary" type="submit">保存行动</button><div class="flow-preview"><span>{{ cadenceLabel(actionDraft.cadence) }}行动</span><i>汇聚</i><span>{{ actionDraft.parentId ? habits.find(item=>item.id===actionDraft.parentId)?.label : (nextCadence(actionDraft.cadence) ? `待选择${cadenceLabel(nextCadence(actionDraft.cadence))}目标` : '季度成果') }}</span><i>点亮</i><span>{{ selectedActionSkill?.name ?? '技能节点' }}</span><i>流向</i><strong>{{ selectedActionRoute.name }}</strong></div></form>
        <section class="action-layout compact"><article class="action-list panel"><div class="section-head"><div><p class="kicker">{{ cadenceLabel(selectedCadence) }}任务层</p><h2>{{ cadenceTabs.find(t=>t.id===selectedCadence)?.caption }}行动</h2></div><span>{{ actionsForCadence.length }} ITEMS</span></div><div class="action-cards"><button v-for="action in actionsForCadence" :key="action.id" type="button" :class="['action-card',{done:actionDone(action),derived:childrenOf(action.id).length}]" @click="childrenOf(action.id).length ? null : toggleAction(action)"><i class="action-check">{{ actionDone(action)?'✓':'' }}</i><span class="action-icon">{{ action.icon }}</span><div class="action-copy"><div><b>{{ action.label }}</b><em v-if="childrenOf(action.id).length">自动汇聚</em><em v-else-if="action.custom">自定义</em></div><small v-if="parentAction(action)"><strong>{{ action.relation==='transform'?'达标后汇入':'逐次向上汇入' }}</strong> {{ actionFlowLabel(action) }}</small><small v-else-if="childrenOf(action.id).length">由下级自动累计 · {{ actionValue(action) }}/{{ action.target ?? 1 }}</small><small v-else>独立行动</small><div class="skill-impact"><span :class="{lit:actionDone(action)}">✦</span><b>{{ actionDone(action)?'已点亮':'将点亮' }} · {{ skills.find(s=>s.id===action.skillId)?.name ?? '待关联技能' }}</b></div><div class="mini-progress" v-if="action.cadence!=='day'"><i :style="{width:actionPercent(action)+'%'}"></i></div></div><div class="action-reward"><b>{{ actionValue(action) }}/{{ action.target ?? 1 }}</b><small>{{ childrenOf(action.id).length?'自动累计':`+${action.xp} XP` }}</small></div></button><div v-if="!actionsForCadence.length" class="empty-inline">这个周期还没有行动，从技能星图选择节点加入。</div></div></article></section>
      </template>

      <template v-else-if="activeView === 'routes'">
        <section class="page-intro route-intro"><div><p class="kicker">ARCANE GROWTH JOURNEY</p><h2>每一次行动，都在星路上留下光</h2><p>日常习惯汇成周、月与季度成果；日志与任务成为里程碑证据，逐步点亮你的六条成长线。</p></div><button class="secondary" @click="activeView='archive';archiveTab='quests';showQuestForm=true">＋ 规划路线任务</button></section>
        <section class="growth-source-strip panel" aria-label="成长数据来源">
          <div><span>✦</span><b>{{ routeOverview.evidence }}</b><small>成长证据</small></div>
          <div v-for="tab in cadenceTabs" :key="tab.id"><span>{{ tab.id==='day'?'☀':tab.id==='week'?'☾':tab.id==='month'?'◐':'✧' }}</span><b>{{ routeDimensions.reduce((sum,route)=>sum+routeSources(route.id).actionCounts[tab.id],0) }}</b><small>{{ tab.label }}行动达成</small></div>
          <div><span>◇</span><b>{{ logs.length }}</b><small>成长日志</small></div>
          <div class="source-total"><span>已点亮</span><b>{{ routeOverview.lit }}<em>/24</em></b><small>成长节点</small></div>
        </section>
        <section class="arcane-route-map panel">
          <div class="map-aura" aria-hidden="true"><i></i><i></i><span>✦</span><span>✧</span></div>
          <div class="map-heading"><div><p class="kicker">YOUR LIVING CONSTELLATION</p><h3>魔法成长地图</h3><p>节点不是手动打卡。它们由其他页面的真实完成记录自动唤醒。</p></div><div class="map-score"><b>{{ routeOverview.progress }}%</b><small>生命图谱共鸣</small></div></div>
          <div class="route-spell-grid">
            <article v-for="route in routeDimensions" :key="route.id" :class="['spell-route',{selected:selectedRouteId===route.id}]" :style="{'--route':route.color}" @click="selectedRouteId=route.id">
              <button type="button" class="spell-route-title" @click.stop="selectedRouteId=route.id"><i>{{ route.icon }}</i><span><b>{{ route.name }}</b><small>{{ routePoints(route.id) }} 成长值 · {{ routeProgress(route.id) }}%</small></span><em>{{ selectedRouteId===route.id?'正在观测':'展开' }}</em></button>
              <div class="curve-stage">
                <svg viewBox="0 0 720 136" preserveAspectRatio="none" aria-hidden="true">
                  <defs><linearGradient :id="`route-gradient-${route.id}`" x1="0" y1="0" x2="1" y2="0"><stop offset="0" :stop-color="route.color" stop-opacity=".35"/><stop offset=".55" :stop-color="route.color"/><stop offset="1" stop-color="#f8dca8"/></linearGradient></defs>
                  <path class="curve-shadow" d="M24 90 C150 12 238 124 362 62 S566 20 696 74" pathLength="100"/>
                  <path class="curve-light" d="M24 90 C150 12 238 124 362 62 S566 20 696 74" pathLength="100" :stroke="`url(#route-gradient-${route.id})`" :style="{strokeDashoffset:100-routeProgress(route.id)}"/>
                </svg>
                <button v-for="(node,index) in route.nodes" :key="node" type="button" :class="['route-star',`star-${index}`,{lit:routeNodeReached(route.id,index),next:routeNextNodeIndex(route.id)===index}]" :aria-label="`${node}，${routeNodeReached(route.id,index)?'已点亮':'未点亮'}`" @click.stop="selectedRouteId=route.id">
                  <i>{{ routeNodeReached(route.id,index)?'✦':'✧' }}</i><span>{{ node }}</span><small>{{ routeThresholdLabel(index) }}</small>
                </button>
              </div>
              <div class="spell-route-foot"><span>{{ routeNextText(route.id) }}</span><i><b :style="{width:routeProgress(route.id)+'%'}"></b></i></div>
            </article>
          </div>
        </section>
        <section class="route-evidence panel" :style="{'--route':selectedRoute.color}">
          <div class="evidence-sigil"><span>{{ selectedRoute.icon }}</span><i></i></div>
          <div class="evidence-main"><div class="section-head"><div><p class="kicker">LIGHT SOURCES</p><h3>{{ selectedRoute.name }} · 点亮记录</h3></div><strong>{{ routePoints(selectedRoute.id) }} XP</strong></div>
            <div class="source-chips"><span>日 {{ routeSources(selectedRoute.id).actionCounts.day }}</span><span>周 {{ routeSources(selectedRoute.id).actionCounts.week }}</span><span>月 {{ routeSources(selectedRoute.id).actionCounts.month }}</span><span>季 {{ routeSources(selectedRoute.id).actionCounts.quarter }}</span><span>日志 {{ routeSources(selectedRoute.id).logCount }}</span><span>任务 {{ routeSources(selectedRoute.id).questCount }}</span></div>
            <div v-if="routeEvidence(selectedRoute.id).length" class="evidence-list"><article v-for="item in routeEvidence(selectedRoute.id).slice(0,5)" :key="item.id"><i>✦</i><div><b>{{ item.title }}</b><small>{{ item.date }} · {{ item.type }}</small></div><strong>+{{ item.xp }}</strong></article></div>
            <div v-else class="empty-evidence"><span>✧</span><div><b>这条星路仍在等待第一束光</b><p>回到行动首页完成一个关联行动，或在成长档案留下对应日志。</p></div></div>
          </div>
        </section>
      </template>

      <template v-else-if="activeView === 'skills'">
        <section class="skill-toolbar"><div><p class="kicker">SKILL UNIVERSE · {{ catalogCount }} PRESET NODES</p><h2>选择节点，加入你的成长配置</h2><p>技能节点由系统预置。你只需要选择它属于主线，还是日、周、月、季度行动。</p></div><button type="button" class="secondary" @click="skillDraft.domain=selectedSkillDomain;skillDraft.parentName=availableSkillNames[0] ?? '';showSkillForm=!showSkillForm">目录没有？新增技能</button></section>
        <div class="domain-tabs"><button v-for="domain in skillDomains" :key="domain" type="button" :class="{active:selectedSkillDomain===domain}" @click="selectedSkillDomain=domain;selectedCatalogSkill=skillCatalog[domain][0];selectedMicroSkill=''"><span>{{ domain }}</span><b>{{ skillCatalog[domain].length }}</b></button></div>
        <form v-if="showSkillForm" class="custom-skill-form panel" @submit.prevent="addCustomTreeSkill">
          <div class="custom-path"><p class="kicker">CUSTOM NODE</p><b>{{ skillDraft.domain }} <span>›</span> {{ Number(skillDraft.tier)===3 ? skillDraft.parentName+' › 三级技能点' : '二级能力' }}</b></div>
          <label>成长领域<select v-model="skillDraft.domain" @change="skillDraft.parentName=secondaryNamesForDomain(skillDraft.domain)[0] ?? ''"><option v-for="domain in skillDomains" :key="domain" :value="domain">{{ domain }}</option></select></label>
          <label>节点层级<select v-model.number="skillDraft.tier"><option :value="2">二级能力 · 圆形节点</option><option :value="3">三级技能 · 星形节点</option></select></label>
          <label v-if="Number(skillDraft.tier)===3">上级二级能力<select v-model="skillDraft.parentName"><option v-for="name in secondaryNamesForDomain(skillDraft.domain)" :key="name" :value="name">{{ name }}</option></select></label>
          <label class="grow">技能名称<input v-model="skillDraft.customName" :placeholder="Number(skillDraft.tier)===3?'例如：访谈提纲':'例如：用户研究'"></label>
          <button class="primary" type="submit">创建{{ Number(skillDraft.tier)===3?'星点':'节点' }}</button>
        </form>
        <section class="skill-console">
          <article class="talent-wheel panel">
            <div class="constellation"></div><div class="wheel-rings"></div>
            <div class="wheel-center"><span>✦</span><b>{{ selectedSkillDomain }}</b><small>领域根节点 · {{ activeSkillNodes.length }} 已点亮</small></div>
            <div v-for="(name,index) in availableSkillNames" :key="name" class="orbit-branch" :style="{'--angle':`${index*36}deg`}">
              <i></i><button type="button" :class="{active:skills.some(s=>s.name===name),selected:selectedCatalogSkill===name}" @click="selectedCatalogSkill=name;selectedMicroSkill=''">
                <span>{{ skills.some(s=>s.name===name)?'✦':'◇' }}</span><b>{{ name }}</b><small>二级能力</small>
              </button>
            </div>
            <button v-for="(micro,microIndex) in availableMicroSkills" :key="micro" type="button" class="micro-star" :class="{selected:selectedMicroSkill===micro,active:skills.some(s=>s.name===micro)}" :style="{'--micro-angle':`${selectedSkillIndex*36-12+microIndex*8}deg`}" @click="selectedMicroSkill=micro">
              <i>✦</i><span>{{ micro }}</span>
            </button>
            <div class="skill-legend"><span><i class="root-dot"></i>领域根节点</span><span><i class="branch-dot"></i>二级能力</span><span><i class="star-dot"></i>可练习技能点</span></div>
          </article>
          <aside :class="['skill-config','panel',{flip:[0,1,2,8,9].includes(selectedSkillIndex)}]">
            <button type="button" class="config-close" @click="selectedMicroSkill=''">×</button><p class="kicker">NODE LOADOUT</p>
            <div class="selected-skill"><span>{{ selectedSkillRecord?'✦':'◇' }}</span><div><h3>{{ selectedPlanSkillName }}</h3><p>{{ selectedMicroSkill ? `${selectedCatalogSkill} 下的技能点` : '选择外围星点可继续下钻' }}</p></div></div>
            <form @submit.prevent="addSelectedSkillToPlan"><label>加入到<select v-model="skillAssignTarget"><option value="main">当前主线任务</option><option value="day">每日行动</option><option value="week">每周行动</option><option value="month">每月行动</option><option value="quarter">季度行动</option></select></label><label v-if="skillAssignTarget!=='main'">汇入上级<select v-model="skillAssignParentId"><option value="">暂不关联</option><option v-for="item in skillParentOptions" :key="item.id" :value="item.id">{{ 'label' in item ? item.label : item.title }}</option></select></label><button class="primary wide" type="submit">{{ selectedSkillRecord?'加入新的练习':'点亮并加入计划' }}</button></form>
          </aside>
        </section>
      </template>

      <template v-else-if="activeView === 'archive'">
        <div class="archive-tabs"><button type="button" data-archive-tab="profile" :class="{active:archiveTab==='profile'}" @click.stop="archiveTab='profile'">个人中心</button><button type="button" data-archive-tab="quests" :class="{active:archiveTab==='quests'}" @click.stop="archiveTab='quests'">主副任务</button><button type="button" data-archive-tab="logs" :class="{active:archiveTab==='logs'}" @click.stop="archiveTab='logs'">成长日志</button></div>
        <template v-if="archiveTab==='profile'">
          <section class="profile-hero panel"><div class="profile-avatar">{{ profile.name.slice(0,1) }}</div><div class="profile-copy"><p class="kicker">PLAYER PROFILE</p><h2>{{ profile.name }}</h2><span>LV.{{ profile.level }} · {{ profile.title }} · {{ totalXp }} XP</span><p>我正在练习：把工作之外的人生重新建立起来，并让成长变成可持续的选择。</p></div><div class="profile-stage"><span>当前主线</span><b>{{ currentMainQuest?.title ?? '等待规划' }}</b><div class="mini-progress"><i :style="{width:stageProgress+'%'}"></i></div><small>{{ nextStage ? `距离 ${nextStage.title} 还差 ${Math.max(0,nextStage.minXp-totalXp)} XP` : '阶段已完成' }}</small></div></section>
          <section class="insight-grid"><article class="radar-card panel"><div class="section-head"><div><p class="kicker">SIX DIMENSIONS</p><h3>我的六维状态</h3></div><span class="growth-live"><i></i>任务完成后实时生长</span></div><div class="radar-wrap"><div class="radar-grid r1"></div><div class="radar-grid r2"></div><div class="radar-fill" :style="{clipPath:`polygon(${radarPolygon})`}"></div><span class="radar-label l1">能量 <b>{{ dimensionScores[0] }}</b></span><span class="radar-label l2">生活 <b>{{ dimensionScores[1] }}</b></span><span class="radar-label l3">职业 <b>{{ dimensionScores[2] }}</b></span><span class="radar-label l4">输出 <b>{{ dimensionScores[3] }}</b></span><span class="radar-label l5">关系 <b>{{ dimensionScores[4] }}</b></span><span class="radar-label l6">成长 <b>{{ dimensionScores[5] }}</b></span></div><p class="radar-note">完成行动会给关联技能增加经验，并同步推动对应维度；主线完成、日志沉淀和连续记录也会留下增长。</p></article><article class="analysis-card panel"><p class="kicker">SYSTEM ANALYSIS</p><h3>此刻的你</h3><div class="analysis-item"><span>01</span><p><b>生活恢复正在成为主线</b>你已经不只是在追求职业效率，而是在重新设计可持续的生活。</p></div><div class="analysis-item"><span>02</span><p><b>当前瓶颈是稳定输出</b>把真实经历保存成日志和案例，会提升职业与创造两个维度。</p></div><div class="analysis-item"><span>03</span><p><b>下一步不是加更多任务</b>优先完成当前主线，再从支线中选择一项。</p></div></article></section>
          <section class="profile-lower"><article class="growth-chart panel"><div class="section-head"><div><p class="kicker">GROWTH TRACE</p><h3>最近 8 天成长线</h3></div><span>{{ streak }} DAY STREAK</span></div><div class="bars"><div v-for="day in growthBars" :key="day.key"><span><i :style="{height:Math.max(8,day.value*16)+'px'}"></i></span><small>{{ day.label }}</small></div></div></article><article class="timeline-card panel"><div class="section-head"><div><p class="kicker">RECENT EVIDENCE</p><h3>成长时间线</h3></div><button @click="archiveTab='logs'">查看全部</button></div><div v-if="recentLogs.length" class="mini-timeline"><div v-for="log in recentLogs.slice(0,3)" :key="log.id"><i></i><span><b>{{ log.title }}</b><small>{{ log.date }} · {{ log.category }}</small></span></div></div><div v-else class="empty-inline">还没有日志，从今天留下第一条证据。</div></article></section>
        </template>
        <template v-else-if="archiveTab==='quests'">
          <section class="page-intro"><div><p class="kicker">QUEST PLANNER</p><h2>规划主线，也保留支线</h2><p>主线代表当前最重要的改变；支线提供探索，但不抢占主线精力。</p></div><button class="primary" @click="showQuestForm=!showQuestForm">＋ 新建任务</button></section>
          <form v-if="showQuestForm" class="smart-form panel" @submit.prevent="addQuest"><label class="grow">任务名称<input v-model="questDraft.title" placeholder="我要完成……"></label><label class="grow">完成标准<input v-model="questDraft.description" placeholder="怎样算真正完成"></label><label>类型<select v-model="questDraft.role"><option value="main">主线任务</option><option value="side">支线任务</option></select></label><label>成长线<select v-model="questDraft.routeId"><option v-for="route in routeDimensions" :key="route.id" :value="route.id">{{ route.name }}</option></select></label><label>关联技能<select v-model="questDraft.skillId"><option v-for="skill in skills" :key="skill.id" :value="skill.id">{{ skill.name }}</option></select></label><label>奖励 XP<input v-model.number="questDraft.xp" type="number" min="5" max="500"></label><button class="primary" type="submit">保存任务</button></form>
          <section class="quest-columns"><article class="panel"><div class="section-head"><div><p class="kicker">MAIN QUEST</p><h3>当前主线</h3></div><span>{{ mainQuests.filter(q=>q.status!=='done').length }} ACTIVE</span></div><button v-for="quest in mainQuests" :key="quest.id" :class="['quest-item',{done:quest.status==='done'}]" @click="toggleQuest(quest)"><i>{{ quest.status==='done'?'✓':'' }}</i><div><b>{{ quest.title }}</b><small>{{ routeDimensions.find(r=>r.id===quest.routeId)?.name }} · {{ quest.description }}</small></div><span>+{{ quest.xp }}</span></button></article><article class="panel"><div class="section-head"><div><p class="kicker">SIDE QUEST</p><h3>探索支线</h3></div><span>{{ sideQuests.filter(q=>q.status!=='done').length }} ACTIVE</span></div><button v-for="quest in sideQuests" :key="quest.id" :class="['quest-item',{done:quest.status==='done'}]" @click="toggleQuest(quest)"><i>{{ quest.status==='done'?'✓':'' }}</i><div><b>{{ quest.title }}</b><small>{{ routeDimensions.find(r=>r.id===quest.routeId)?.name }} · {{ quest.description }}</small></div><span>+{{ quest.xp }}</span></button></article></section>
        </template>
        <template v-else>
          <section class="page-intro"><div><p class="kicker">GROWTH EVIDENCE</p><h2>成长日志与经历档案</h2><p>记录事实、判断与下一次行动，而不是只记录情绪。</p></div><button class="primary" @click="showLogForm=!showLogForm">＋ 新建日志</button></section>
          <form v-if="showLogForm" class="log-form panel" @submit.prevent="addLog"><label>分类<select v-model="logDraft.category"><option value="career">职业</option><option value="life">生活</option><option value="health">身体</option><option value="relationship">关系</option><option value="learning">学习</option></select></label><label class="grow">标题<input v-model="logDraft.title" placeholder="值得留下的事情"></label><label class="full">发生了什么？<textarea v-model="logDraft.detail"></textarea></label><label class="full">我因此看懂了什么？<textarea v-model="logDraft.insight"></textarea></label><button class="primary" type="submit">保存日志</button></form>
          <section class="log-list"><article v-if="!recentLogs.length" class="empty-state panel"><span>✦</span><h3>档案库仍是一片空白</h3><p>从今天、WMS、BI 或那次 AI 项目开始都可以。</p></article><article v-for="log in recentLogs" :key="log.id" class="log-entry panel"><time>{{ log.date.slice(5).replace('-', '.') }}</time><div><span>{{ log.category }}</span><h3>{{ log.title }}</h3><p>{{ log.detail }}</p><blockquote v-if="log.insight">{{ log.insight }}</blockquote></div><button @click="removeLog(log.id)">×</button></article></section>
        </template>
      </template>
    </section>
  </main>
  <div v-else class="loading"><span>R</span><p>正在加载你的成长系统…</p></div>
</template>
