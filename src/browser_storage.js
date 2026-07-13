export const createKeyValueStorage = (key, api, fallback) => ({
  get: async () => api.getValue(key, fallback),
  set: async (value) => api.setValue(key, value),
  delete: async () => api.deleteValue(key),
  listen: (callback) => api.addValueChangeListener(key, (_name, oldValue, newValue, remote) => {
    callback(newValue, oldValue, remote);
  })
});
