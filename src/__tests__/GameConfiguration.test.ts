import { GameConfiguration } from '../domain/GameConfiguration';
import { Role } from '../types';

describe('GameConfiguration', () => {
  describe('constructor', () => {
    it('should initialize with basic settings', () => {
      const config = new GameConfiguration(5, ['merlin', 'percival'], false);

      expect(config.playerCount).toBe(5);
      expect(config.specialRoles).toEqual(['merlin', 'percival']);
      expect(config.resistance).toBe(false);
    });
  });

  describe('getEvilCount', () => {
    it('should return 2 evil for 5 players', () => {
      const config = new GameConfiguration(5, ['merlin'], false);
      expect(config.getEvilCount()).toBe(2);
    });

    it('should return 2 evil for 6 players', () => {
      const config = new GameConfiguration(6, ['merlin'], false);
      expect(config.getEvilCount()).toBe(2);
    });

    it('should return 3 evil for 7 players', () => {
      const config = new GameConfiguration(7, ['merlin'], false);
      expect(config.getEvilCount()).toBe(3);
    });

    it('should return 3 evil for 8 players', () => {
      const config = new GameConfiguration(8, ['merlin'], false);
      expect(config.getEvilCount()).toBe(3);
    });

    it('should return 3 evil for 9 players', () => {
      const config = new GameConfiguration(9, ['merlin'], false);
      expect(config.getEvilCount()).toBe(3);
    });

    it('should return 4 evil for 10 players', () => {
      const config = new GameConfiguration(10, ['merlin'], false);
      expect(config.getEvilCount()).toBe(4);
    });
  });

  describe('getGoodCount', () => {
    it('should return correct good count', () => {
      const config = new GameConfiguration(5, ['merlin'], false);
      expect(config.getGoodCount()).toBe(3);
    });

    it('should return correct good count for 7 players', () => {
      const config = new GameConfiguration(7, ['merlin'], false);
      expect(config.getGoodCount()).toBe(4);
    });
  });

  describe('getRoleAssignments', () => {
    it('should assign roles based on special roles selected', () => {
      const config = new GameConfiguration(5, ['merlin', 'percival'], false);
      const assignments = config.getRoleAssignments();

      expect(assignments.length).toBe(5);
      expect(assignments).toContain('merlin');
      expect(assignments).toContain('percival');

      const goodCount = assignments.filter(r => ['good', 'merlin', 'percival'].includes(r)).length;
      const evilCount = assignments.filter(r => !['good', 'merlin', 'percival'].includes(r)).length;

      expect(goodCount).toBe(3);
      expect(evilCount).toBe(2);
    });

    it('should fill remaining slots with generic roles', () => {
      const config = new GameConfiguration(5, ['merlin'], false);
      const assignments = config.getRoleAssignments();

      expect(assignments.length).toBe(5);

      const goodCount = assignments.filter(r => r === 'good').length;
      const evilCount = assignments.filter(r => r === 'bad' || r === 'assassin').length;

      expect(goodCount).toEqual(2);
      expect(evilCount).toEqual(2);
    });

    it('should handle multiple special roles', () => {
      const config = new GameConfiguration(7, ['merlin', 'percival', 'morgana', 'mordred'], false);
      const assignments = config.getRoleAssignments();

      expect(assignments.length).toBe(7);
      expect(assignments).toContain('merlin');
      expect(assignments).toContain('percival');
      expect(assignments).toContain('morgana');
      expect(assignments).toContain('mordred');
      expect(assignments.filter(r => r === 'good').length).toEqual(2);
      expect(assignments.filter(r => r === 'bad').length).toEqual(0); // All bad roles replaced
      expect(assignments).toContain('assassin'); // Assassin still present
    });
  });

  describe('quest assignments', () => {
    it('should have quest assignments for 5 players', () => {
      const config = new GameConfiguration(5, ['merlin'], false);
      const assignments = GameConfiguration.QUEST_ASSIGNMENTS[0];

      expect(assignments.length).toBe(5);
      expect(assignments[0].n).toBeGreaterThan(0);
      expect(assignments[0].f).toBeGreaterThan(0);
    });

    it('should have different team sizes for different quests', () => {
      const assignments = GameConfiguration.QUEST_ASSIGNMENTS[2]; // 7 players

      expect(assignments.length).toBe(5);
      // Quest 4 (index 3) with 7 players requires 2 fails
      expect(assignments[3].f).toBe(2);
    });
  });
});
