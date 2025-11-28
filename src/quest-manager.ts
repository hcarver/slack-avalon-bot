import { Player, QuestAssignment, QuestResult } from "./types";

export class QuestManager {
  private progress: QuestResult[] = [];
  private questNumber: number = 0;
  private readonly minPlayers: number;
  private readonly questAssigns: QuestAssignment[][];

  constructor(
    numPlayers: number,
    minPlayers: number,
    questAssigns: QuestAssignment[][]
  ) {
    this.minPlayers = minPlayers;
    this.questAssigns = questAssigns;
  }

  /**
   * Get the current quest number (0-based)
   */
  getCurrentQuestNumber(): number {
    return this.questNumber;
  }

  /**
   * Get the quest assignment for the current quest
   */
  getCurrentQuestAssignment(): QuestAssignment {
    return this.questAssigns[this.minPlayers][this.questNumber];
  }

  /**
   * Get quest assignment for a specific quest number
   */
  getQuestAssignment(questNum: number): QuestAssignment {
    return this.questAssigns[this.minPlayers][questNum];
  }

  /**
   * Get all quest progress
   */
  getProgress(): QuestResult[] {
    return [...this.progress];
  }

  /**
   * Record a quest result
   */
  recordQuestResult(result: QuestResult): void {
    this.progress.push(result);
    this.questNumber++;
  }

  /**
   * Calculate the current score
   */
  calculateScore(): { good: number; bad: number } {
    const score = { good: 0, bad: 0 };
    for (let res of this.progress) {
      score[res]++;
    }
    return score;
  }

  /**
   * Check if the game should end
   * Returns: { ended: boolean, winner?: 'good' | 'evil', reason?: string }
   */
  checkGameEnd(): { ended: boolean; winner?: 'good' | 'evil'; reason?: string } {
    const score = this.calculateScore();
    
    if (score.bad >= 3) {
      return {
        ended: true,
        winner: 'evil',
        reason: 'failing 3 quests'
      };
    }
    
    if (score.good >= 3) {
      return {
        ended: true,
        winner: 'good',
        reason: 'succeeding 3 quests'
      };
    }
    
    return { ended: false };
  }

  /**
   * Evaluate quest outcome based on fail votes
   */
  evaluateQuestOutcome(
    failedVotes: Player[],
    succeededVotes: Player[]
  ): { result: QuestResult; message: string } {
    const questAssign = this.getCurrentQuestAssignment();
    const failCount = failedVotes.length;
    
    if (failCount === 0) {
      return {
        result: 'good',
        message: 'All team members succeeded!'
      };
    } else if (failCount < questAssign.f) {
      return {
        result: 'good',
        message: `${failCount} fail vote${failCount > 1 ? 's' : ''}, but ${questAssign.f} required to fail the quest`
      };
    } else {
      return {
        result: 'bad',
        message: `${failCount} fail vote${failCount > 1 ? 's' : ''} - quest failed!`
      };
    }
  }

  /**
   * Get a human-readable quest name
   */
  static getQuestName(questNumber: number, questOrder: string[]): string {
    const name = questOrder[questNumber];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  /**
   * Check if current quest requires 2 fails
   */
  requiresTwoFails(): boolean {
    return this.getCurrentQuestAssignment().f > 1;
  }

  /**
   * Get total number of quests
   */
  getTotalQuests(): number {
    return 5;
  }

  /**
   * Check if this is the last quest
   */
  isLastQuest(): boolean {
    return this.questNumber === 4;
  }

  /**
   * Get quests completed count
   */
  getQuestsCompleted(): number {
    return this.progress.length;
  }

  /**
   * Reset quest state (for new game)
   */
  reset(): void {
    this.progress = [];
    this.questNumber = 0;
  }
}
