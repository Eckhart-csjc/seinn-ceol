import { C, F, IParser, N, Tuple } from '@masala/parser';
import * as _ from 'lodash';

enum Operation {
  And,
  Equals,
  Not,
  NotEquals,
  Or,
}

enum TokenType {
  Identifier,
  NumericLiteral,
  Operation,
  Operator,
  StringLiteral,
}

interface IToken {
  type: TokenType;
}

interface IOperationToken extends IToken {
  type: TokenType.Operation;
  operator?: IOperatorToken;
  operands: IToken[];
}

interface IIdentifierToken extends IToken {
  type: TokenType.Identifier;
  name: string;
}

interface INumericLiteralToken extends IToken {
  type: TokenType.NumericLiteral;
  value: number;
}

interface IOperatorToken extends IToken {
  type: TokenType.Operator;
  operation: Operation;
}

interface IStringLiteralToken extends IToken {
  type: TokenType.StringLiteral;
  value: string;
}

const IDENTIFIER_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.';

const operationMapper = (result: Tuple<IToken>): IOperationToken => ({
  type: TokenType.Operation,
  operator: _.find(result.value, (t) => t.type === TokenType.Operator) as IOperatorToken,
  operands: _.filter(result.value, (t) => t.type !== TokenType.Operator),
});

const unaryOperators: Record<string, Operation> = {
  ['!']:  Operation.Not,
};

const binaryOperators: Record<string, Operation> = {
  ['&&']: Operation.And,
  ['==']: Operation.Equals,
  ['!=']: Operation.NotEquals,
  ['||']: Operation.Or,
};

const P = {
  binaryOperator: (): IParser<IOperatorToken> =>
    C.stringIn(Object.keys(binaryOperators))
      .map((value: string) => ({
        type: TokenType.Operator,
        operation: binaryOperators[value]!,
      }) as IOperatorToken),

  binaryOperation: (): IParser<IOperationToken> =>
    P.expression()
      .then(P.binaryOperator())
      .then(P.expression())
      .map(operationMapper),

  expression: (): IParser<IToken> =>
    F.try(P.parenthesizedExpression())
      .or(F.try(P.unaryOperation())
        .or(F.try(P.binaryOperation())
          .or(F.try(P.stringLiteral())
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

  parenthesizedExpression: (): IParser<IToken> =>
    C.char('(').drop()
      .then(P.expression())
      .then(C.char(')').drop())
      .map((result: Tuple<IToken>): IToken => result.value[0]),

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

  unaryOperator: (): IParser<IOperatorToken> =>
    C.stringIn(Object.keys(unaryOperators))
      .map((value: string) => ({
        type: TokenType.Operator,
        operation: unaryOperators[value]!,
     }) as IOperatorToken),

  unaryOperation: (): IParser<IOperationToken> =>
    P.unaryOperator()
      .then(P.expression())
      .map(operationMapper),
};
