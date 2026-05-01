export type AppMode = 'chat' | 'code';

export type CodeLaunchPayload = {
  folderPath: string;
  prompt?: string;
  model?: string;
};

export type Announcement = {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at?: string;
};
