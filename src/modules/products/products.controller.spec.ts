import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { REQUIRE_ANY_PERMISSIONS_KEY } from '../../common/decorators/require-any-permissions.decorator';
import { PRODUCTS_PERMISSIONS } from './products-permissions';
import { ProductsController } from './products.controller';

describe('ProductsController image upload contract', () => {
  it('registers POST /products/images for create-or-update permission holders', () => {
    const handler = Reflect.get(ProductsController.prototype, 'stageImage') as
      object | undefined;

    expect(typeof handler).toBe('function');
    expect(Reflect.getMetadata(PATH_METADATA, handler!)).toBe('images');
    expect(Reflect.getMetadata(METHOD_METADATA, handler!)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(REQUIRE_ANY_PERMISSIONS_KEY, handler!)).toEqual([
      PRODUCTS_PERMISSIONS.CREATE,
      PRODUCTS_PERMISSIONS.UPDATE,
    ]);
  });
});
