// Tokens arrive in the fragment, which browsers do not transmit in HTTP requests.
(() => {
  const destinations = {
    '/aprobar-grupo': '/aprobar-grupo/revisar',
    '/confirmar-grupo': '/confirmar-grupo/revisar',
  };
  const action = destinations[location.pathname];
  if (!action) return;
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  history.replaceState(null, '', location.pathname);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    const message = document.querySelector('[data-link-status]');
    if (message)
      message.textContent =
        'El enlace no es válido. Abre el enlace completo que recibiste por correo.';
    return;
  }
  const form = document.createElement('form');
  form.method = 'post';
  form.action = action;
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'token';
  input.value = token;
  form.append(input);
  document.body.append(form);
  form.submit(); // Review only; approval/activation still require an explicit button.
})();
