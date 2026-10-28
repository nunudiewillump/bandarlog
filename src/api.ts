export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
let csrf = '';
export const setCSRF = (value: string) => {
  csrf = value;
};
export async function api(path: string, method = 'GET', body?: unknown) {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Sin conexión. Vuelve a intentarlo cuando recuperes la conexión.');
  }
  const data = await response
    .json()
    .catch(() => ({ error: 'No se ha podido leer la respuesta. Vuelve a intentarlo.' }));
  if (!response.ok)
    throw new ApiError(data.error || 'No se pudo completar la operación.', response.status);
  return data;
}
