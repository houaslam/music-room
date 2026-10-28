import { Test } from '@nestjs/testing';
import { PasswordHasher } from '@nestjs/authentication';
import { PasswordHashingModule } from './password-hashing.module.js';

describe('PasswordHashingModule', () => {
  let hasher: PasswordHasher;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PasswordHashingModule],
    }).compile();
    hasher = module.get(PasswordHasher);
  });

  it.each([
    ['128-character password', 'a'.repeat(127) + 'X', 'a'.repeat(127) + 'Y'],
    ['Unicode password', '🎵'.repeat(30) + 'X', '🎵'.repeat(30) + 'Y'],
    ['long refresh token', 'b'.repeat(199) + 'X', 'b'.repeat(199) + 'Y'],
  ])(
    'checks the complete %s, including bytes after 72',
    async (_, value, wrong) => {
      const hash = await hasher.hash(value);

      expect(hash).toMatch(/^\$scrypt\$ln=17,r=8,p=1\$/);
      expect(await hasher.verify(value, hash)).toBe(true);
      expect(await hasher.verify(wrong, hash)).toBe(false);
    },
  );

  it('hashes OTPs with independent salts and rejects an incorrect code', async () => {
    const first = await hasher.hash('123456');
    const second = await hasher.hash('123456');

    expect(first).not.toBe(second);
    expect(await hasher.verify('123456', first)).toBe(true);
    expect(await hasher.verify('123457', first)).toBe(false);
  });
});
