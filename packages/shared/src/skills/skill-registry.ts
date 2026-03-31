// ---------------------------------------------------------------------------
// Skill Registry — central registry for loaded skills
// ---------------------------------------------------------------------------

import type { Skill } from './skill-loader.js';
import { loadSkillsFromDirectory, filterSkills, buildSkillPromptSection } from './skill-loader.js';

/** In-memory skill registry */
const skillRegistry = new Map<string, Skill>();

/** Directories from which skills have been loaded */
const loadedDirectories = new Set<string>();

/**
 * Register a skill in the global registry.
 */
export function registerSkill(skill: Skill): void {
  skillRegistry.set(skill.id, skill);
}

/**
 * Get a skill by ID.
 */
export function getSkill(id: string): Skill | undefined {
  return skillRegistry.get(id);
}

/**
 * Get all registered skills.
 */
export function getAllSkills(): Skill[] {
  return Array.from(skillRegistry.values());
}

/**
 * Load and register all skills from a directory.
 */
export async function loadAndRegisterSkills(dirPath: string): Promise<number> {
  if (loadedDirectories.has(dirPath)) return 0;

  const skills = await loadSkillsFromDirectory(dirPath);
  for (const skill of skills) {
    registerSkill(skill);
  }

  loadedDirectories.add(dirPath);
  return skills.length;
}

/**
 * Get skills relevant to a specific agent+task and format as system prompt section.
 */
export function getSkillPromptForTask(agentType: string, taskType: string): string {
  const all = getAllSkills();
  const relevant = filterSkills(all, agentType, taskType);
  return buildSkillPromptSection(relevant);
}

/**
 * Clear all registered skills (mainly for testing).
 */
export function clearSkillRegistry(): void {
  skillRegistry.clear();
  loadedDirectories.clear();
}
