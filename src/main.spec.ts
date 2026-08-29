import { join, resolve as resolvePath } from 'node:path';
import { bootstrap } from './main';

// We control the `NestFactory.create` call from inside `bootstrap()` so we
// can capture the static-asset registrations on a per-test basis instead
// of fighting Jest's module cache.
let capturedUseStaticAssets: jest.Mock;

const mockDocumentBuilder = {
  setTitle: jest.fn().mockReturnThis(),
  setDescription: jest.fn().mockReturnThis(),
  setVersion: jest.fn().mockReturnThis(),
  addBearerAuth: jest.fn().mockReturnThis(),
  addTag: jest.fn().mockReturnThis(),
  build: jest.fn().mockReturnValue({}),
};

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn().mockImplementation(() =>
      Promise.resolve({
        setGlobalPrefix: jest.fn(),
        useStaticAssets: capturedUseStaticAssets,
        useGlobalPipes: jest.fn(),
        useGlobalInterceptors: jest.fn(),
        enableCors: jest.fn(),
        listen: jest.fn().mockResolvedValue(undefined),
      }),
    ),
  },
}));

// Re-export PartialType as an identity class so DTOs that `extend
// PartialType(...)` keep working under the swagger mock.
// We define the helper inside the factory because Jest hoists jest.mock
// above all `const`/`let` declarations, so a top-level binding wouldn't be
// initialized when the factory runs.
jest.mock('@nestjs/swagger', () => {
  const identity = <T>(cls: T) => cls;
  return {
    DocumentBuilder: jest.fn(() => mockDocumentBuilder),
    SwaggerModule: {
      createDocument: jest.fn().mockReturnValue({}),
      setup: jest.fn(),
    },
    PartialType: identity,
    OmitType: identity,
    PickType: identity,
  };
});

describe('bootstrap static uploads', () => {
  beforeEach(() => {
    capturedUseStaticAssets = jest.fn();
    delete process.env.MATERIAL_IMAGE_ROOT;
    delete process.env.PRODUCT_IMAGE_ROOT;
  });

  it('serves the default uploads tree at /uploads while preserving API routes', async () => {
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await bootstrap();

      const expectedRoot = resolvePath(
        join(process.cwd(), 'uploads', 'materials'),
      );
      // Higher-priority mount for staged images (must be registered first
      // so it wins over the broader `/uploads/materials/` mount).
      expect(capturedUseStaticAssets).toHaveBeenCalledWith(
        join(expectedRoot, '.tmp'),
        { prefix: '/uploads/materials/.tmp/' },
      );
      // Fallback mount for promoted images.
      expect(capturedUseStaticAssets).toHaveBeenCalledWith(expectedRoot, {
        prefix: '/uploads/materials/',
      });
      const expectedProductRoot = resolvePath(
        join(process.cwd(), 'uploads', 'products'),
      );
      expect(capturedUseStaticAssets).toHaveBeenCalledWith(
        join(expectedProductRoot, '.tmp'),
        { prefix: '/uploads/products/.tmp/' },
      );
      expect(capturedUseStaticAssets).toHaveBeenCalledWith(
        expectedProductRoot,
        { prefix: '/uploads/products/' },
      );
      expect(capturedUseStaticAssets).not.toHaveBeenCalledWith(
        process.cwd(),
        expect.anything(),
      );
    } finally {
      consoleLog.mockRestore();
    }
  });

  it('honours MATERIAL_IMAGE_ROOT when set in the environment', async () => {
    const previousRoot = process.env.MATERIAL_IMAGE_ROOT;
    const expected = 'D:/project-cps/New/image/materials';
    process.env.MATERIAL_IMAGE_ROOT = expected;
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await bootstrap();

      const expectedRoot = resolvePath(expected);
      expect(capturedUseStaticAssets).toHaveBeenCalledWith(
        join(expectedRoot, '.tmp'),
        { prefix: '/uploads/materials/.tmp/' },
      );
      expect(capturedUseStaticAssets).toHaveBeenCalledWith(expectedRoot, {
        prefix: '/uploads/materials/',
      });
    } finally {
      if (previousRoot === undefined) {
        delete process.env.MATERIAL_IMAGE_ROOT;
      } else {
        process.env.MATERIAL_IMAGE_ROOT = previousRoot;
      }
      consoleLog.mockRestore();
    }
  });

  it('honours PRODUCT_IMAGE_ROOT when set in the environment', async () => {
    const previousRoot = process.env.PRODUCT_IMAGE_ROOT;
    const expected = 'D:/project-cps/New/image/products';
    process.env.PRODUCT_IMAGE_ROOT = expected;
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await bootstrap();

      const expectedRoot = resolvePath(expected);
      expect(capturedUseStaticAssets).toHaveBeenCalledWith(
        join(expectedRoot, '.tmp'),
        { prefix: '/uploads/products/.tmp/' },
      );
      expect(capturedUseStaticAssets).toHaveBeenCalledWith(expectedRoot, {
        prefix: '/uploads/products/',
      });
    } finally {
      if (previousRoot === undefined) {
        delete process.env.PRODUCT_IMAGE_ROOT;
      } else {
        process.env.PRODUCT_IMAGE_ROOT = previousRoot;
      }
      consoleLog.mockRestore();
    }
  });
});
