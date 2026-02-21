export interface Memory {
  id: number;
  key: string;
  value: string;
  type: string;
  context: string | null;
  agent_id: string | null;
  created_at: string;
  updated_at: string;
  access_count: number;
  tags: string[];
}

export interface Activity {
  id: number;
  agent_id: string;
  action: string;
  target_key: string | null;
  detail: string | null;
  created_at: string;
}

export interface Handoff {
  id: number;
  from_agent: string;
  to_agent: string | null;
  status: string;
  summary: string;
  stuck_reason: string | null;
  next_steps: string;
  context_keys: string[];
  picked_up_by: string | null;
  created_at: string;
  picked_up_at: string | null;
  completed_at: string | null;
}

export interface WidgetProps {
  memories?: Memory[];
  activities?: Activity[];
  total?: number;
  query?: string;
  action?: string;
  memory?: Memory;
  deletedKey?: string;
  deletedType?: string;
  agent?: string;
  handoff?: Handoff;
  contextMemories?: Memory[];
  decisions?: Memory[];
  preferences?: Memory[];
}
