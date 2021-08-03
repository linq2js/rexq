const EMPTY_OBJECT = {};
const EMPTY_ARRAY = [];
const NOOP = () => {};
const defaultMiddleware = (next, ...args) => next(...args);
const emptyParseResult = {
  root: { args: EMPTY_ARRAY, children: EMPTY_ARRAY },
  error: null,
};

export function parseQuery(query, cache, cacheSize = Number.MAX_VALUE) {
  let currentGroupId = 1;
  let error, root;
  const cacheKey = query;

  if (query) {
    const cachedQuery = cache.get(cacheKey);
    if (cachedQuery) return cachedQuery;

    // trimming and removing comments
    query = query.trim().replace(/#.*/g, "").replace(/\s+/g, "");
  }

  if (!query) return emptyParseResult;

  const identifierRE = /^[^\s():,]+$/;
  const groups = {};

  function addField(parent, name, alias, props) {
    if (name === "*") {
      parent.hasWildcard = true;
      return;
    }

    if (!identifierRE.test(name)) {
      throw new Error(`Invalid field name: "${name}"`);
    }
    if (alias && !identifierRE.test(alias)) {
      throw new Error(`Invalid field alias: "${alias}"`);
    }
    const field = { args: [], children: [], ...props, name, alias };
    parent.children.push(field);
  }

  function addArg(parent, name, value) {
    if (!value) value = name;
    if (!identifierRE.test(name)) {
      throw new Error(`Invalid argument name: "${name}"`);
    }
    // prevent client users access private variables
    if (!identifierRE.test(value) || value[0] === "_" || value[0] === "$") {
      throw new Error(`Invalid argument value: "${value}"`);
    }
    if (!value) throw new Error(`Expected argument value: ${name}`);
    parent.args.push({ name, value });
  }

  function parseGroup(text) {
    const id = `#${currentGroupId++}`;
    const group = {
      args: [],
      children: [],
    };

    text.split(",").forEach((item) => {
      const [first, second = "", third = ""] = item
        .trim()
        .split(":")
        .map((x) => x.trim());

      if (!first && !second && !third) return;

      // is argument
      // argumentName:variableName
      if (first[0] === "$") {
        return addArg(group, first.substr(1), second);
      }
      // field:alias:@group
      if (third[0] === "#") {
        return addField(group, first, second || first, groups[third]);
      }
      if (second[0] === "#") {
        return addField(group, first, first, groups[second]);
      }
      return addField(group, first, second || first);
    });

    groups[id] = group;

    return id;
  }

  try {
    while (true) {
      let found = false;
      query = query.replace(/\(([^()]*)\)/g, (_, group) => {
        found = true;
        return ":" + parseGroup(group);
      });
      if (!found) break;
    }
    root = groups[parseGroup(query)];
  } catch (e) {
    error = e;
  }

  const result = {
    root,
    error,
  };

  if (cache.size < cacheSize) {
    cache.set(cacheKey, result);
  }

  return result;
}

function getErrorInfo(path, error) {
  return {
    path,
    message: typeof error === "string" ? fieldError : error.message,
    stack: error.stack,
  };
}

async function resolveQuery(
  query = "",
  variables = EMPTY_OBJECT,
  resolvers,
  cache,
  cacheSize,
  middleware,
  fallback,
  { context = EMPTY_OBJECT, root = null }
) {
  const { root: rootField, error: parsingError } = parseQuery(
    query,
    cache,
    cacheSize
  );

  if (parsingError) {
    return { errors: [getErrorInfo("query", parsingError)], data: {} };
  }

  const fallbackFields = [];

  const result = {
    data: {},
    errors: [],
  };

  const options = {
    variables,
    root:
      "$root" in variables
        ? variables.$root
        : typeof root === "function"
        ? root(variables)
        : root,
    context: {
      links: new Map(),
      root,
      variables,
      resolvers,
      execute,
      ...(typeof context === "function" ? context(variables) : context),
    },
    findResolver,
    resolveGroup,
    resolvers,
    call,
  };

  function resolveGroup(group, field, parent, args) {
    const resultType = group[0];
    if (!group.__composedResolver) {
      group.__composedResolver = composeResolvers(
        typeof resultType === "function" ? group : group.slice(1)
      );
    }
    const result = call(group.__composedResolver, parent, args, field);
    if (typeof resultType === "function") {
      return result;
    }
    const resultResolver = findResolver(resultType);
    if (!resultResolver) return result;
    return resolveValue(field, resultResolver, options, result);
  }

  function findResolver(path) {
    return path
      .split(".")
      .reduce((resolvers, name) => resolvers && resolvers[name], resolvers);
  }

  function execute(resolver, parent, args, info) {
    if (Array.isArray(resolver)) {
      return resolveGroup(resolver, info.$$field, parent, args);
    }
    if (typeof resolver === "string") {
      resolver = findResolver(resolver);
    }
    return middleware(resolver, parent, args, options.context, info);
  }

  function call(resolver, parent, args, field) {
    const info = { fields: field.children, $$field: field };
    return execute(resolver, parent, args, info);
  }

  function onSuccess(field) {
    return (fieldResult) => {
      result.data[field.alias] = fieldResult;
    };
  }

  function onError(field) {
    return (fieldError) => {
      result.data[field.alias] = null;
      result.errors.push(getErrorInfo(field.alias, fieldError));
    };
  }

  // single query allowed
  if (variables.$single && rootField.children.length > 1) {
    result.errors.push({ path: "query", message: "Invalid query" });
    return result;
  }

  // disable parallel
  if (variables.$execute === "serial") {
    // process resolver one by one
    const queue = rootField.children.slice();
    while (queue.length) {
      const field = queue.shift();
      if (fallback && !(field.name in resolvers)) {
        fallbackFields.push(field);
        continue;
      }
      await resolveField(field, resolvers, options, options.root).then(
        onSuccess(field),
        onError(field)
      );
    }
    await handleFallabck(fallback, fallbackFields, variables, result);
  } else {
    const allResolvingPromises = rootField.children.map((field) => {
      if (fallback && !(field.name in resolvers)) {
        fallbackFields.push(field);
        return;
      }
      return resolveField(field, resolvers, options, options.root).then(
        onSuccess(field),
        onError(field)
      );
    });
    allResolvingPromises.push(
      handleFallabck(fallback, fallbackFields, variables, result)
    );
    await Promise.all(allResolvingPromises);
  }

  return result;
}

async function handleFallabck(fallback, fallbackFields, variables, result) {
  if (!fallback || !fallbackFields.length) return;
  const fallbackInfo = buildQuery(fallbackFields, variables);
  if (typeof fallback !== "function") {
    result.fallback = fallbackInfo;
    return;
  }
  const fallbackResult = await fallback(fallbackInfo);
  if (!fallbackResult) return result;
  const { data, errors } = fallbackResult;
  Object.keys(data).forEach((key) => (result.data[key] = data[key]));
  errors.forEach((error) => result.errors.push(error));
}

export function buildQuery(inputFields, inputVariables) {
  const variables = {};

  function stringify(field) {
    let selectors = field.name;
    if (field.alias !== field.name) {
      selectors += `:${field.alias}`;
    }
    if (field.args.length || field.children.length) {
      const subSelectors = field.args.map((arg) => {
        const variableId = generateIdentifier();
        variables[variableId] = inputVariables[arg.value];
        return `$${arg.name}:${variableId}`;
      });
      subSelectors.push(...field.children.map(stringify));
      selectors += `(${subSelectors.join(",")})`;
    }
    return selectors;
  }
  return {
    query: inputFields.map(stringify).join(","),
    variables,
  };
}

async function resolveValue(field, resolvers, options, value) {
  if (field.hasWildcard) return value;

  // get resolved value if it is promise
  if (value && typeof value.then === "function") {
    value = await value;
  }

  if (Array.isArray(value)) {
    return Promise.all(
      value.map((item) => resolveValue(field, resolvers, options, item))
    );
  }
  if (!value) return value;
  if (!field.children.length) {
    if (value && typeof value === "object") return EMPTY_OBJECT;
    return value;
  }

  const isObjectResolver = typeof resolvers === "function";
  const resolvedValue = isObjectResolver
    ? await options.call(resolvers, value, buildArgs(field, options), field)
    : EMPTY_OBJECT;
  const result = {};

  await Promise.all(
    field.children.map(async (subField) => {
      if (isObjectResolver) {
        result[subField.alias] = resolvedValue && resolvedValue[subField.name];
        return;
      }

      const subResolver = resolvers[subField.name];
      if (subResolver) {
        result[subField.alias] = await resolveField(
          subField,
          { [subField.name]: subResolver },
          options,
          value
        );
        return;
      }

      result[subField.alias] = value[subField.name];
    })
  );
  return result;
}

function buildArgs(field, options) {
  const args = {};
  field.args.forEach((arg) => {
    args[arg.name] = options.variables[arg.value];
  });
  return args;
}

async function resolveField(field, resolvers, options, parent) {
  let resolver = resolvers[field.name];
  if (!resolver) return parent;
  const args = buildArgs(field, options);
  if (typeof resolver === "string") {
    resolver = options.resolvers[resolver];
  }
  if (typeof resolver === "function") {
    return resolveValue(
      field,
      {},
      options,
      options.call(resolver, parent, args, field)
    );
  }
  // [resultType, ...middlewares, resolver]
  if (Array.isArray(resolver)) {
    return options.resolveGroup(resolver, field, parent, args);
  }

  return resolveValue(field, resolver, options, parent);
}

function mergeModules(modules, resolvers, registerdModules) {
  function mergeObject(target, source) {
    Object.entries(source).forEach(([key, sv]) => {
      let tv = target[key];
      const isResolver = typeof sv === "function" || Array.isArray(sv);
      // already exist, no merge
      if (tv && isResolver) return;
      if (isResolver) {
        target[key] = sv;
      } else {
        if (!tv) {
          target[key] = tv = {};
        }
        mergeObject(tv, sv);
      }
    });
  }

  function mergeModule({ require = EMPTY_ARRAY, ...props }) {
    if (!Array.isArray(require)) require = [require];
    mergeModules(require, resolvers, registerdModules);
    mergeObject(resolvers, props);
  }

  modules.forEach((m) => {
    if (registerdModules.has(m)) return;
    registerdModules.add(m);
    mergeModule(m);
  });

  return resolvers;
}

function composeResolvers(resolvers) {
  if (resolvers.length === 1) return resolvers[0];
  return resolvers.reduceRight(
    (next, prev) =>
      (...args) => {
        const result = prev(...args);
        return typeof result === "function"
          ? result(
              (...nextArgs) =>
                // auto fill missing args
                next(...nextArgs.concat(args.slice(nextArgs.length))),
              ...args
            )
          : result;
      },
    NOOP
  );
}

function composeMiddleware(middleware) {
  if (!middleware) return defaultMiddleware;
  return (Array.isArray(middleware) ? middleware : [middleware]).reduceRight(
    (next, prev) =>
      (...prevArgs) =>
        prev(
          (...nextArgs) =>
            next(...nextArgs.concat(prevArgs.slice(nextArgs.length))),
          ...prevArgs
        ),
    defaultMiddleware
  );
}

export default function rexq(
  resolversOrModules = EMPTY_OBJECT,
  {
    middleware,
    cacheSize,
    fallback,
    links = [],
    linkLatency = 100,
    ...options
  } = EMPTY_OBJECT
) {
  const cache = new Map();
  const registerdModules = new Set();
  const resolveCache = new Map();
  const resolvers = Array.isArray(resolversOrModules)
    ? mergeModules(resolversOrModules, {}, registerdModules)
    : resolversOrModules;
  let resolverTree;
  middleware = composeMiddleware(middleware);

  if (!Array.isArray(links)) links = [links];

  if (links.length) {
    mergeModules(
      links.map((link) =>
        createLinkedModule(link, linkLatency, cache, cacheSize)
      ),
      resolvers,
      registerdModules
    );
  }

  function createResolve(ns = "") {
    let resolve = resolveCache.get(ns);
    if (!resolve) {
      resolve = (query = "", variables) => {
        if (query && typeof query === "object") {
          [query, variables] = [query.query, query.variables];
        }

        return resolveQuery(
          query,
          variables,
          ns ? resolvers[ns] : resolvers,
          cache,
          cacheSize,
          middleware,
          fallback,
          options
        );
      };
      resolveCache.set(ns, resolve);
    }
    return resolve;
  }

  return {
    options,
    resolvers,
    resolve: createResolve(),
    ns: createResolve,
    parse(query) {
      return parseQuery(query, cache, cacheSize);
    },
    build(fields, variables = EMPTY_OBJECT) {
      return buildQuery(fields, variables);
    },
    get resolverTree() {
      if (resolverTree) return;

      function buildTree(parent, nodes) {
        Object.entries(nodes).forEach(([key, value]) => {
          if (
            Array.isArray(value) ||
            typeof value === "string" ||
            typeof value === "function"
          ) {
            parent[key] = "resolver";
          } else if (value && typeof value === "object") {
            buildTree((parent[key] = {}), value);
          } else {
            parent[key] = "unknown";
          }
        });
      }

      resolverTree = {};
      buildTree(resolverTree, resolvers);

      return resolverTree;
    },
  };
}

function generateIdentifier() {
  return "i" + Math.random().toString(36).substr(2, 5);
}

function createLinkedModule(link, defaultLatency, cache, cacheSize) {
  const { execute, resolvers = EMPTY_OBJECT, latency = defaultLatency } = link;

  if (!execute) throw new Error("link.execute required");

  function replaceResolvers(resolvers) {
    const result = {};
    Object.entries(resolvers).forEach(([key, value]) => {
      if (typeof value === "function" || typeof value === "string") {
        let queryBuilder;
        if (typeof value === "function") {
          queryBuilder = value;
        } else {
          queryBuilder = createLinkQueryBuilder(value);
        }

        result[key] = async (parent, args, context, info) => {
          const { query = "", variables = {} } = await queryBuilder(
            parent,
            args,
            context,
            info
          );
          if (!query) return null;
          let placeholderFound = false;
          const finalQuery = query
            // replace placeholder
            .replace(/\?/g, () => {
              if (placeholderFound)
                throw new Error(
                  "Link query cannot contain more than one placeholder"
                );
              if (!info.fields.length) return "";
              placeholderFound = true;
              const childResult = buildQuery(info.fields, context.variables);
              Object.assign(variables, childResult.variables);
              return childResult.query;
            });

          const { root, error } = parseQuery(finalQuery, cache, cacheSize);

          if (error) throw error;
          if (root.children.length > 1) {
            throw new Error(
              `Link query must have one selector but got ${root.children.length}`
            );
          }

          return enqueue(root.children[0], variables, context);
        };
        return;
      }

      result[key] = replaceResolvers(value);
    });
    return result;
  }

  function enqueue(field, variables, context) {
    let linkContext = context.links.get(link);
    if (!linkContext) {
      linkContext = {
        queries: [],
        timer: null,
      };
      linkContext.promise = new Promise((resolve, reject) => {
        linkContext.resolve = resolve;
        linkContext.reject = reject;
      });
      context.links.set(link, linkContext);
    }

    clearTimeout(linkContext.timer);
    const alias = "result" + linkContext.queries.length;
    // add field alias
    linkContext.queries.push({
      fields: [{ ...field, alias }],
      variables,
    });

    linkContext.timer = setTimeout(async () => {
      // remove link context from link list

      context.links.delete(link);
      const combinedQueries = [];
      const combinedVariables = {};

      linkContext.queries.forEach(({ fields, variables }) => {
        const result = buildQuery(fields, variables);
        combinedQueries.push(result.query);
        Object.assign(combinedVariables, result.variables);
      });
      try {
        const result = await execute(
          combinedQueries.join(","),
          combinedVariables
        );
        linkContext.resolve(result);
      } catch (e) {
        linkContext.reject(e);
      }
    }, latency);

    return linkContext.promise.then((result) => {
      const error = result.errors.find((e) => e.path === alias);
      if (error) return Promise.reject(error);
      return result.data[alias];
    });
  }

  const module = replaceResolvers(resolvers);

  return module;
}

function createLinkQueryBuilder(query) {
  return (parent, args) => ({ query, variables: args });
}
