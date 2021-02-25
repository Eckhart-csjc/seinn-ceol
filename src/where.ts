import { C, F, IParser, N, Response, Streams, Tuple } from '@masala/parser';
import * as _ from 'lodash';
import { error } from './util';

export enum Operation {
  And,
  Equals,
  Not,
  NotEquals,
  Or,
}

export enum TokenType {
  BinaryOperation,
  BinaryOperator,
  Identifier,
  NumericLiteral,
  OperationChain,
  StringLiteral,
  UnaryOperation,
  UnaryOperator,
}

interface IToken {
  type: TokenType;
}

interface IOperatorToken extends IToken {
}

interface IValueToken extends IToken {
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

const IDENTIFIER_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.';

const unaryOperators: Record<string, Operation> = {
  ['!']:  Operation.Not,
};

const binaryOperators: Record<string, Operation> = {
  ['&&']: Operation.And,
  ['=']: Operation.Equals,
  ['==']: Operation.Equals,
  ['!=']: Operation.NotEquals,
  ['||']: Operation.Or,
};

const operatorPriority: Record<Operation, number> = {
  [Operation.And]: 1,
  [Operation.Equals]: 2,
  [Operation.Not]: 5,
  [Operation.NotEquals]: 2,
  [Operation.Or]: 1,
}

const groupOperations = (tokens: IToken[]): IValueToken => {
  if (tokens.length === 1) {
    return tokens[0] as IValueToken;
  }
  if (tokens.length === 2) {
    error(`Theoretically, this can't happen`)
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
    5     // Look ahead for any lower priority operators
  );
  return nextPeerOp ? 
    groupOperations([
      left, 
      op1, 
      groupOperations(tokens.slice(2,nextPeerOp)), 
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
          .or(F.try(P.numericLiteral())
            .or(P.identifier()) as IParser<IToken>
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
    P.expression()
      .then(
        (
          P.binaryOperator()
            .then(P.expression())
        ).optrep()
      )
      .map(operationChainMapper),

  parenthesizedExpression: (): IParser<IValueToken> =>
    C.char('(').drop()
      .then(F.lazy(P.operationChain))
      .then(C.char(')').drop())
      .map((result: Tuple<IValueToken>): IValueToken => result.value[0]),

  stringLiteral: () : IParser<IStringLiteralToken> =>
    C.char(`'`)
      .drop()
      .then(
        F.try(C.char('\\').drop().then(F.any()))
          .or(C.notChar(`'`))
          .optrep()
      )
      .then(C.char(`'`).drop())
      .map((result: Tuple<string>) => ({
        type: TokenType.StringLiteral,
        value: result.value.join(''),
      }) as IStringLiteralToken),

  unaryOperator: (): IParser<IUnaryOperatorToken> =>
    C.stringIn(Object.keys(unaryOperators))
      .map((value: string) => ({
        type: TokenType.UnaryOperator,
        operator: unaryOperators[value]!,
     }) as IUnaryOperatorToken),

  unaryOperation: (): IParser<IUnaryOperationToken> =>
    P.unaryOperator()
      .then(F.lazy(P.expression))
      .map((result: Tuple<IToken>): IUnaryOperationToken => ({
        type: TokenType.UnaryOperation,
        operator: result.value[0]! as IUnaryOperatorToken,
        operand: result.value[1]! as IValueToken,
      })),
};

const whereParser = P.operationChain();

export const parseWhere = (where: string): Response<IValueToken> => 
  whereParser.parse(Streams.ofString(where));
