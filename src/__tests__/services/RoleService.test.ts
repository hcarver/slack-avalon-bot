import { RoleService } from '../../services/RoleService';
import { Player, Role, PlayerId } from '../../types';
import { UserId } from '../../slack-api-rx';
import { GameConfiguration } from '../../domain/GameConfiguration';

describe('RoleService', () => {
  let roleService: RoleService;
  let mockGameConfig: jest.Mocked<GameConfiguration>;
  let players: Player[];

  beforeEach(() => {
    players = [
      new Player('p1' as PlayerId, 'u1' as UserId),
      new Player('p2' as PlayerId, 'u2' as UserId),
      new Player('p3' as PlayerId, 'u3' as UserId),
      new Player('p4' as PlayerId, 'u4' as UserId),
      new Player('p5' as PlayerId, 'u5' as UserId)
    ];

    mockGameConfig = {
      getRoleAssignments: jest.fn()
    } as any;

    roleService = new RoleService(mockGameConfig);
  });

  describe('assignRoles with standard game', () => {
    beforeEach(() => {
      mockGameConfig.getRoleAssignments.mockReturnValue([
        'good' as Role,
        'good' as Role,
        'good' as Role,
        'bad' as Role,
        'bad' as Role
      ]);
    });

    it('should assign roles to all players', () => {
      const result = roleService.assignRoles(players);

      players.forEach(player => {
        expect(player.role).toBeDefined();
        expect(['good', 'bad']).toContain(player.role);
      });
    });

    it('should assign correct number of evil and good players', () => {
      const result = roleService.assignRoles(players);

      const goodPlayers = players.filter(p => !p.isEvil());
      const evilPlayers = players.filter(p => p.isEvil());

      expect(goodPlayers.length).toBe(3);
      expect(evilPlayers.length).toBe(2);
    });

    it('should return evils array matching evil players', () => {
      const result = roleService.assignRoles(players);

      expect(result.evils.length).toBe(2);
      result.evils.forEach(evil => {
        expect(evil.isEvil()).toBe(true);
      });
    });

    it('should assign assassin to one of the evil players', () => {
      const result = roleService.assignRoles(players);

      expect(result.evils).toContain(result.assassin);
      expect(result.assassin.isEvil()).toBe(true);
    });

    it('should shuffle roles randomly', () => {
      const results = new Set<string>();

      for (let i = 0; i < 20; i++) {
        const testPlayers = [
          new Player('p1' as PlayerId, 'u1' as UserId),
          new Player('p2' as PlayerId, 'u2' as UserId),
          new Player('p3' as PlayerId, 'u3' as UserId),
          new Player('p4' as PlayerId, 'u4' as UserId),
          new Player('p5' as PlayerId, 'u5' as UserId)
        ];

        roleService.assignRoles(testPlayers);
        const roleString = testPlayers.map(p => p.role).join(',');
        results.add(roleString);
      }

      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('assignRoles with special roles', () => {
    beforeEach(() => {
      mockGameConfig.getRoleAssignments.mockReturnValue([
        'good' as Role,
        'merlin' as Role,
        'percival' as Role,
        'mordred' as Role,
        'morgana' as Role
      ]);
    });

    it('should assign special roles correctly', () => {
      const result = roleService.assignRoles(players);

      const roles = players.map(p => p.role);

      expect(roles).toContain('merlin');
      expect(roles).toContain('percival');
      expect(roles).toContain('mordred');
      expect(roles).toContain('morgana');
    });

    it('should identify special evil roles as evil', () => {
      const result = roleService.assignRoles(players);

      const mordred = players.find(p => p.role === 'mordred');
      const morgana = players.find(p => p.role === 'morgana');

      expect(mordred?.isEvil()).toBe(true);
      expect(morgana?.isEvil()).toBe(true);

      expect(result.evils).toContain(mordred);
      expect(result.evils).toContain(morgana);
    });

    it('should identify special good roles as good', () => {
      const result = roleService.assignRoles(players);

      const merlin = players.find(p => p.role === 'merlin');
      const percival = players.find(p => p.role === 'percival');

      expect(merlin?.isEvil()).toBe(false);
      expect(percival?.isEvil()).toBe(false);

      expect(result.evils).not.toContain(merlin);
      expect(result.evils).not.toContain(percival);
    });
  });

  describe('assassin selection preference', () => {
    it('should prefer generic evil player (bad) as assassin', () => {
      mockGameConfig.getRoleAssignments.mockReturnValue([
        'good' as Role,
        'good' as Role,
        'bad' as Role,
        'mordred' as Role,
        'morgana' as Role
      ]);

      const results: Player[] = [];

      for (let i = 0; i < 20; i++) {
        const testPlayers = [
          new Player('p1' as PlayerId, 'u1' as UserId),
          new Player('p2' as PlayerId, 'u2' as UserId),
          new Player('p3' as PlayerId, 'u3' as UserId),
          new Player('p4' as PlayerId, 'u4' as UserId),
          new Player('p5' as PlayerId, 'u5' as UserId)
        ];

        const result = roleService.assignRoles(testPlayers);
        results.push(result.assassin);
      }

      const genericEvilAssassins = results.filter(a => a.role === 'bad');

      expect(genericEvilAssassins.length).toBe(20);
    });

    it('should assign assassin to special role if no generic evil exists', () => {
      mockGameConfig.getRoleAssignments.mockReturnValue([
        'good' as Role,
        'good' as Role,
        'good' as Role,
        'mordred' as Role,
        'morgana' as Role
      ]);

      const result = roleService.assignRoles(players);

      expect(['mordred', 'morgana']).toContain(result.assassin.role);
      expect(result.evils).toContain(result.assassin);
    });

    it('should randomly select from multiple generic evil players', () => {
      mockGameConfig.getRoleAssignments.mockReturnValue([
        'good' as Role,
        'bad' as Role,
        'bad' as Role,
        'bad' as Role,
        'mordred' as Role
      ]);

      const assassins = new Set<string>();

      for (let i = 0; i < 30; i++) {
        const testPlayers = [
          new Player('p1' as PlayerId, 'u1' as UserId),
          new Player('p2' as PlayerId, 'u2' as UserId),
          new Player('p3' as PlayerId, 'u3' as UserId),
          new Player('p4' as PlayerId, 'u4' as UserId),
          new Player('p5' as PlayerId, 'u5' as UserId)
        ];

        const result = roleService.assignRoles(testPlayers);
        assassins.add(result.assassin.playerId);
      }

      expect(assassins.size).toBeGreaterThan(1);
    });
  });
});
