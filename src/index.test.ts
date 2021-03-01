import { extract, parseWhere, Operation, TokenType } from './where';

const chalk = require('chalk');

const goodParse = (input: string, expected: any) => {
  it(`Parse "${input}"`, () => {
    const result = parseWhere(input);
    expect(result.isAccepted()).toBe(true);
    if (result.offset != input.length) {
      console.log(input.slice(0, result.offset) + chalk.bgRed.black(input.slice(result.offset)))
    }
    expect(result.value).toEqual(expected);
    expect(result.isEos()).toBe(true);
  });
}

goodParse('1', {
  type: TokenType.NumericLiteral,
  value: 1,
});

goodParse('-1.23', {
  type: TokenType.NumericLiteral,
  value: -1.23,
});

goodParse(`'fred'`, {
  type: TokenType.StringLiteral,
  value: 'fred',
});

goodParse(`'fr\\'ed'`, {
  type: TokenType.StringLiteral,
  value: `fr'ed`,
});

goodParse(`Alice123`, {
  type: TokenType.Identifier,
  name: `Alice123`,
});

goodParse(`Alice123.bob`, {
  type: TokenType.Identifier,
  name: `Alice123.bob`,
});

goodParse(`!Alice123.bob`, {
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

goodParse(`composerName='Johann Sebastian Bach'`, {
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

goodParse(`composerName = 'Johann Sebastian Bach'`, {
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

goodParse(`A and B or C`, {
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

goodParse(`A and B or C = 1`, {
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

goodParse(`A and B = C or D`, {
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

goodParse(`(A and B) = (C or D)`, {
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
  note: 'hello',
  not: 'nope',
};

const goodExtract = (input: string, expected: unknown) => {
  it(`Extract "${input}" to ${expected}`, () => {
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
goodExtract('not', 'nope');
goodExtract('note', 'hello');
goodExtract('not e', true);
goodExtract('not not', false);
