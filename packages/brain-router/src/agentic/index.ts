import { ChatInput, ChatOutput } from '@neuro/core';

export interface AgenticStrategy {
  name: string;
  description: string;
  execute(input: ChatInput): Promise<ChatOutput>;
}

export class RouterAgenticStrategy implements AgenticStrategy {
  name = 'cost-complexity-router';
  description = 'Evaluates prompt complexity with a fast model and routes to frontier models only when necessary';

  async execute(input: ChatInput): Promise<ChatOutput> {
    throw new Error('RouterAgenticStrategy is prepared for Phase 2 implementation.');
  }
}

export class EnsembleAgenticStrategy implements AgenticStrategy {
  name = 'ensemble-consensus';
  description = 'Queries multiple LLMs simultaneously and uses a judge to select or synthesize the best response';

  async execute(input: ChatInput): Promise<ChatOutput> {
    throw new Error('EnsembleAgenticStrategy is prepared for Phase 2 implementation.');
  }
}
