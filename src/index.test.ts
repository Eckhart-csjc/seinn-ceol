import { parseWhere, Operation, TokenType } from './where';

const chalk = require('chalk');

const goodParse = (desc: string, input: string, expected: any) => {
  it(desc, () => {
    const result = parseWhere(input);
    expect(result.isAccepted()).toBe(true);
    if (result.offset != input.length) {
      console.log(input.slice(0, result.offset) + chalk.bgRed.black(input.slice(result.offset)))
    }
    expect(result.value).toEqual(expected);
    expect(result.isEos()).toBe(true);
  });
}

goodParse('Numeric literal', '1', {
  type: TokenType.NumericLiteral,
  value: 1,
});

goodParse('Numeric literal', '-1.23', {
  type: TokenType.NumericLiteral,
  value: -1.23,
});

goodParse('String literal', `'fred'`, {
  type: TokenType.StringLiteral,
  value: 'fred',
});

goodParse('String literal with escaped quote', `'fr\\'ed'`, {
  type: TokenType.StringLiteral,
  value: `fr'ed`,
});

goodParse('Identifier', `Alice123`, {
  type: TokenType.Identifier,
  name: `Alice123`,
});

goodParse('Identifier path', `Alice123.bob`, {
  type: TokenType.Identifier,
  name: `Alice123.bob`,
});

goodParse('Unary operation', `!Alice123.bob`, {
  type: TokenType.UnaryOperation,
  operator: {
    type: TokenType.UnaryOperator,
    operator: Operation.Not,
  },
  operand: {
    type: TokenType.Identifier,
    name: `Alice123.bob`,
  }
});

goodParse('Binary operation', `composerName='Johann Sebastian Bach'`, {
  type: TokenType.BinaryOperation,
  operator: {
    type: TokenType.BinaryOperator,
    operator: Operation.Equals,
  },
  operands: [
    {
      type: TokenType.Identifier,
      name: 'composerName',
    },
    {
      type: TokenType.StringLiteral,
      value: 'Johann Sebastian Bach',
    },
  ],
});

goodParse('Binary operation with spaces', `composerName = 'Johann Sebastian Bach'`, {
  type: TokenType.BinaryOperation,
  operator: {
    type: TokenType.BinaryOperator,
    operator: Operation.Equals,
  },
  operands: [
    {
      type: TokenType.Identifier,
      name: 'composerName',
    },
    {
      type: TokenType.StringLiteral,
      value: 'Johann Sebastian Bach',
    },
  ],
});
