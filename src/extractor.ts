import { C, F, IParser, N, Response, Streams, Tuple, VoidParser } from '@masala/parser';
import * as _ from 'lodash';
import parseDuration from 'parse-duration';
import { ICacheStats } from './stats';
import { debug, error, makeTime } from './util';

const dayjs = require('dayjs');

// Identifiers that should always be defined for extractors
const UNIVERSALS = {
  true: true,
  false: false,
}

export enum Operation {
  All = 'All',
  And = 'And',
  Any = 'Any',
  Date = 'Date',
  DividedBy = 'DividedBy',
  Duration = 'Duration',
  Equals = 'Equals',
  Filter = 'Filter',
  GreaterThan = 'GreaterThan',
  GreaterThanOrEquals = 'GreaterThanOrEquals',
  Join = 'Join',
  LessThan = 'LessThan',
  LessThanOrEquals = 'LessThanOrEquals',
  Matches = "Matches",
  Minus = 'Minus',
  Not = 'Not',
  NotEquals = 'NotEquals',
  Or = 'Or',
  Plus = 'Plus',
  ShortDate = 'ShortDate',
  ShortDur = 'ShortDur',
  ShortTime = 'ShortTime',
  Times = 'Times',
}

export enum TokenType {
  BinaryOperation = 'BinaryOperation',
  BinaryOperator = 'BinaryOperator',
  Identifier = 'Identifier',
  NumericLiteral = 'NumericLiteral',
  Regex = 'Regex',
  StringLiteral = 'StringLiteral',
  UnaryOperation = 'UnaryOperation',
  UnaryOperator = 'UnaryOperator',
}

interface IToken {
  type: TokenType;
}

interface IOperatorToken extends IToken {
}

export interface IValueToken extends IToken {
}

interface IBinaryOperationToken extends IValueToken {
  type: TokenType.BinaryOperation;
  operator: IBinaryOperatorToken;
  operands: [IValueToken, IValueToken];
}

interface IBinaryOperatorToken extends IOperatorToken {
  type: TokenType.BinaryOperator;
  operator: Operation;
}

interface IIdentifierToken extends IValueToken {
  type: TokenType.Identifier;
  name: string;
}

interface INumericLiteralToken extends IValueToken {
  type: TokenType.NumericLiteral;
  value: number;
}

interface IRegexToken extends IValueToken {
  type: TokenType.Regex;
  value: string;
  flags: string;
}

interface IStringLiteralToken extends IValueToken {
  type: TokenType.StringLiteral;
  value: string;
}

interface IUnaryOperationToken extends IToken {
  type: TokenType.UnaryOperation;
  operator: IUnaryOperatorToken;
  operand: IValueToken;
}

interface IUnaryOperatorToken extends IOperatorToken {
  type: TokenType.UnaryOperator;
  operator: Operation;
}

const IDENTIFIER_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.[]';

const unaryOperators: Record<string, Operation> = {
  ['all ']: Operation.All,
  ['any ']: Operation.Any,
  ['date ']: Operation.Date,
  ['dur ']: Operation.Duration,
  ['!']:  Operation.Not,
  ['not ']: Operation.Not,
  ['shortDate ']: Operation.ShortDate,
  ['shortDur ']: Operation.ShortDur,
  ['shortTime ']: Operation.ShortTime,
};

const binaryOperators: Record<string, Operation> = {
  ['&&']: Operation.And,
  ['and ']: Operation.And,
  ['/']: Operation.DividedBy,
  ['==']: Operation.Equals,
  ['=~']: Operation.Matches,
  ['=']: Operation.Equals,
  ['>=']: Operation.GreaterThanOrEquals,
  ['>']: Operation.GreaterThan,
  ['!=']: Operation.NotEquals,
  ['<>']: Operation.NotEquals,
  ['<=']: Operation.LessThanOrEquals,
  ['<']: Operation.LessThan,
  ['-']: Operation.Minus,
  ['+']: Operation.Plus,
  ['||']: Operation.Or,
  ['or ']: Operation.Or,
  ['*']: Operation.Times,
  ['matches ']: Operation.Matches,
  ['filter ']: Operation.Filter,
  ['join ']: Operation.Join,
};

const operatorPriority: Record<Operation, number> = {
  [Operation.All]: 6,
  [Operation.And]: 1,
  [Operation.Any]: 6,
  [Operation.Date]: 6,
  [Operation.DividedBy]: 5,
  [Operation.Duration]: 6,
  [Operation.Equals]: 2,
  [Operation.Filter]: 6,
  [Operation.GreaterThan]: 3,
  [Operation.GreaterThanOrEquals]: 3,
  [Operation.Join]: 4,
  [Operation.LessThan]: 3,
  [Operation.LessThanOrEquals]: 3,
  [Operation.Matches]: 2,
  [Operation.Minus]: 4,
  [Operation.Not]: 6,
  [Operation.NotEquals]: 2,
  [Operation.Or]: 1,
  [Operation.Plus]: 4,
  [Operation.ShortDate]: 6,
  [Operation.ShortDur]: 6,
  [Operation.ShortTime]: 6,
  [Operation.Times]: 5,
}

const groupOperations = (tokens: IToken[]): IValueToken => {
  debug('Token chain', JSON.stringify(tokens, undefined, 2));
  if (tokens.length === 1) {
    return tokens[0] as IValueToken;
  }
  if (tokens.length === 2) {
    error(`This shouldn't happen, remaining tokens:`, JSON.stringify(tokens, undefined, 2));
    return tokens[0] as IValueToken;
  }
  if (tokens.length === 3) {
    return {
      type: TokenType.BinaryOperation,
      operator: tokens[1] as IBinaryOperatorToken,
      operands: [tokens[0], tokens[2]],
    } as IBinaryOperationToken;
  }
  const [ left, op1, right, op2 ] = 
    tokens as [IValueToken, IBinaryOperatorToken, IValueToken, IBinaryOperatorToken];
  if (operatorPriority[op1.operator] >= operatorPriority[op2.operator]) {
    const binaryToken = {
      type: TokenType.BinaryOperation,
      operator: op1,
      operands: [left, right],
    }
    return groupOperations([binaryToken, ...tokens.slice(3)]);
  }
  const nextPeerOp = _.findIndex(
    tokens, 
    (token) => token.type === TokenType.BinaryOperator && 
      operatorPriority[(token as IBinaryOperatorToken).operator] <= 
        operatorPriority[op1.operator],
    5     // Look ahead for any operator that we should precede
  );
  return nextPeerOp >= 0 ? 
    groupOperations([
      groupOperations([
        left, 
        op1, 
        groupOperations(tokens.slice(2,nextPeerOp)), 
      ]),
      ...tokens.slice(nextPeerOp)
    ]) : 
    groupOperations([
      left,
      op1,
      groupOperations(tokens.slice(2))
    ]);
}

const operationChainMapper = (result: Tuple<IToken>) => groupOperations(result.value);

const P = {
  binaryOperator: (): IParser<IBinaryOperatorToken> =>
    C.stringIn(Object.keys(binaryOperators))
      .map((value: string) => ({
        type: TokenType.BinaryOperator,
        operator: binaryOperators[value]!,
      }) as IBinaryOperatorToken),

  expression: (): IParser<IValueToken> =>
    F.try(P.parenthesizedExpression())
      .or(F.try(P.unaryOperation())
        .or(F.try(P.stringLiteral())
          .or(F.try(P.regex())
            .or(F.try(P.numericLiteral())
              .or(P.identifier()) as IParser<IToken>
            ) as IParser<IToken>
          ) as IParser<IToken>
        ) as IParser<IToken>
      ),

  identifier: () : IParser<IIdentifierToken> => 
    C.letterAs(C.ASCII_LETTER)
      .then(C.charIn(IDENTIFIER_CHARACTERS).optrep())
      .map((result: Tuple<string>) => ({
        type: TokenType.Identifier,
        name: result.value.join(``),
      }) as IIdentifierToken),

  numericLiteral: () : IParser<INumericLiteralToken> =>
    N.number()
      .map((value: number) => ({
        type: TokenType.NumericLiteral,
        value,
      }) as INumericLiteralToken),

  operationChain: (): IParser<IValueToken> =>
    P.optSpace()
      .then(
        P.expression()
          .then(
            (
              P.optSpace()
                .then(P.binaryOperator())
                .then(P.optSpace())
                .then(P.expression())
            ).optrep()
          )
        )
      .then(P.optSpace())
      .map(operationChainMapper),

  optSpace: (): VoidParser =>
    C.charIn(' \t\n\r').optrep().drop(),

  parenthesizedExpression: (): IParser<IValueToken> =>
    C.char('(').drop()
      .then(F.lazy(P.operationChain))
      .then(C.char(')').drop())
      .map((result: Tuple<IValueToken>): IValueToken => result.value[0]),

  regex: (): IParser<IRegexToken> =>
    P.stringLiteral('/')
      .then(C.charIn('gimsu').optrep())
      .map((result: Tuple<any>) => ({
        type: TokenType.Regex,
        value: result.value[0]!.value! as string,
        flags: result.value.slice(1).join(''),
      }) as IRegexToken),

  stringLiteral: (quote?: string) : IParser<IStringLiteralToken> =>
    quote ?
      C.char(quote)
        .drop()
        .then(
          F.try(C.char('\\').drop().then(F.any()))
            .or(C.notChar(quote))
            .optrep()
        )
        .then(C.char(quote).drop())
        .map((result: Tuple<string>) => ({
          type: TokenType.StringLiteral,
          value: result.value.join(''),
        }) as IStringLiteralToken) :
      F.try(P.stringLiteral(`'`))
        .or(P.stringLiteral(`"`)),

  unaryOperator: (): IParser<IUnaryOperatorToken> =>
    C.stringIn(Object.keys(unaryOperators))
      .map((value: string) => ({
        type: TokenType.UnaryOperator,
        operator: unaryOperators[value]!,
     }) as IUnaryOperatorToken),

  unaryOperation: (): IParser<IUnaryOperationToken> =>
    P.unaryOperator()
      .then(P.optSpace())
      .then(F.lazy(P.expression))
      .then(P.optSpace())
      .map((result: Tuple<IToken>): IUnaryOperationToken => ({
        type: TokenType.UnaryOperation,
        operator: result.value[0]! as IUnaryOperatorToken,
        operand: result.value[1]! as IValueToken,
      })),
};

const extractParser = P.operationChain();

// Memoize parse results so repetition won't be so bad
const parseCache: Record<string, Response<IValueToken>> = {
};

export const parseCacheStats: ICacheStats = {
  stores: 0,
  hits: 0,
  misses: 0,
}

export const parse = (input: string): Response<IValueToken> => {
  const cached = parseCache[input];
  if (cached) {
    parseCacheStats.hits++;
    return cached;
  }
  const result = extractParser.parse(Streams.ofString(input));
  parseCacheStats.misses++;
  parseCache[input] = result;
  parseCacheStats.stores++;
  return result;
};

// If the following function returns undefined, it means that there was a parsing
// error, and the error was already displayed to the user
export const parseExtractor = (input: string): IValueToken | undefined => {
  const result = parse(input);
  if (!(result.isAccepted() && result.isEos())) {
    error(`Syntax error in parsed clause at offset ${result.offset}`);
    error(input);
    error(' '.repeat(result.offset) + '^');
    return undefined;
  }
  return result.value;
}

type OpFunc = (context: object, operands: IValueToken[]) => unknown;
type BinaryOpFunc = (context: object, op1: unknown, op2: unknown) => unknown;
type UnaryOpFunc = (context: object, op1: unknown) => unknown;
type BinaryArrayFunc = (context: object, op1: unknown[], op2: unknown) => unknown;
type UnaryArrayFunc = (context: object, op1: unknown[]) => unknown;

const pack = (val: any): any[] =>
  Array.isArray(val) ? val : [ val ];

const unpack = (val: any[]): any =>
  val.length > 1 ? val : val[0];

const doBinaryOperation = (context: object, operands: IValueToken[], fnc: BinaryOpFunc) =>
  (operands.length === 2) &&
    unpack(pack(extract(context, operands[0])).reduce((accum, op1) => [ 
      ...pack(extract(context, operands[1])).reduce((acc2, op2) => [
        ...acc2,
        fnc(context, op1, op2)
      ], accum)
    ], [] as any[]));

const doUnaryOperation = (context: object, operands: IValueToken[], fnc: UnaryOpFunc) => 
  (operands.length === 1) &&
    unpack(pack(extract(context, operands[0])).map((op1) => fnc(context, op1)));

const doBinaryArrayOperation = (context: object, operands: IValueToken[], fnc: BinaryArrayFunc) =>
  (operands.length === 2) &&
    fnc(context, pack(extract(context, operands[0])), extract(context, operands[1]));

const doUnaryArrayOperation = (context: object, operands: IValueToken[], fnc: UnaryArrayFunc) =>
  (operands.length === 1) &&
    fnc(context, pack(extract(context, operands[0])));

const opFunc: Record<Operation, OpFunc> = {
  [Operation.All]: (context, operands) =>
    doUnaryArrayOperation(context, operands, (context, op1) =>
      op1?.reduce((accum, elem) => accum && !!elem, true)),
      
  [Operation.And]: (context, operands) => 
    doBinaryOperation(context, operands, (context, op1, op2) => 
      op1 && op2),

  [Operation.Any]: (context, operands) =>
    doUnaryArrayOperation(context, operands, (context, op1) =>
      op1?.reduce((accum, elem) => accum || !!elem, false)),

  [Operation.Date]: (context, operands) =>
    doUnaryOperation(context, operands, (context, op1) =>
      new Date(dayjs(op1)).getTime() / 1000),

  [Operation.DividedBy]: (context, operands) =>
    doBinaryOperation(context, operands, (context, op1, op2) => 
      (op1 as any) / (op2 as any)),

  [Operation.Duration]: (context, operands) =>
    doUnaryOperation(context, operands, (context, op1) =>
      (parseDuration(`${op1}`) ?? 0) / 1000),

  [Operation.Equals]: (context, operands) =>
    doBinaryOperation(context, operands, (context, op1, op2) => 
      _.isEqual(op1, op2)),

  [Operation.Filter]: (context, operands) =>
    doBinaryArrayOperation(context, operands, (context, op1, op2) =>
      ((array2) => op1?.filter((elem, ndx) => !!array2[ndx]))(pack(op2))),

  [Operation.GreaterThan]: (context, operands) =>
    doBinaryOperation(context, operands, (context, op1, op2) => 
      (op1 as any) > (op2 as any)),

  [Operation.GreaterThanOrEquals]: (context, operands) =>
    doBinaryOperation(context, operands, (context, op1, op2) => 
      (op1 as any) >= (op2 as any)),

  [Operation.Join]: (context, operands) =>
    doBinaryArrayOperation(context, operands, (context, op1, op2) =>
      op1?.join(`${op2 ?? ''}`)),

  [Operation.LessThan]: (context, operands) =>
    doBinaryOperation(context, operands, (context, op1, op2) => 
      (op1 as any) < (op2 as any)),

  [Operation.LessThanOrEquals]: (context, operands) =>
    doBinaryOperation(context, operands, (context, op1, op2) => 
      (op1 as any) <= (op2 as any)),

  [Operation.Matches]: (context, operands) =>
    doBinaryOperation(context, operands, (context, op1, op2) => 
      !!`${op1}`.match(op2 as any)),

  [Operation.Minus]: (context, operands) =>
    doBinaryOperation(context, operands, (context, op1, op2) => 
      (op1 as any) - (op2 as any)),

  [Operation.Not]: (context, operands) =>
    doUnaryOperation(context, operands, (context, op1) =>
      !op1),

  [Operation.NotEquals]: (context, operands) =>
    doBinaryOperation(context, operands, (context, op1, op2) => 
      !_.isEqual(op1, op2)),

  [Operation.Or]: (context, operands) =>
    doBinaryOperation(context, operands, (context, op1, op2) => 
      op1 || op2),

  [Operation.Plus]: (context, operands) =>
    doBinaryOperation(context, operands, (context, op1, op2) => 
      (op1 as any) + (op2 as any)),

  [Operation.ShortDate]: (context, operands) =>
    doUnaryOperation(context, operands, (context, op1) =>
      op1 ?
        (
          (typeof op1 === 'string' && op1.length <= 8) ? 
            op1 : 
            dayjs(typeof op1 === 'number' ? op1 * 1000 : op1).format('YYYY-MM-DD')
        ) : 
        ''
      ),

  [Operation.ShortDur]: (context, operands) =>
    doUnaryOperation(context, operands, (context, op1) =>
      op1 ?
        makeTime((typeof op1 === 'number' ? op1 : parseInt(`${op1}`,10)) * 1000) :
        ''
      ),

  [Operation.ShortTime]: (context, operands) =>
    doUnaryOperation(context, operands, (context, op1) => {
      if (op1) {
        const dt = dayjs(typeof op1 === 'number' ? op1 * 1000 : op1);
        const now = dayjs();
        return (Math.abs(now.diff(dt, 'years')) > 0) ?
          dt.format('YYYY MMM D') :
          (Math.abs(now.diff(dt, 'days')) > 0) ?
            dt.format('MMM D') :
            dt.format('h:mma');
      }
      return '';
    }),
      
  [Operation.Times]: (context, operands) =>
    doBinaryOperation(context, operands, (context, op1, op2) => 
      (op1 as any) * (op2 as any)),
}

const extractors: Record<TokenType, (context: object, token: IToken) => unknown> = {

  [TokenType.BinaryOperation]: (context, token:IBinaryOperationToken) => 
    (extract(context, token.operator) as OpFunc)(context, token.operands),

  [TokenType.BinaryOperator]: (context, token:IBinaryOperatorToken) => 
    opFunc[token.operator],

  [TokenType.Identifier] : (context, token:IIdentifierToken) => 
    _.get(context, token.name),

  [TokenType.NumericLiteral]: (context, token:INumericLiteralToken) => 
    token.value,

  [TokenType.Regex]: (context, token:IRegexToken) =>
    new RegExp(token.value, token.flags),

  [TokenType.StringLiteral]: (context, token:IStringLiteralToken) => 
    token.value,

  [TokenType.UnaryOperation]: (context, token:IUnaryOperationToken) => 
    (extract(context, token.operator) as OpFunc)(context, [token.operand]),

  [TokenType.UnaryOperator]: (context, token:IUnaryOperatorToken) => 
    opFunc[token.operator],
}

export const extract = (context: object, token: IToken): unknown =>
  extractors[token.type]({ ...UNIVERSALS, ...context }, token);
