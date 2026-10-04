import { describe, expect, it } from 'vitest';
import { money, parseDecimalInput } from '../../src/domain/decimal';
import { decimalInputValue } from '../../src/renderer/lib/format';

describe('input decimali', () => {
  it.each([
    ['10,99', 2, '10.99'],
    ['10.9', 2, '10.90'],
    ['0', 2, '0.00'],
    ['1,2', 1, '1.2'],
    ['001.2', 1, '1.2'],
    ['1.234,56', 2, '1234.56'],
  ])('converte %s senza alterare il valore', (input, precision, expected) => {
    expect(parseDecimalInput(decimalInputValue(input), precision)).toEqual({
      ok: true,
      value: expected,
    });
  });

  it.each([
    ['10,999', 2],
    ['10.999', 2],
    ['10.000', 2],
    ['1,27', 1],
    ['1.27', 1],
    ['NaN', 2],
    ['Infinity', 2],
    ['1e2', 2],
    ['', 2],
    ['-1', 2],
  ])('rifiuta %s con massimo %s decimali', (input, precision) => {
    expect(
      parseDecimalInput(decimalInputValue(input), precision),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
  });

  it('mantiene l’arrotondamento dei componenti monetari derivati', () => {
    expect(money('10.999')).toBe('11.00');
  });
});
