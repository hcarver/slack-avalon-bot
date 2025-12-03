/**
 * Game phases representing the state machine of an Avalon game
 */
export enum GamePhase {
  NOT_STARTED = 'NOT_STARTED',
  ROLE_ASSIGNMENT = 'ROLE_ASSIGNMENT',
  TEAM_SELECTION = 'TEAM_SELECTION',
  TEAM_VOTING = 'TEAM_VOTING',
  QUEST_EXECUTION = 'QUEST_EXECUTION',
  ASSASSINATION = 'ASSASSINATION',
  GAME_ENDED = 'GAME_ENDED'
}

export class GamePhaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GamePhaseError';
  }
}

/**
 * State machine for game phases
 * Ensures valid phase transitions and prevents invalid operations
 */
export class GamePhaseManager {
  private currentPhase: GamePhase = GamePhase.NOT_STARTED;
  
  // Valid phase transitions
  private static readonly VALID_TRANSITIONS: Map<GamePhase, GamePhase[]> = new Map([
    [GamePhase.NOT_STARTED, [GamePhase.ROLE_ASSIGNMENT]],
    [GamePhase.ROLE_ASSIGNMENT, [GamePhase.TEAM_SELECTION]],
    [GamePhase.TEAM_SELECTION, [GamePhase.TEAM_VOTING, GamePhase.GAME_ENDED]], // GAME_ENDED for 5 rejections
    [GamePhase.TEAM_VOTING, [GamePhase.TEAM_SELECTION, GamePhase.QUEST_EXECUTION]], // Back to selection if rejected
    [GamePhase.QUEST_EXECUTION, [GamePhase.TEAM_SELECTION, GamePhase.ASSASSINATION, GamePhase.GAME_ENDED]],
    [GamePhase.ASSASSINATION, [GamePhase.GAME_ENDED]],
    [GamePhase.GAME_ENDED, []] // Terminal state
  ]);

  constructor(initialPhase: GamePhase = GamePhase.NOT_STARTED) {
    this.currentPhase = initialPhase;
  }

  /**
   * Get current phase
   */
  getCurrentPhase(): GamePhase {
    return this.currentPhase;
  }

  /**
   * Transition to a new phase
   * @throws GamePhaseError if transition is invalid
   */
  transitionTo(newPhase: GamePhase): void {
    const validTransitions = GamePhaseManager.VALID_TRANSITIONS.get(this.currentPhase);
    
    if (!validTransitions) {
      throw new GamePhaseError(`No valid transitions defined for phase ${this.currentPhase}`);
    }

    if (!validTransitions.includes(newPhase)) {
      throw new GamePhaseError(
        `Invalid phase transition: ${this.currentPhase} -> ${newPhase}. Valid transitions: ${validTransitions.join(', ')}`
      );
    }

    this.currentPhase = newPhase;
  }

  /**
   * Check if a specific transition is valid
   */
  canTransitionTo(newPhase: GamePhase): boolean {
    const validTransitions = GamePhaseManager.VALID_TRANSITIONS.get(this.currentPhase);
    return validTransitions ? validTransitions.includes(newPhase) : false;
  }

  /**
   * Check if game is in a specific phase
   */
  isInPhase(phase: GamePhase): boolean {
    return this.currentPhase === phase;
  }

  /**
   * Check if game has started
   */
  hasStarted(): boolean {
    return this.currentPhase !== GamePhase.NOT_STARTED;
  }

  /**
   * Check if game has ended
   */
  hasEnded(): boolean {
    return this.currentPhase === GamePhase.GAME_ENDED;
  }

  /**
   * Force phase to GAME_ENDED (for error handling)
   */
  forceEnd(): void {
    this.currentPhase = GamePhase.GAME_ENDED;
  }

  /**
   * Get valid transitions from current phase
   */
  getValidTransitions(): GamePhase[] {
    return GamePhaseManager.VALID_TRANSITIONS.get(this.currentPhase) || [];
  }
}
