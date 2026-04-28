import { Briefcase, Clock3, ClipboardList, Code2, FileText, Folder, Search, Star } from 'lucide-react';
import type { StarterIdeaSection } from '../../components/StarterIdeasAccordion';

export const CODE_STARTER_SECTIONS: StarterIdeaSection[] = [
  {
    id: 'build',
    label: 'Build',
    items: [
      {
        id: 'ship-feature',
        title: 'Ship a feature',
        description: 'Implement a focused product change in the selected codebase.',
        prompt: 'Audit this codebase, find the right extension points, implement the feature cleanly, and explain the changes you made.',
        icon: Code2,
      },
      {
        id: 'refine-ui',
        title: 'Refine the UI',
        description: 'Improve polish, animation, spacing, and state handling to Claude-level quality.',
        prompt: 'Review this UI carefully, improve its layout, interaction polish, and motion, and keep the existing design language consistent.',
        icon: Briefcase,
      },
      {
        id: 'prepare-handoff',
        title: 'Prepare a handoff',
        description: 'Capture architecture, touched files, and next steps for the next engineer.',
        prompt: 'Study this project, summarize the relevant architecture, list the likely files involved, and draft a crisp engineering handoff with next steps and risks.',
        icon: ClipboardList,
      },
    ],
  },
  {
    id: 'debug',
    label: 'Debug',
    items: [
      {
        id: 'debug-failure',
        title: 'Debug a failure',
        description: 'Trace a bug, identify the real cause, and patch it without regressions.',
        prompt: 'Investigate the broken flow in this folder, identify the root cause, fix it, and verify the affected behavior.',
        icon: Search,
      },
      {
        id: 'stabilize-regression',
        title: 'Stabilize a regression',
        description: 'Lock down a broken path and reduce the chance of repeat failures.',
        prompt: 'Find the source of the recent regression in this project, fix it carefully, and add the smallest practical validation or safeguard so it is less likely to recur.',
        icon: Clock3,
      },
    ],
  },
  {
    id: 'understand',
    label: 'Understand',
    items: [
      {
        id: 'map-system',
        title: 'Map the system',
        description: 'Explain how the codebase is organized and where key flows live.',
        prompt: 'Audit this repository and explain the main architecture, the key entry points, and where I should look to understand the important workflows.',
        icon: FileText,
      },
      {
        id: 'trace-flow',
        title: 'Trace a flow',
        description: 'Follow one feature end to end and show how data moves.',
        prompt: 'Trace the relevant feature flow in this codebase end to end, identify the important files and state transitions, and explain how the data moves through the system.',
        icon: Folder,
      },
    ],
  },
  {
    id: 'claudes-choice',
    label: 'Claude’s choice',
    items: [
      {
        id: 'high-leverage-improvement',
        title: 'Find the best improvement',
        description: 'Let Claude inspect the repo and choose the highest-leverage next step.',
        prompt: 'Audit this repository like a strong senior engineer, identify the single highest-leverage improvement to make next, implement it if appropriate, and explain why it mattered most.',
        icon: Star,
      },
    ],
  },
];

export const CODE_MODE_BASICS = [
  ['Workspace aware', 'Start from a real local folder and keep that context when the conversation opens.'],
  ['Mode persistent', 'New coding conversations stay in `/code` instead of bouncing back to chat.'],
  ['Same shell quality', 'Composer spacing, surfaces, and interaction patterns now align with the main app shell.'],
] as const;
