import { extract, Operation, parse, parseExtractor, TokenType } from './extractor';

const chalk = require('chalk');

const goodParse = (input: string, expected: any) => {
  it(`Parse "${input}"`, () => {
    const result = parse(input);
    expect(result.isAccepted()).toBe(true);
    if (result.offset != input.length) {
      console.log(input.slice(0, result.offset) + chalk.bgRed.black(input.slice(result.offset)));
    }
    expect(result.value).toEqual(expected);
    expect(result.isEos()).toBe(true);
  });
};

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

goodParse(`"fred"`, {
  type: TokenType.StringLiteral,
  value: 'fred',
});

goodParse(`"fr\\"ed"`, {
  type: TokenType.StringLiteral,
  value: `fr"ed`,
});

goodParse(`"fr'ed"`, {
  type: TokenType.StringLiteral,
  value: `fr'ed`,
});

goodParse(`'fr"ed'`, {
  type: TokenType.StringLiteral,
  value: `fr"ed`,
});

goodParse(`/^hello$/`, {
  type: TokenType.Regex,
  value: '^hello$',
  flags: '',
});

goodParse(`/^hel(l)o$/i`, {
  type: TokenType.Regex,
  value: '^hel(l)o$',
  flags: 'i',
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

goodParse('fetch tracks', {
  type: TokenType.UnaryOperation,
  operator: {
    type: TokenType.UnaryOperator,
    operator: Operation.Fetch,
  },
  operand: {
    type: TokenType.Identifier,
    name: 'tracks',
  }
});

// Extractor tests

const mockContext = {
  composer: 'Johann Sebastian Bach',
  date: 'January 1, 1970',
  simple: 42,
  note: 'hello',
  not: 'nope',
  arry: ['wilma', 'pebbles', 'fred', 'barney'],
  dates: ['1/1/2020', '1/2/2020'],
  neg1: -1,
  objs: [ { name: 'fred', val: 1 }, { name: 'wilma', val: 2 }, { name: 'barney', val: 3 } ],
  str: '*abc//\\($^.',
};

const goodExtract = (input: string, expected: unknown) => {
  it(`Extract "${input}" to ${expected}`, () => {
    const token = parseExtractor(input);
    expect(token).toBeTruthy();
    expect(extract(mockContext, token!)).toEqual(expected);
  });
};

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
goodExtract('date date', 18000);
goodExtract('2 > 1', true);
goodExtract('2 > 2', false);
goodExtract('2 >= 2', true);
goodExtract('2 >= 1', true);
goodExtract('2 >= 3', false);
goodExtract('2 < 3', true);
goodExtract('2 < 2', false);
goodExtract('2 <= 2', true);
goodExtract('2 <= 1', false);
goodExtract(`date date < date '1/2/1970'`, true);
goodExtract(`date date > date '1/2/1970'`, false);
goodExtract(`date date > date '1/2/1200'`, true);
goodExtract(`date date + 86400 = date '1/2/1970'`, true);
goodExtract(`dur '30 mins'`, 1800);
goodExtract(`date '3/5/2021' + dur '2 days' == date '3/7/2021'`, true);
goodExtract(`-12`, -12);
goodExtract(`composer matches 'Bach'`, true);
goodExtract(`composer matches 'Fred'`, false);
goodExtract(`composer =~ '\\\\bBach$'`, true);
goodExtract(`arry[2]`, 'fred');
goodExtract(`arry`, mockContext.arry);
goodExtract(`arry = 'fred'`, [false, false, true, false]);
goodExtract(`any arry`, true);
goodExtract(`any (arry = 'fred')`, true);
goodExtract(`all (arry = 'fred')`, false);
goodExtract(`not all (arry = 'fred')`, true);
goodExtract(`not any (arry = 'fred')`, false);
goodExtract(`not any (arry = 'betty')`, true);
goodExtract(`all (date dates > date date)`, true);
goodExtract(`not all (date dates > date dates[1])`, true);
goodExtract(`dates join ' & '`, '1/1/2020 & 1/2/2020');
goodExtract(`dates filter dates`, mockContext.dates);
goodExtract(`dates filter (date dates > date 'Jan 1, 2020')`, ['1/2/2020']);
goodExtract(`longDate '1/1/2020'`, 'January 1, 2020');
goodExtract(`shortDate 'Jan 1, 2020'`, '2020-01-01');
goodExtract(`shortDate '2021'`, '2021');
goodExtract(`shortDate dates[0]`, '1/1/2020');
goodExtract(`shortDate date dates[0]`, '2020-01-01');
goodExtract(`shortDur 1810`, '30:10');
goodExtract(`shortDur 3670`, '1:01:10');
goodExtract(`shortTime dates[0]`, '2020 Jan 1');
goodExtract(`shortTime date dates[0]`, '2020 Jan 1');
goodExtract(`"fred" =~ /red$/`, true);
goodExtract(`"fred" =~ /Red$/`, false);
goodExtract(`"fred" =~ /Red$/i`, true);
goodExtract(`neg1 >= 0 && dates[neg1]`, false);
goodExtract(`objs where name = 'fred'`, [{ name: 'fred', val: 1 }]);
goodExtract(`objs where val > 1`, [{ name: 'wilma', val: 2 }, { name: 'barney', val: 3 }]);
goodExtract(`objs[0] where true`, [{ name: 'fred', val: 1 }]);
goodExtract(`arry where this =~ /r/`, ['fred', 'barney']);
goodExtract(`fetch tracks where false`, []);
goodExtract(`count arry`, 4);
goodExtract(`count (objs where val > 1)`, 2);
goodExtract(`escape "*Hello world!*"`, `\\*Hello world!\\*`);
goodExtract(`str =~ escape str`, true);
goodExtract(`str =~ '^' + escape str + '$'`, true);
