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
    throw new Error('Sin conexión. El cambio no se ha guardado. Vuelve a intentarlo.');
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data;
}
