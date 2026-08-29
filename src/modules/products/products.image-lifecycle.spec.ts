import { Product } from '../../entities/master/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductsService } from './products.service';

describe('ProductsService image lifecycle', () => {
  const temporaryPath =
    '/uploads/products/.tmp/11111111-1111-4111-8111-111111111111.png';
  const promotedPath =
    '/uploads/products/11111111-1111-4111-8111-111111111111.png';
  const oldPath = '/uploads/products/22222222-2222-4222-8222-222222222222.png';

  const createDto = (): CreateProductDto => ({
    code: 'PRD-001',
    name: 'Product 1',
    unitId: '1',
    modelId: '2',
    customerId: '3',
    locationId: '4',
    productTypeId: '5',
    deliveryTypeId: '6',
    loadingPointId: '7',
    processLineId: '8',
    productImagePath: temporaryPath,
  });

  const existingProduct = (): Product =>
    ({
      id: '10',
      code: 'PRD-001',
      name: 'Product 1',
      unitId: '1',
      modelId: '2',
      customerId: '3',
      packing: 1,
      locationId: '4',
      safetyStock: 1,
      productTypeId: '5',
      lotSize: 1,
      minStock: 1,
      deliveryTypeId: '6',
      scale: null,
      loadingPointId: '7',
      processLineId: '8',
      productImagePath: oldPath,
      isActive: true,
      createdBy: '9',
      updatedBy: null,
    }) as Product;

  function harness(productRepository: object) {
    const referenceRepository = {
      findOne: jest.fn().mockResolvedValue({ id: '1', isActive: true }),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === Product ? productRepository : referenceRepository,
      ),
    };
    const dataSource = {
      transaction: jest.fn((work: (value: typeof manager) => unknown) =>
        Promise.resolve(work(manager)),
      ),
    };
    const imageStorage = {
      stage: jest.fn(),
      promote: jest.fn().mockResolvedValue(promotedPath),
      discard: jest.fn().mockResolvedValue(undefined),
      cleanupStaleTemporaryFiles: jest.fn(),
    };
    const Constructor = ProductsService as unknown as new (
      ...args: unknown[]
    ) => ProductsService;
    const service = new Constructor(
      productRepository,
      referenceRepository,
      referenceRepository,
      referenceRepository,
      referenceRepository,
      referenceRepository,
      referenceRepository,
      referenceRepository,
      referenceRepository,
      dataSource,
      imageStorage,
    );
    return { service, imageStorage };
  }

  it('promotes a staged image before persisting a new product', async () => {
    const productRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...existingProduct(),
          productImagePath: promotedPath,
        }),
      create: jest.fn((value: Partial<Product>) => ({ id: '10', ...value })),
      save: jest.fn((value: Product) => Promise.resolve(value)),
    };
    const { service, imageStorage } = harness(productRepository);

    const result = await service.create(createDto(), '9');

    expect(result.productImagePath).toBe(promotedPath);
    expect(productRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ productImagePath: promotedPath }),
    );
    expect(imageStorage.discard).not.toHaveBeenCalled();
  });

  it('discards a promoted create image when the transaction fails', async () => {
    const productRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: Partial<Product>) => ({ id: '10', ...value })),
      save: jest.fn().mockRejectedValue(new Error('insert failed')),
    };
    const { service, imageStorage } = harness(productRepository);

    await expect(service.create(createDto(), '9')).rejects.toThrow(
      'insert failed',
    );
    expect(imageStorage.discard).toHaveBeenCalledWith(promotedPath);
  });

  it('promotes a replacement and discards the old image after update commits', async () => {
    const current = existingProduct();
    const productRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(current)
        .mockResolvedValueOnce({ ...current, productImagePath: promotedPath }),
      save: jest.fn((value: Product) => Promise.resolve(value)),
    };
    const { service, imageStorage } = harness(productRepository);

    const result = await service.update(
      current.id,
      { productImagePath: temporaryPath, updatedAt: new Date().toISOString() },
      '9',
    );

    expect(result.productImagePath).toBe(promotedPath);
    expect(productRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ productImagePath: promotedPath }),
    );
    expect(imageStorage.discard).toHaveBeenCalledWith(oldPath);
  });

  it('removes and discards the old image when productImagePath is null', async () => {
    const current = existingProduct();
    const productRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(current)
        .mockResolvedValueOnce({ ...current, productImagePath: null }),
      save: jest.fn((value: Product) => Promise.resolve(value)),
    };
    const { service, imageStorage } = harness(productRepository);

    const result = await service.update(
      current.id,
      { productImagePath: null, updatedAt: new Date().toISOString() },
      '9',
    );

    expect(result.productImagePath).toBeNull();
    expect(productRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ productImagePath: null }),
    );
    expect(imageStorage.promote).not.toHaveBeenCalled();
    expect(imageStorage.discard).toHaveBeenCalledWith(oldPath);
  });
});
