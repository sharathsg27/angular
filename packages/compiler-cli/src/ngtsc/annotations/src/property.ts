import * as ts from 'typescript';

import {R3BaseRefMetaData, compileBaseDefFromMetadata} from '../../../../../compiler';
import {ClassMember, Decorator, ReflectionHost} from '../../host';
import {staticallyResolve} from '../../metadata';
import {AnalysisOutput, CompileResult, DecoratorHandler} from '../../transform';


export class BaseRefDecoratorHandler implements
    DecoratorHandler<R3BaseRefDecoratorDetection, R3BaseRefMetaData> {
  constructor(private checker: ts.TypeChecker, private reflector: ReflectionHost, ) {}

  detect(node: ts.Declaration): R3BaseRefDecoratorDetection|undefined {
    let result: R3BaseRefDecoratorDetection|undefined = undefined;

    this.reflector.getMembersOfClass(node).forEach(property => {
      const {decorators} = property;
      if (decorators) {
        let inputFound = false;
        let outputFound = false;
        for (const decorator of decorators) {
          const decoratorName = decorator.name;
          if (decoratorName === 'Input') {
            inputFound = true;
            result = result || {};
            const inputs = result.inputs = result.inputs || [];
            inputs.push({decorator, property});
          } else if (decoratorName === 'Output') {
            outputFound = true;
            result = result || {};
            const outputs = result.outputs = result.outputs || [];
            outputs.push({decorator, property});
          }
          if (inputFound && outputFound) {
            break;
          }
        }
      }
    });

    return result;
  }

  analyze(node: ts.ClassDeclaration, detection: R3BaseRefDecoratorDetection):
      AnalysisOutput<R3BaseRefMetaData> {
    let analysis: R3BaseRefMetaData|undefined = undefined;

    if (detection.inputs) {
      analysis = {inputs: {}, isBaseDef: true};
      detection.inputs.forEach(({property, decorator}) => {
        const declaredName = property.name;
        analysis !.inputs ![declaredName] = (decorator.args && decorator.args.length >= 1) ?
            [
              staticallyResolve(decorator.args[0], this.reflector, this.checker) as string,
              declaredName
            ] :
            declaredName;
      });
    }

    if (detection.outputs) {
      analysis = analysis || {isBaseDef: true};
      analysis.outputs = analysis.outputs || {};
      detection.outputs.forEach(({property, decorator}) => {
        const declaredName = property.name;
        analysis !.outputs ![declaredName] = (decorator.args && decorator.args.length >= 1) ?
            staticallyResolve(decorator.args[0], this.reflector, this.checker) as string :
            declaredName;
      });
    }

    return ({ analysis } as AnalysisOutput<R3BaseRefMetaData>);
  }

  compile(node: ts.Declaration, analysis: R3BaseRefMetaData): CompileResult[]|CompileResult {
    const {expression, type} = compileBaseDefFromMetadata(analysis);

    return {
      name: 'ngBaseDef',
      initializer: expression, type,
      statements: [],
    };
  }
}

export interface R3BaseRefDecoratorDetection {
  inputs?: Array<{property: ClassMember, decorator: Decorator}>;
  outputs?: Array<{property: ClassMember, decorator: Decorator}>;
}
