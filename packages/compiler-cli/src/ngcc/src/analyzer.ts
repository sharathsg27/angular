/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as fs from 'fs';
import * as ts from 'typescript';

import {BaseRefDecoratorHandler, ComponentDecoratorHandler, DirectiveDecoratorHandler, InjectableDecoratorHandler, NgModuleDecoratorHandler, PipeDecoratorHandler, ResourceLoader, SelectorScopeRegistry} from '../../ngtsc/annotations';
import {Decorator} from '../../ngtsc/host';
import {CompileResult, DecoratorHandler} from '../../ngtsc/transform';

import {NgccReflectionHost} from './host/ngcc_host';
import {ParsedClass} from './parsing/parsed_class';
import {ParsedFile} from './parsing/parsed_file';
import {isDefined} from './utils';

export interface AnalyzedClassEntry<D = any, T = any> {
  handler: DecoratorHandler<D, T>;
  analysis: any;
  diagnostics?: ts.Diagnostic[];
  compilation: CompileResult[];
}

export interface AnalyzedClass<D = any, T = any> extends ParsedClass {
  analyses: Array<AnalyzedClassEntry<D, T>>;
}

export interface AnalyzedFile {
  analyzedClasses: AnalyzedClass[];
  sourceFile: ts.SourceFile;
}

export interface MatchingHandler<D, T> {
  handler: DecoratorHandler<D, T>;
  detected: D;
}

/**
 * `ResourceLoader` which directly uses the filesystem to resolve resources synchronously.
 */
export class FileResourceLoader implements ResourceLoader {
  load(url: string): string { return fs.readFileSync(url, 'utf8'); }
}

export class Analyzer {
  resourceLoader = new FileResourceLoader();
  scopeRegistry = new SelectorScopeRegistry(this.typeChecker, this.host);
  handlers: DecoratorHandler<any, any>[] = [
    new BaseRefDecoratorHandler(this.typeChecker, this.host),
    new ComponentDecoratorHandler(
        this.typeChecker, this.host, this.scopeRegistry, false, this.resourceLoader),
    new DirectiveDecoratorHandler(this.typeChecker, this.host, this.scopeRegistry, false),
    new InjectableDecoratorHandler(this.host, false),
    new NgModuleDecoratorHandler(this.typeChecker, this.host, this.scopeRegistry, false),
    new PipeDecoratorHandler(this.typeChecker, this.host, this.scopeRegistry, false),
  ];

  constructor(private typeChecker: ts.TypeChecker, private host: NgccReflectionHost) {}

  /**
   * Analyize a parsed file to generate the information about decorated classes that
   * should be converted to use ivy definitions.
   * @param file The file to be analysed for decorated classes.
   */
  analyzeFile(file: ParsedFile): AnalyzedFile {
    const analyzedClasses =
        file.decoratedClasses.map(clazz => this.analyzeClass(file.sourceFile, clazz))
            .filter(isDefined);

    return {
      analyzedClasses,
      sourceFile: file.sourceFile,
    };
  }

  protected analyzeClass(file: ts.SourceFile, clazz: ParsedClass): AnalyzedClass|undefined {
    const matchingHandlers =
        this.handlers
            .map(
                handler =>
                    ({handler, detected: handler.detect(clazz.declaration, clazz.decorators)}))
            .filter(isMatchingHandler);

    if (matchingHandlers.length > 1 && matchingHandlers.every(isNotBaseRefHandlerMatch)) {
      throw new Error('TODO.Diagnostic: Class has multiple Angular decorators.');
    }

    if (matchingHandlers.length === 0) {
      return undefined;
    }

    const analyses = matchingHandlers.map(({handler, detected}) => {
      const {analysis, diagnostics} = handler.analyze(clazz.declaration, detected);
      let compilation = handler.compile(clazz.declaration, analysis);
      if (!Array.isArray(compilation)) {
        compilation = [compilation];
      }
      return {handler, analysis, diagnostics, compilation};
    });

    return {...clazz, analyses};
  }
}

function isNotBaseRefHandlerMatch<D, T>(handler: Partial<MatchingHandler<D, T>>) {
  return !(handler.handler instanceof BaseRefDecoratorHandler);
}

function isMatchingHandler<D, T>(handler: Partial<MatchingHandler<D, T>>):
    handler is MatchingHandler<D, T> {
  return !!handler.detected;
}
