import type { TemplateContent, TemplateTask } from '@shared/templates';

/** A built-in template (ADR-0024). IDs start with `builtin:`; they cannot be changed. */
export interface BuiltInTemplate {
  id: `builtin:${string}`;
  name: string;
  description: string;
  content: TemplateContent;
}

type Subtask = Omit<TemplateTask, 'subtasks'>;

/** A task with sensible empty defaults, so the lists below stay readable. */
function task(title: string, extra: Partial<TemplateTask> = {}): TemplateTask {
  return {
    title,
    description: null,
    priority: null,
    status: null,
    milestone: null,
    tags: [],
    start: null,
    due: null,
    fields: {},
    subtasks: [],
    ...extra,
  };
}

const sub = (title: string, extra: Partial<Subtask> = {}): Subtask => ({
  title,
  description: null,
  priority: null,
  status: null,
  milestone: null,
  tags: [],
  start: null,
  due: null,
  fields: {},
  ...extra,
});

const SOFTWARE: TemplateContent = {
  version: 1,
  project: {
    kind: 'software',
    color: 'blue',
    description: 'Plan, build, and ship a piece of software in milestones.',
  },
  statuses: [
    { name: 'Backlog', category: 'todo', isDefault: true },
    { name: 'In progress', category: 'in_progress', isDefault: false },
    { name: 'In review', category: 'in_progress', isDefault: false },
    { name: 'Done', category: 'done', isDefault: false },
    { name: "Won't do", category: 'cancelled', isDefault: false },
  ],
  tags: [
    { name: 'Bug', color: 'red' },
    { name: 'Feature', color: 'green' },
    { name: 'Chore', color: 'slate' },
  ],
  milestones: [
    { key: 'design', name: 'Design', description: 'Scope and design agreed.', target: 14 },
    { key: 'beta', name: 'Beta', description: 'Usable by early testers.', target: 42 },
    { key: 'launch', name: 'Launch', description: 'Released to everyone.', target: 70 },
  ],
  fields: [
    { key: 'estimate', name: 'Estimate', type: 'number', options: [] },
    {
      key: 'area',
      name: 'Area',
      type: 'select',
      options: ['Front end', 'Back end', 'Infrastructure'],
    },
  ],
  tasks: [
    task('Write the project brief', { milestone: 'design', priority: 'high', due: 3 }),
    task('Gather requirements', {
      milestone: 'design',
      due: 7,
      subtasks: [sub('Interview users'), sub('List must-haves and nice-to-haves')],
    }),
    task('Design the architecture', {
      milestone: 'design',
      due: 12,
      tags: ['Feature'],
      fields: { area: 'Back end', estimate: 3 },
    }),
    task('Set up the repository and CI', {
      milestone: 'design',
      tags: ['Chore'],
      fields: { area: 'Infrastructure', estimate: 1 },
      subtasks: [sub('Linting and formatting'), sub('Automated tests on every change')],
    }),
    task('Build the first feature', {
      milestone: 'beta',
      tags: ['Feature'],
      fields: { area: 'Front end', estimate: 5 },
    }),
    task('Write user documentation', { milestone: 'beta', fields: { estimate: 2 } }),
    task('Run a beta with testers', {
      milestone: 'beta',
      due: 42,
      subtasks: [sub('Invite testers'), sub('Collect feedback'), sub('Triage the feedback')],
    }),
    task('Fix the bugs found in beta', { milestone: 'launch', tags: ['Bug'], priority: 'high' }),
    task('Prepare the release', {
      milestone: 'launch',
      due: 68,
      subtasks: [sub('Release notes'), sub('Final check of the build')],
    }),
    task('Launch', { milestone: 'launch', priority: 'urgent', due: 70 }),
  ],
  notes: [
    {
      title: 'Project brief',
      body: '# Project brief\n\n## Problem\n\nWhat problem does this solve, and for whom?\n\n## Goals\n\n- \n\n## Out of scope\n\n- \n\n## Risks\n\n- ',
    },
  ],
};

const PERSONAL: TemplateContent = {
  version: 1,
  project: {
    kind: 'general',
    color: 'teal',
    description: 'Everyday tasks and routines, reviewed once a week.',
  },
  statuses: [
    { name: 'To do', category: 'todo', isDefault: true },
    { name: 'Doing', category: 'in_progress', isDefault: false },
    { name: 'Done', category: 'done', isDefault: false },
  ],
  tags: [
    { name: 'Home', color: 'amber' },
    { name: 'Errands', color: 'violet' },
    { name: 'Health', color: 'green' },
  ],
  milestones: [
    {
      key: 'review',
      name: 'Weekly review',
      description: 'Look back and plan the week.',
      target: 7,
    },
  ],
  fields: [],
  tasks: [
    task('Plan the week', { milestone: 'review', due: 0, priority: 'high' }),
    task('Groceries', { tags: ['Errands'], subtasks: [sub('Make a list'), sub('Shop')] }),
    task('Clean the kitchen', { tags: ['Home'] }),
    task('Pay the bills', { tags: ['Home'], priority: 'high', due: 5 }),
    task('Exercise three times', { tags: ['Health'] }),
    task('Weekly review', {
      milestone: 'review',
      due: 7,
      subtasks: [
        sub('Clear the inbox'),
        sub('Check next week’s calendar'),
        sub('Choose three priorities'),
      ],
    }),
  ],
  notes: [
    {
      title: 'How I use this project',
      body: '# How I use this project\n\n- Add anything that needs doing to **To do**.\n- Move one or two things to **Doing** at a time.\n- Every week, run the **Weekly review**.',
    },
  ],
};

const STUDY: TemplateContent = {
  version: 1,
  project: {
    kind: 'general',
    color: 'violet',
    description: 'Learn a subject topic by topic, ahead of the exams.',
  },
  statuses: [
    { name: 'To study', category: 'todo', isDefault: true },
    { name: 'Studying', category: 'in_progress', isDefault: false },
    { name: 'Reviewing', category: 'in_progress', isDefault: false },
    { name: 'Learned', category: 'done', isDefault: false },
  ],
  tags: [
    { name: 'Reading', color: 'blue' },
    { name: 'Practice', color: 'orange' },
  ],
  milestones: [
    { key: 'midterm', name: 'Midterm', description: null, target: 30 },
    { key: 'final', name: 'Final exam', description: null, target: 90 },
  ],
  fields: [
    { key: 'confidence', name: 'Confidence', type: 'select', options: ['Low', 'Medium', 'High'] },
  ],
  tasks: [
    task('Topic 1: Foundations', {
      milestone: 'midterm',
      fields: { confidence: 'Low' },
      subtasks: [
        sub('Read the chapter', { tags: ['Reading'] }),
        sub('Do the exercises', { tags: ['Practice'] }),
      ],
    }),
    task('Topic 2: Core ideas', {
      milestone: 'midterm',
      subtasks: [
        sub('Read the chapter', { tags: ['Reading'] }),
        sub('Do the exercises', { tags: ['Practice'] }),
      ],
    }),
    task('Practice midterm', { milestone: 'midterm', due: 27, tags: ['Practice'] }),
    task('Topic 3: Applications', {
      milestone: 'final',
      subtasks: [
        sub('Read the chapter', { tags: ['Reading'] }),
        sub('Do the exercises', { tags: ['Practice'] }),
      ],
    }),
    task('Review weak topics', { milestone: 'final', priority: 'high', due: 80 }),
    task('Practice final exam', { milestone: 'final', due: 85, tags: ['Practice'] }),
  ],
  notes: [
    {
      title: 'Study plan',
      body: '# Study plan\n\n| Week | Topic | Done |\n| --- | --- | --- |\n| 1 | Foundations | |\n| 2 | Core ideas | |\n| 3 | Applications | |\n\nAfter each topic, set its **Confidence** and review the low ones first.',
    },
  ],
};

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    id: 'builtin:software',
    name: 'Software development',
    description: 'Backlog to launch in three milestones, with estimates and areas.',
    content: SOFTWARE,
  },
  {
    id: 'builtin:personal',
    name: 'Personal productivity',
    description: 'Home, errands, and health, with a weekly review.',
    content: PERSONAL,
  },
  {
    id: 'builtin:study',
    name: 'Study and learning',
    description: 'Topics with reading and exercises, toward a midterm and a final.',
    content: STUDY,
  },
];
