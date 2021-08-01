export interface Rexq {
  resolvers: ResolverMap;
  options: Options;
  resolve<T extends {} = {}>(
    query: string,
    variables?: Variables
  ): Promise<Result<T>>;
}

export type Variables = { $execute?: "parallel" | "serial" } & {};

export interface Result<T extends {}> {
  data: T;
  errors: Error[];
}

export interface Options {
  context?: Function | {};
}

export type ResultType = string;

export interface ResolverMap {
  [key: string]:
    | Function
    | [ResultType, ...Function[]]
    | Function[]
    | ResolverMap;
}

export type Module = { require?: Module | Module[] } & ResolverMap;

export interface DefaultExport extends Function {
  (modules: Module[], options: Options): Rexq;
  (resolvers: ResolverMap, options: Options): Rexq;
}

declare const rexq: DefaultExport;

export default rexq;
