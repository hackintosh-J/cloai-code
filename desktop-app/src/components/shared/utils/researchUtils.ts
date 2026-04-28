/**
 * 研究事件处理相关工具函数
 */

/**
 * 应用research_*类型的SSE事件到消息数组中的最后一条助手消息
 * 返回新的消息数组（修改最后一条消息的克隆）
 */
export function applyResearchEvent(prev: any[], event: string, data: any): any[] {
  const newMsgs = [...prev];
  const lastIdx = newMsgs.length - 1;
  const lastMsg = newMsgs[lastIdx];
  if (!lastMsg || lastMsg.role !== 'assistant') return prev;

  const research = {
    ...(lastMsg.research || {
      sub_agents: [],
      sources: [],
      phase: null,
      plan: null,
      report: null,
      completed: false
    })
  };
  research.sub_agents = [...(research.sub_agents || [])];
  research.sources = [...(research.sources || [])];

  switch (event) {
    case 'research_phase':
      research.phase = data.phase;
      research.phase_label = data.label;
      break;

    case 'research_plan':
      research.plan = { title: data.title, sub_questions: data.sub_questions };
      break;

    case 'research_subagent_started': {
      const exists = research.sub_agents.find((a: any) => a.id === data.sub_agent_id);
      if (!exists) {
        research.sub_agents.push({
          id: data.sub_agent_id,
          index: data.index,
          sub_question: data.sub_question,
          status: 'running',
          sources: [],
          findings: '',
        });
      }
      break;
    }

    case 'research_source': {
      const sub = research.sub_agents.find((a: any) => a.id === data.sub_agent_id);
      if (sub) {
        sub.sources = [...sub.sources, data.source];
      }
      // 全局去重
      const exists = research.sources.find((s: any) => s.url === data.source.url);
      if (!exists) research.sources.push(data.source);
      break;
    }

    case 'research_finding': {
      const sub = research.sub_agents.find((a: any) => a.id === data.sub_agent_id);
      if (sub) {
        sub.findings = data.markdown || '';
      }
      break;
    }

    case 'research_subagent_done': {
      const sub = research.sub_agents.find((a: any) => a.id === data.sub_agent_id);
      if (sub) {
        sub.status = data.error ? 'error' : 'done';
        if (data.error) sub.error = data.error;
      }
      break;
    }

    case 'research_report':
      research.report = data.markdown;
      break;

    case 'research_done':
      research.completed = true;
      research.duration_ms = data.duration_ms;
      break;

    case 'research_error':
      research.error = data.error;
      research.completed = true;
      break;
  }

  newMsgs[lastIdx] = { ...lastMsg, research };
  return newMsgs;
}
