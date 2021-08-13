export interface Rexq {
  resolvers: ResolverMap;
  resolverTree: ResolverTree;
  options: Options;
  parse(query: string): ParseResult;
  build(fields: FieldInfo[], variables?: Variables): QueryInfo;
  resolve<T extends {} = {}>(
    query: string,
    variables?: Variables
  ): Promise<Result<T>>;
  resolve<T extends {} = {}>(input: {
    query: string;
    variables?: Variables;
  }): Promise<Result<T>>;
}

export interface ParseResult {
  root: FieldInfo;
  error: Error;
}

export type Context<TExtra = {}> = {
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
} & { [key: string]: any };

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
  fallback?: boolean | ((info: { query: string; variables: Variables }) => any);
  linkLatency?: number;
  links?: Link[];
}

export interface Link {
  latency?: number;
  execute(query: string, variables?: Variables): any;
  resolvers: ResolverMap;
}

export interface LinkResolverMap {
  [key: string]:
    | string
    | ((
        parent?: any,
        args?: {},
        context?: Context,
        info?: Info
      ) => QueryInfo | Promise<QueryInfo>)
    | LinkResolverMap;
}

export interface QueryInfo {
  query: string;
  variables?: Variables;
}

export interface Info {
  fields: FieldInfo[];
}

export interface FieldInfo {
  name: string;
  alias: string;
  args: ArgInfo[];
  children: FieldInfo[];
}

export interface ArgInfo {
  name: string;
  value: string;
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
  (modules: Module[], options?: Options): Rexq;
  (resolvers: ResolverMap, options?: Options): Rexq;
}

declare const rexq: DefaultExport;

export default rexq;
