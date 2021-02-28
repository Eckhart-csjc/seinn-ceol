import { extract, parseWhere, Operation, TokenType } from './where';

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

goodParse('Operator chain', `A and B or C`, {
  type: TokenType.BinaryOperation,
  operator: {
    type: TokenType.BinaryOperator,
    operator: Operation.Or,
  },
  operands: [
    {
      type: TokenType.BinaryOperation,
      operator: {
        type: TokenType.BinaryOperator,
        operator: Operation.And,
      },
      operands: [
        {
          type: TokenType.Identifier,
          name: 'A',
        },
        {
          type: TokenType.Identifier,
          name: 'B',
        },
      ],
    },
    {
      type: TokenType.Identifier,
      name: 'C',
    },
  ],
});

goodParse('More complex expression', `A and B or C = 1`, {
  type: TokenType.BinaryOperation,
  operator: {
    type: TokenType.BinaryOperator,
    operator: Operation.Or,
  },
  operands: [
    {
      type: TokenType.BinaryOperation,
      operator: {
        type: TokenType.BinaryOperator,
        operator: Operation.And,
      },
      operands: [
        {
          type: TokenType.Identifier,
          name: 'A',
        },
        {
          type: TokenType.Identifier,
          name: 'B',
        },
      ],
    },
    {
      type: TokenType.BinaryOperation,
      operator: {
        type: TokenType.BinaryOperator,
        operator: Operation.Equals,
      },
      operands: [
        {
          type: TokenType.Identifier,
          name: 'C',
        },
        {
          type: TokenType.NumericLiteral,
          value: 1,
        },
      ],
    },
  ],
});

goodParse('More complex expression', `A and B = C or D`, {
  type: TokenType.BinaryOperation,
  operator: {
    type: TokenType.BinaryOperator,
    operator: Operation.Or,
  },
  operands: [
    {
      type: TokenType.BinaryOperation,
      operator: {
        type: TokenType.BinaryOperator,
        operator: Operation.And,
      },
      operands: [
        {
          type: TokenType.Identifier,
          name: 'A',
        },
        {
          type: TokenType.BinaryOperation,
          operator: {
            type: TokenType.BinaryOperator,
            operator: Operation.Equals,
          },
          operands: [
            {
              type: TokenType.Identifier,
              name: 'B',
            },
            {
              type: TokenType.Identifier,
              name: 'C',
            },
          ],
        },
      ],
    },
    {
      type: TokenType.Identifier,
      name: 'D',
    },
  ],
});

goodParse('Parentheses', `(A and B) = (C or D)`, {
  type: TokenType.BinaryOperation,
  operator: {
    type: TokenType.BinaryOperator,
    operator: Operation.Equals,
  },
  operands: [
    {
      type: TokenType.BinaryOperation,
      operator: {
        type: TokenType.BinaryOperator,
        operator: Operation.And,
      },
      operands: [
        {
          type: TokenType.Identifier,
          name: 'A',
        },
        {
          type: TokenType.Identifier,
          name: 'B',
        },
      ],
    },
    {
      type: TokenType.BinaryOperation,
      operator: {
        type: TokenType.BinaryOperator,
        operator: Operation.Or,
      },
      operands: [
        {
          type: TokenType.Identifier,
          name: 'C',
        },
        {
          type: TokenType.Identifier,
          name: 'D',
        },
      ],
    },
  ],
});

// Extractor tests

const mockContext = {
  simple: 42,
};

const goodExtract = (input: string, expected: unknown) => {
  it(`Should extract "${input}"`, () => {
    const parseResult = parseWhere(input);
    expect(parseResult.isAccepted());
    expect(parseResult.isEos());
    expect(extract(mockContext, parseResult.value)).toEqual(expected);
  });
}

goodExtract(`'a string'`, 'a string');
goodExtract('123.45', 123.45);
goodExtract('simple', 42);
goodExtract('!simple', false);
goodExtract('not simple', false);
goodExtract('1 and simple', 42);
goodExtract('simple && 0', 0);
goodExtract('simple = 42', true);
goodExtract('(simple != 42) or 1', 1);
goodExtract(`1 and simple = 42 and 'hello'`, 'hello');
goodExtract(`(0 or simple) = (42 and 'hello')`, false);
