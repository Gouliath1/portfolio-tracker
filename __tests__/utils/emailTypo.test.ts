import { suggestEmailFix } from '../../src/utils/emailTypo';

describe('suggestEmailFix', () => {
    it.each([
        ['julien.guille@gmil.com', 'julien.guille@gmail.com'],
        ['a@gmial.com', 'a@gmail.com'],
        ['a@gamil.com', 'a@gmail.com'],
        ['a@gmail.con', 'a@gmail.com'],
        ['a@gmaill.com', 'a@gmail.com'],
        ['a@hotmial.com', 'a@hotmail.com'],
        ['a@outlok.com', 'a@outlook.com'],
        ['a@iclould.com', 'a@icloud.com'],
        ['  Me@Gmil.com ', 'me@gmail.com'],
    ])('%s → %s', (input, fixed) => expect(suggestEmailFix(input)).toBe(fixed));

    it.each([
        'a@gmail.com', 'a@yahoo.co.jp', 'a@icloud.com',
        'a@mycompany.com', 'a@example.org', 'a@julienguille.com', 'a@uni.ac.jp',
    ])('leaves %s alone', input => expect(suggestEmailFix(input)).toBeNull());

    it('ignores things that are not addresses', () => {
        expect(suggestEmailFix('')).toBeNull();
        expect(suggestEmailFix('nope')).toBeNull();
        expect(suggestEmailFix('a@')).toBeNull();
        expect(suggestEmailFix('@gmail.com')).toBeNull();
    });
});
