export const EMPTY_OBJECT = {};
export const EMPTY_ARRAY = [];
export const NOOP = () => {};

const emptyParseResult = {
  root: { args: EMPTY_ARRAY, children: EMPTY_ARRAY },
  error: null,
};

export function parseQuery(query, cache, cacheSize) {
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

    if (!identifierRE.test(name) || name[0] === "_") {
      throw new Error(`Invalid field name: "${name}"`);
    }
    if (alias && !identifierRE.test(alias)) {
      throw new Error(`Invalid field alias: "${alias}"`);
    }
    const field = {
      args: [],
      children: [],
      ...props,
      name,
      alias: alias[0] === "$" ? name : alias,
      out: alias[0] === "$" ? alias.substr(1) : null,
    };
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
    const id = `@${currentGroupId++}`;
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
      if (third[0] === "@") {
        group.opened = true;
        return addField(group, first, second || first, groups[third]);
      }
      if (second[0] === "@") {
        group.opened = true;
        return addField(group, first, first, groups[second]);
      }
      return addField(group, first, second || first);
    });

    groups[id] = group;

    return id;
  }

  try {
    // eslint-disable-next-line no-constant-condition
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

  if (!cacheSize || cache.size < cacheSize) {
    cache.set(cacheKey, result);
  }

  return result;
}
