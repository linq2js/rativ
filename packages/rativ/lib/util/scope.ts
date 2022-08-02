import { Context } from "./commonTypes";

export type InternalContext = Context & {
  taskIndex: number;
  taskList: Function[];
};

export type Scope = {
  parent?: any;
  type?:
    | "emittable"
    | "computed"
    | "component"
    | "updatable"
    /**
     * initializing phase of stable component
     */
    | "stable";
  addDependency?: (subscribeChannel: Function) => void;
  onAtomCreated?: (disposeAtom: VoidFunction) => void;
  addEffect?: (effect: Function) => void;
  context?: InternalContext;
  onDone?: VoidFunction;
  onCleanup?: (listener: VoidFunction) => VoidFunction;
};

let currentScope: Scope | undefined;

const scopeOfWork = (fn: (scope: Scope) => any, scope?: Scope): any => {
  const prevScope = currentScope;
  try {
    currentScope = { ...currentScope, ...scope };
    return fn(currentScope);
  } finally {
    currentScope = prevScope;
    scope?.onDone?.();
  }
};

const collectDependencies = <T>(
  fn: () => T,
  dependencies?: Map<any, any>,
  onUpdate?: VoidFunction,
  scope?: Scope
) => {
  const inactiveDependencies = new Set(dependencies?.keys());

  return scopeOfWork(fn, {
    ...scope,
    addDependency(dependant) {
      inactiveDependencies.delete(dependant);
      if (onUpdate && !dependencies?.has(dependant)) {
        dependencies?.set(dependant, dependant(onUpdate));
      }
    },
    onDone() {
      inactiveDependencies.forEach((x) => {
        const unsubscribe = dependencies?.get(x);
        if (unsubscribe) {
          dependencies?.delete(x);
          unsubscribe();
        }
      });
      scope?.onDone?.();
    },
  });
};

export { scopeOfWork, collectDependencies, currentScope };
