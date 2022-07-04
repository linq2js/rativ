export interface HydrateOptions {
  state?: [unknown, unknown][];
  onLoad?: (key: any) => void;
  onSave?: (key: any, state: any) => void;
}

export const hydrate = ({ state, onLoad, onSave }: HydrateOptions = {}) => {
  let hydratedState = new Map<any, any>(state ?? []);
  let allStateReady: Promise<void> | undefined;
  let stateReadyResolve: VoidFunction | undefined;
  let dehydrated = false;
  const pending = new Set<unknown>();

  /**
   * for SSR
   * @returns
   */
  const dehydrate = async () => {
    await allStateReady;
    return Array.from(hydratedState.entries());
  };

  return Object.assign(
    (key: unknown) => {
      pending.add(key);
      allStateReady = new Promise((resolve) => {
        stateReadyResolve = resolve;
      });
      return {
        load() {
          onLoad?.(key);
          return hydratedState.get(key);
        },
        save(state: any) {
          pending.delete(key);
          hydratedState.set(key, { state });
          if (!pending.size) {
            dehydrated = true;
            stateReadyResolve?.();
          }
          if (dehydrated) {
            onSave?.(key, state);
          }
        },
      };
    },
    { dehydrate }
  );
};
