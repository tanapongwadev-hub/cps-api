import { join } from 'node:path';

const mockApp = {
  setGlobalPrefix: jest.fn(),
  useStaticAssets: jest.fn(),
  useGlobalPipes: jest.fn(),
  useGlobalInterceptors: jest.fn(),
  enableCors: jest.fn(),
  listen: jest.fn().mockResolvedValue(undefined),
};

const mockDocumentBuilder = {
  setTitle: jest.fn().mockReturnThis(),
  setDescription: jest.fn().mockReturnThis(),
  setVersion: jest.fn().mockReturnThis(),
  addBearerAuth: jest.fn().mockReturnThis(),
  addTag: jest.fn().mockReturnThis(),
  build: jest.fn().mockReturnValue({}),
};

jest.mock('@nestjs/core', () => ({
  NestFactory: { create: jest.fn().mockResolvedValue(mockApp) },
}));

jest.mock('@nestjs/swagger', () => ({
  DocumentBuilder: jest.fn(() => mockDocumentBuilder),
  SwaggerModule: {
    createDocument: jest.fn().mockReturnValue({}),
    setup: jest.fn(),
  },
}));

import './main';

describe('bootstrap static uploads', () => {
  it('serves only the uploads directory at /uploads while preserving API routes', async () => {
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockApp.setGlobalPrefix).toHaveBeenCalledWith('api/v1');
    expect(mockApp.useStaticAssets).toHaveBeenCalledWith(
      join(process.cwd(), 'uploads'),
      { prefix: '/uploads/' },
    );
    expect(mockApp.useStaticAssets).toHaveBeenCalledWith(
      join(process.cwd(), 'uploads', 'materials', '.tmp'),
      { prefix: '/uploads/materials/.tmp/' },
    );
    expect(mockApp.useStaticAssets).not.toHaveBeenCalledWith(
      process.cwd(),
      expect.anything(),
    );
    consoleLog.mockRestore();
  });
});
