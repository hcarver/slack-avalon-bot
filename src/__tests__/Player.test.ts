import { Player, PlayerId, Role } from '../types';
import { UserId } from '../slack-api-rx';

describe('Player', () => {
  describe('isEvil', () => {
    it('should return false for good players', () => {
      const player = new Player('p1' as PlayerId, 'u1' as UserId, 'good');
      expect(player.isEvil()).toBe(false);
    });

    it('should return false for merlin', () => {
      const player = new Player('p1' as PlayerId, 'u1' as UserId, 'merlin');
      expect(player.isEvil()).toBe(false);
    });

    it('should return false for percival', () => {
      const player = new Player('p1' as PlayerId, 'u1' as UserId, 'percival');
      expect(player.isEvil()).toBe(false);
    });

    it('should return true for bad players', () => {
      const player = new Player('p1' as PlayerId, 'u1' as UserId, 'bad');
      expect(player.isEvil()).toBe(true);
    });

    it('should return true for morgana', () => {
      const player = new Player('p1' as PlayerId, 'u1' as UserId, 'morgana');
      expect(player.isEvil()).toBe(true);
    });

    it('should return true for mordred', () => {
      const player = new Player('p1' as PlayerId, 'u1' as UserId, 'mordred');
      expect(player.isEvil()).toBe(true);
    });

    it('should return true for oberon', () => {
      const player = new Player('p1' as PlayerId, 'u1' as UserId, 'oberon');
      expect(player.isEvil()).toBe(true);
    });

    it('should return true for assassin', () => {
      const player = new Player('p1' as PlayerId, 'u1' as UserId, 'assassin');
      expect(player.isEvil()).toBe(true);
    });
  });

  describe('isGood', () => {
    it('should return true for good players', () => {
      const player = new Player('p1' as PlayerId, 'u1' as UserId, 'good');
      expect(player.isGood()).toBe(true);
    });

    it('should return false for evil players', () => {
      const player = new Player('p1' as PlayerId, 'u1' as UserId, 'bad');
      expect(player.isGood()).toBe(false);
    });
  });
});
