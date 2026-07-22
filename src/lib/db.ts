import { openDB, type DBSchema } from "idb";
import type { ActionProgress, BackupData, Checkin, GrowthLog, HabitDefinition, Profile, Quest, Skill } from "../types";

interface GrowthRpgDB extends DBSchema {
  profile: { key: string; value: Profile };
  habits: { key: string; value: HabitDefinition };
  checkins: { key: string; value: Checkin; indexes: { "by-date": string } };
  logs: { key: string; value: GrowthLog; indexes: { "by-date": string } };
  quests: { key: string; value: Quest };
  skills: { key: string; value: Skill };
  actionProgress: { key: string; value: ActionProgress; indexes: { "by-action": string } };
}

const dbPromise = openDB<GrowthRpgDB>("growth-rpg", 3, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore("profile", { keyPath: "id" });
      const checkins = db.createObjectStore("checkins", { keyPath: "date" });
      checkins.createIndex("by-date", "date");
      const logs = db.createObjectStore("logs", { keyPath: "id" });
      logs.createIndex("by-date", "date");
      db.createObjectStore("quests", { keyPath: "id" });
      db.createObjectStore("skills", { keyPath: "id" });
    }
    if (oldVersion < 2) db.createObjectStore("habits", { keyPath: "id" });
    if (oldVersion < 3) {
      const progress = db.createObjectStore("actionProgress", { keyPath: "id" });
      progress.createIndex("by-action", "actionId");
    }
  },
});

export const growthDb = {
  async getProfile() { return (await dbPromise).get("profile", "player"); },
  async saveProfile(value: Profile) { return (await dbPromise).put("profile", value); },
  async getHabits() { return (await dbPromise).getAll("habits"); },
  async saveHabit(value: HabitDefinition) { return (await dbPromise).put("habits", value); },
  async deleteHabit(id: string) { return (await dbPromise).delete("habits", id); },
  async getCheckins() { return (await dbPromise).getAllFromIndex("checkins", "by-date"); },
  async saveCheckin(value: Checkin) { return (await dbPromise).put("checkins", value); },
  async getLogs() { return (await dbPromise).getAllFromIndex("logs", "by-date"); },
  async saveLog(value: GrowthLog) { return (await dbPromise).put("logs", value); },
  async deleteLog(id: string) { return (await dbPromise).delete("logs", id); },
  async getQuests() { return (await dbPromise).getAll("quests"); },
  async saveQuest(value: Quest) { return (await dbPromise).put("quests", value); },
  async getSkills() { return (await dbPromise).getAll("skills"); },
  async saveSkill(value: Skill) { return (await dbPromise).put("skills", value); },
  async getActionProgress() { return (await dbPromise).getAll("actionProgress"); },
  async saveActionProgress(value: ActionProgress) { return (await dbPromise).put("actionProgress", value); },
  async restoreBackup(backup: BackupData) {
    const db = await dbPromise;
    const names = ["profile", "habits", "checkins", "logs", "quests", "skills", "actionProgress"] as const;
    const tx = db.transaction(names, "readwrite");
    await Promise.all(names.map(name => tx.objectStore(name).clear()));
    await tx.objectStore("profile").put(backup.profile);
    await Promise.all([
      ...backup.habits.map(item => tx.objectStore("habits").put(item)),
      ...backup.checkins.map(item => tx.objectStore("checkins").put(item)),
      ...backup.logs.map(item => tx.objectStore("logs").put(item)),
      ...backup.quests.map(item => tx.objectStore("quests").put(item)),
      ...backup.skills.map(item => tx.objectStore("skills").put(item)),
      ...backup.actionProgress.map(item => tx.objectStore("actionProgress").put(item)),
    ]);
    await tx.done;
  },
};
