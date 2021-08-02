export interface Rexq {
  resolvers: ResolverMap;
  resolverTree: ResolverTree;
  options: Options;
  parse(query: string): any;
  resolve<T extends {} = {}>(
    query: string,
    variables?: Variables
  ): Promise<Result<T>>;
}

export type Context<TExtra> = {
  root: any;
  variables: Variables;
  resolvers: ResolverMap;
  execute<T = any>(resolver: any, parent?: any, args?: any, info?: any): T;
} & TExtra;

export interface ResultError {
  path: string;
  message: string;
}

export type Variables = {
  $execute?: "parallel" | "serial";
  $single?: boolean;
  $root?: any;
} & {};

export interface ResolverTree {
  [key: string]: "unknown" | "resolver" | ResolverTree;
}
export interface Result<T extends {}> {
  data: T;
  errors: ResultError[];
}

export interface Options {
  context?: ((variables?: Variables) => any) | {};
  root?: ((variables?: Variables) => any) | any;
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
