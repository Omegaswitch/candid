// The dashboard publishes the ids of its current filtered view here so the top-bar
// export can offer "Current view". Null when no filter is active.
let viewIds: string[] | null = null;
export const setViewIds = (ids: string[] | null) => {
  viewIds = ids;
};
export const getViewIds = () => viewIds;
