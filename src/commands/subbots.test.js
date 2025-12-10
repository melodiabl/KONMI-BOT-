// src/commands/subbots.test.js
import { jest, describe, it, expect, afterEach, beforeEach } from '@jest/globals';

// Mock the subbot-manager functions at the top level
jest.mock('../services/subbot-manager.js', () => ({
  listUserSubbots: jest.fn(),
  listAllSubbots: jest.fn(),
}));

describe('Subbot Commands', () => {
  let mybots, bots, listUserSubbots, listAllSubbots;

  beforeEach(async () => {
    // Dynamically import the modules to get the mocked versions
    const subbotsModule = await import('./subbots.js');
    mybots = subbotsModule.mybots;
    bots = subbotsModule.bots;

    const managerModule = await import('../services/subbot-manager.js');
    listUserSubbots = managerModule.listUserSubbots;
    listAllSubbots = managerModule.listAllSubbots;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('mybots', () => {
    it('should display the correct pairing code and identification format', async () => {
      const mockSubbots = [
        {
          status: 'connected',
          type: 'code',
          metadata: {
            pairingCode: 'ABCD-1234',
            creatorPushName: 'TestUser',
          },
        },
      ];
      listUserSubbots.mockResolvedValue(mockSubbots);

      const result = await mybots({ usuario: '1234567890' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('*Código:* ABCD-1234');
      expect(result.message).toContain('*Identificación:* KONMISUB(TestUser)');
    });
  });

  describe('bots', () => {
    it('should display the correct pairing code and identification format for all subbots', async () => {
      const mockSubbots = [
        {
          status: 'connected',
          type: 'code',
          owner_number: '1234567890',
          metadata: {
            pairingCode: 'EFGH-5678',
            creatorPushName: 'AdminUser',
          },
        },
      ];
      listAllSubbots.mockResolvedValue(mockSubbots);

      // Set the owner number in the environment variables for the test
      process.env.OWNER_WHATSAPP_NUMBER = 'owner';

      const result = await bots({ usuario: 'owner' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('*Código:* EFGH-5678');
      expect(result.message).toContain('*Identificación:* KONMISUB(AdminUser)');

      // Clean up the environment variable
      delete process.env.OWNER_WHATSAPP_NUMBER;
    });
  });
});
