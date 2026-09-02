import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { CustomValidationPipe } from '../../../common/pipes/validation.pipe';
import { ReorderMenuItemDto, ReorderMenusDto } from './reorder-menus.dto';

describe('ReorderMenusDto', () => {
  const pipe = new CustomValidationPipe();
  const valid = {
    version: 'sha256:abc',
    items: [
      { id: '1', parentId: null, sortOrder: 0 },
      { id: '2', parentId: '1', sortOrder: 0 },
    ],
  };

  function transform(value: unknown): Promise<ReorderMenusDto> {
    return pipe.transform(value, {
      type: 'body',
      metatype: ReorderMenusDto,
    });
  }

  it('transforms a valid tree reorder payload', async () => {
    const dto = await transform(valid);

    expect(dto).toBeInstanceOf(ReorderMenusDto);
    expect(dto.items[0]).toBeInstanceOf(ReorderMenuItemDto);
    expect(dto.items[0]).toMatchObject(valid.items[0]);
  });

  it.each([
    ['an empty version', { ...valid, version: '' }],
    ['empty items', { ...valid, items: [] }],
    ['a malformed nested item shape', { ...valid, items: [{}] }],
    ['a numeric item ID', { ...valid, items: [{ ...valid.items[0], id: 1 }] }],
    [
      'a numeric parent ID',
      { ...valid, items: [{ ...valid.items[0], parentId: 1 }] },
    ],
    [
      'an empty non-null parent ID',
      { ...valid, items: [{ ...valid.items[0], parentId: '' }] },
    ],
    [
      'a negative sort order',
      { ...valid, items: [{ ...valid.items[0], sortOrder: -1 }] },
    ],
    [
      'a fractional sort order',
      { ...valid, items: [{ ...valid.items[0], sortOrder: 0.5 }] },
    ],
  ])('rejects %s', async (_label, payload) => {
    await expect(transform(payload)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
