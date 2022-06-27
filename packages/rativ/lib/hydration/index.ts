export interface HydrateOptions {
  data?: [unknown, unknown][];
  onLoad?: (key: any) => void;
  onSave?: (key: any, data: any) => void;
}

export const hydrate = ({ data, onLoad, onSave }: HydrateOptions = {}) => {
  let hydratedData = new Map<any, any>(data ?? []);
  let allDataReady: Promise<void> | undefined;
  let dataReadyResolve: VoidFunction | undefined;
  let dehydrated = false;
  const pending = new Set<unknown>();

  const dehydrate = async () => {
    await allDataReady;
    return Array.from(hydratedData.entries());
  };

  return Object.assign(
    (key: unknown) => {
      pending.add(key);
      allDataReady = new Promise((resolve) => {
        dataReadyResolve = resolve;
      });
      return {
        load() {
          onLoad?.(key);
          return hydratedData.get(key);
        },
        save(data: any) {
          pending.delete(key);
          hydratedData.set(key, { data });
          if (!pending.size) {
            dehydrated = true;
            dataReadyResolve?.();
          }
          if (dehydrated) {
            onSave?.(key, data);
          }
        },
      };
    },
    { dehydrate }
  );
};
