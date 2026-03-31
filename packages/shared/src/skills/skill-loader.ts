// ---------------------------------------------------------------------------
// Skill Loader — inspired by src/ skills-as-markdown pattern
//
// Skills are Markdown files that contain domain knowledge, instructions, and
// workflows. They get injected into agent system prompts based on task type.
// ---------------------------------------------------------------------------

import { readFile, readdir, access } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';

export interface Skill {
  /** Unique skill identifier (filename without extension) */
  id: string;
  /** Skill title (from first # heading) */
  title: string;
  /** Raw markdown content */
  content: string;
  /** Which agent types can use this skill */
  agentTypes: string[];
  /** Which task types trigger this skill */
  taskTypes: string[];
  /** File path the skill was loaded from */
  filePath: string;
}

/**
 * Parse frontmatter-like metadata from a skill markdown file.
 * Expects YAML frontmatter between --- delimiters at the top.
 */
function parseSkillMetadata(content: string): {
  agentTypes: string[];
  taskTypes: string[];
  title: string;
  body: string;
} {
  const defaults = { agentTypes: ['*'], taskTypes: ['*'], title: '', body: content };

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    // No frontmatter — extract title from first heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    return { ...defaults, title: titleMatch?.[1] ?? '', body: content };
  }

  const frontmatter = frontmatterMatch[1]!;
  const body = frontmatterMatch[2]!;

  const agentTypesMatch = frontmatter.match(/agentTypes:\s*\[([^\]]*)\]/);
  const taskTypesMatch = frontmatter.match(/taskTypes:\s*\[([^\]]*)\]/);
  const titleMatch = body.match(/^#\s+(.+)$/m);

  return {
    agentTypes: agentTypesMatch
      ? agentTypesMatch[1]!.split(',').map(s => s.trim().replace(/['"]/g, ''))
      : ['*'],
    taskTypes: taskTypesMatch
      ? taskTypesMatch[1]!.split(',').map(s => s.trim().replace(/['"]/g, ''))
      : ['*'],
    title: titleMatch?.[1] ?? '',
    body,
  };
}

/**
 * Load a single skill from a markdown file.
 */
export async function loadSkill(filePath: string): Promise<Skill | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const { agentTypes, taskTypes, title, body } = parseSkillMetadata(content);

    return {
      id: basename(filePath, extname(filePath)),
      title,
      content: body,
      agentTypes,
      taskTypes,
      filePath,
    };
  } catch {
    return null;
  }
}

/**
 * Load all skills from a directory.
 */
export async function loadSkillsFromDirectory(dirPath: string): Promise<Skill[]> {
  try {
    await access(dirPath);
  } catch {
    return [];
  }

  const files = await readdir(dirPath);
  const mdFiles = files.filter(f => f.endsWith('.md'));

  const skills: Skill[] = [];
  for (const file of mdFiles) {
    const skill = await loadSkill(join(dirPath, file));
    if (skill) skills.push(skill);
  }

  return skills;
}

/**
 * Filter skills relevant to a specific agent type and task type.
 */
export function filterSkills(
  skills: Skill[],
  agentType: string,
  taskType: string,
): Skill[] {
  return skills.filter(skill => {
    const agentMatch = skill.agentTypes.includes('*') || skill.agentTypes.includes(agentType);
    const taskMatch = skill.taskTypes.includes('*') || skill.taskTypes.includes(taskType);
    return agentMatch && taskMatch;
  });
}

/**
 * Build a system prompt section from relevant skills.
 */
export function buildSkillPromptSection(skills: Skill[]): string {
  if (skills.length === 0) return '';

  const sections = skills.map(s =>
    `<skill name="${s.id}">\n${s.content}\n</skill>`
  );

  return `\n\n## Relevant Skills\n\n${sections.join('\n\n')}`;
}
