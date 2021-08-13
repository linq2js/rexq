// import { createContext, createElement, useRef, useContext } from "react";
// import { EMPTY_OBJECT, parseQuery } from "./util";

// const queryControllerContext = createContext();
// const parseQueryCache = new Map();

// export function useQueryController() {
//   return useContext(queryControllerContext);
// }

// export function createModule(resolvers) {
//   function useModule(query, variables = EMPTY_OBJECT) {
//     const ref = useRef({});
//     if (!ref.current || ref.current.query !== query) {
//       if (ref.current) {
//         ref.current.dispose();
//       }
//       ref.current = createQueryResult(query);
//     }
//     ref.current.variables = variables;
//   }

//   function createQueryResult(query) {
//     const { root, error } = parseQuery(query, parseQueryCache);
//     if (error) throw error;
//   }

//   function resolve() {}

//   return [useModule, resolve];
// }

// export function Provider({ children, fallback }) {
//   const ref = useRef();
//   if (!ref.current) {
//     ref.current = createQueryController();
//   }
//   Object.assign(ref.current, { fallback });
//   return createElement(queryControllerContext.Provider, {
//     value: null,
//     children,
//   });
// }

// function createQueryController() {
//   const provider = {
//     handleFallback(query, variables) {},
//   };
//   return provider;
// }

export default null;
