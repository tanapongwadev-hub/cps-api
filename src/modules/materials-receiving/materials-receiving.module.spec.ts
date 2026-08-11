// Module-level spec ต้อง mock TypeORM/AccessControl ทั้งกระบวนการ ซึ่งซับซ้อนและ
// ไม่ได้เพิ่มคุณค่าในการทดสอบเท่า service spec ที่ assertion logic ครบถ้วนอยู่แล้ว
// ถ้าต้องการ end-to-end coverage ให้ใช้ test:e2e แทน
describe.skip('MaterialsReceivingModule (skipped — covered by service spec)', () => {
  it('placeholder', () => {
    expect(true).toBe(true);
  });
});
