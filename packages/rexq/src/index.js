const EMPTY_OBJECT = {};
const NOOP = () => {};
const defaultMiddleware = (next, ...args) => next(...args);

function parseQuery(query) {
  let groupId = 1;
  let error, root;

  if (!query) query = "";

  const identifierRE = /^[^\s[\]:,]+$/;
  const groups = {};

  function addField(parent, name, alias, props) {
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
    const id = `#${groupId++}`;
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
      query = query.replace(/\[([^[\]]*)\]/g, (_, group) => {
        found = true;
        return ":" + parseGroup(group);
      });
      if (!found) break;
    }
    root = groups[parseGroup(query)];
  } catch (e) {
    error = e;
  }

  return {
    root,
    error,
  };
}

function getErrorInfo(path, error) {
  return {
    path,
    message: typeof error === "string" ? fieldError : error.message,
  };
}

async function resolveQuery(
  query,
  variables,
  resolvers,
  { context = EMPTY_OBJECT, middleware }
) {
  const { root, error } = parseQuery(query);
  if (error) {
    return { errors: [getErrorInfo("query", error)], data: {} };
  }
  const result = {
    data: {},
    errors: [],
  };
  const options = {
    variables,
    context: {
      variables,
      resolvers,
      ...(typeof context === "function" ? context(variables) : context),
    },
    root,
    resolvers,
    call,
  };

  function call(resolver, parent, args, field) {
    return middleware(resolver, parent, args, options.context, {
      fields: field.children,
    });
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

  // disable parallel
  if (variables.$execute === "serial") {
    // process resolver one by one
    const queue = root.children.slice();
    while (queue.length) {
      const field = queue.shift();
      await resolveField(field, resolvers, options, null).then(
        onSuccess(field),
        onError(field)
      );
    }
  } else {
    await Promise.all(
      root.children.map((field) =>
        resolveField(field, resolvers, options, null).then(
          onSuccess(field),
          onError(field)
        )
      )
    );
  }

  return result;
}

async function resolveValue(field, resolvers, options, value) {
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

  const result = {};
  await Promise.all(
    field.children.map(async (subField) => {
      const subResolver = resolvers[subField.name];
      const subValue = value[subField.name];
      if (!subResolver) {
        result[subField.alias] = subValue;
      } else {
        result[subField.alias] = await resolveField(
          subField,
          { [subField.name]: subResolver },
          options,
          subValue
        );
      }
    })
  );
  return result;
}

async function resolveField(field, resolvers, options, parent) {
  let resolver = resolvers[field.name];
  if (!resolver) return parent;
  const args = {};
  field.args.forEach((arg) => {
    args[arg.name] = options.variables[arg.value];
  });
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
    const resultType = resolver[0];
    if (!resolver.__composedResolver) {
      resolver.__composedResolver = composeResolvers(
        typeof resultType === "function" ? resolver : resolver.slice(1)
      );
    }
    const result = options.call(
      resolver.__composedResolver,
      parent,
      args,
      field
    );
    if (typeof resultType === "function") {
      return result;
    }
    const resultResolver = resultType
      .split(".")
      .reduce(
        (resolvers, type) => resolvers && resolvers[type],
        options.resolvers
      );
    if (!resultResolver) return result;
    return resolveValue(field, resultResolver, options, result);
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

  function mergeModule({ require = [], ...props }) {
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
  { middleware, ...options } = EMPTY_OBJECT
) {
  const registerdModules = new Set();
  const resolveCache = new Map();
  const resolvers = Array.isArray(resolversOrModules)
    ? mergeModules(resolversOrModules, {}, registerdModules)
    : resolversOrModules;
  middleware = composeMiddleware(middleware);

  function createResolve(ns = "") {
    let resolve = resolveCache.get(ns);
    if (!resolve) {
      resolve = (query = "", variables = EMPTY_OBJECT) =>
        resolveQuery(query, variables, ns ? resolvers[ns] : resolvers, {
          ...options,
          middleware,
        });
      resolveCache.set(ns, resolve);
    }
    return resolve;
  }

  return {
    options,
    resolvers,
    resolve: createResolve(),
    ns: createResolve,
  };
}
