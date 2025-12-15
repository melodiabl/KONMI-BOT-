// utils/fetch.js
// Proporciona una implementación de fetch segura para entornos Node < 18,
// reutilizando la implementación nativa cuando está disponible.

let fetchImpl = globalThis.fetch;
let ResponseImpl = globalThis.Response;
let HeadersImpl = globalThis.Headers;
let RequestImpl = globalThis.Request;

if (typeof fetchImpl !== 'function') {
  const nodeFetchModule = await import('node-fetch');
  fetchImpl = nodeFetchModule.default;
  ResponseImpl = nodeFetchModule.Response;
  HeadersImpl = nodeFetchModule.Headers;
  RequestImpl = nodeFetchModule.Request;

  // Expone en el espacio global para librerías que esperan fetch global
  globalThis.fetch = fetchImpl;
  if (!globalThis.Response) globalThis.Response = ResponseImpl;
  if (!globalThis.Headers) globalThis.Headers = HeadersImpl;
  if (!globalThis.Request) globalThis.Request = RequestImpl;
}

const fetch = (...args) => fetchImpl(...args);

export { fetch as default, ResponseImpl as FetchResponse, HeadersImpl as FetchHeaders, RequestImpl as FetchRequest };
