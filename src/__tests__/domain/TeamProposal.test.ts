import { TeamProposal } from '../../domain/TeamProposal';
import { Player, PlayerId } from '../../types';
import { UserId } from '../../slack-api-rx';

describe('TeamProposal', () => {
  let leader: Player;
  let member1: Player;
  let member2: Player;
  let member3: Player;
  let members: Player[];

  beforeEach(() => {
    leader = new Player('p1' as PlayerId, 'u1' as UserId);
    member1 = new Player('p2' as PlayerId, 'u2' as UserId);
    member2 = new Player('p3' as PlayerId, 'u3' as UserId);
    member3 = new Player('p4' as PlayerId, 'u4' as UserId);
    members = [member1, member2, member3];
  });

  describe('initialization', () => {
    it('should initialize with correct values', () => {
      const proposal = new TeamProposal(leader, members, 1, 2);
      
      expect(proposal.leader).toBe(leader);
      expect(proposal.members).toBe(members);
      expect(proposal.questNumber).toBe(1);
      expect(proposal.attemptNumber).toBe(2);
    });

    it('should default attemptNumber to 1 if not provided', () => {
      const proposal = new TeamProposal(leader, members, 0);
      
      expect(proposal.attemptNumber).toBe(1);
    });
  });

  describe('getMemberIds', () => {
    it('should return array of member playerIds', () => {
      const proposal = new TeamProposal(leader, members, 0);
      
      const ids = proposal.getMemberIds();
      
      expect(ids).toEqual(['p2', 'p3', 'p4']);
    });

    it('should return empty array for empty members', () => {
      const proposal = new TeamProposal(leader, [], 0);
      
      expect(proposal.getMemberIds()).toEqual([]);
    });

    it('should preserve order of members', () => {
      const reversedMembers = [member3, member2, member1];
      const proposal = new TeamProposal(leader, reversedMembers, 0);
      
      expect(proposal.getMemberIds()).toEqual(['p4', 'p3', 'p2']);
    });
  });

  describe('includesPlayer', () => {
    let proposal: TeamProposal;

    beforeEach(() => {
      proposal = new TeamProposal(leader, members, 0);
    });

    it('should return true if player is in team', () => {
      expect(proposal.includesPlayer('p2')).toBe(true);
      expect(proposal.includesPlayer('p3')).toBe(true);
      expect(proposal.includesPlayer('p4')).toBe(true);
    });

    it('should return false if player is not in team', () => {
      expect(proposal.includesPlayer('p1')).toBe(false);
      expect(proposal.includesPlayer('p5')).toBe(false);
      expect(proposal.includesPlayer('unknown')).toBe(false);
    });

    it('should return false for empty team', () => {
      const emptyProposal = new TeamProposal(leader, [], 0);
      
      expect(emptyProposal.includesPlayer('p2')).toBe(false);
    });
  });

  describe('getTeamSize', () => {
    it('should return correct team size', () => {
      const proposal = new TeamProposal(leader, members, 0);
      
      expect(proposal.getTeamSize()).toBe(3);
    });

    it('should return 0 for empty team', () => {
      const proposal = new TeamProposal(leader, [], 0);
      
      expect(proposal.getTeamSize()).toBe(0);
    });

    it('should return 1 for single member team', () => {
      const proposal = new TeamProposal(leader, [member1], 0);
      
      expect(proposal.getTeamSize()).toBe(1);
    });
  });

  describe('isLastAttempt', () => {
    it('should return false for attempts 1-4', () => {
      expect(new TeamProposal(leader, members, 0, 1).isLastAttempt()).toBe(false);
      expect(new TeamProposal(leader, members, 0, 2).isLastAttempt()).toBe(false);
      expect(new TeamProposal(leader, members, 0, 3).isLastAttempt()).toBe(false);
      expect(new TeamProposal(leader, members, 0, 4).isLastAttempt()).toBe(false);
    });

    it('should return true for attempt 5', () => {
      const proposal = new TeamProposal(leader, members, 0, 5);
      
      expect(proposal.isLastAttempt()).toBe(true);
    });

    it('should return true for attempts beyond 5', () => {
      expect(new TeamProposal(leader, members, 0, 6).isLastAttempt()).toBe(true);
      expect(new TeamProposal(leader, members, 0, 10).isLastAttempt()).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle leader also being a member', () => {
      const membersIncludingLeader = [leader, member1, member2];
      const proposal = new TeamProposal(leader, membersIncludingLeader, 0);
      
      expect(proposal.getTeamSize()).toBe(3);
      expect(proposal.includesPlayer('p1')).toBe(true);
    });

    it('should handle duplicate members', () => {
      const duplicateMembers = [member1, member1, member2];
      const proposal = new TeamProposal(leader, duplicateMembers, 0);
      
      expect(proposal.getTeamSize()).toBe(3);
      expect(proposal.getMemberIds()).toEqual(['p2', 'p2', 'p3']);
    });
  });
});
