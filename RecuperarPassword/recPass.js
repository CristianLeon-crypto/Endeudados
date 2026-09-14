// Recuperacion de contraseña (EN-14 / EN-17).
//
// Una sola pantalla con tres estados:
//   1. paso-solicitar  el usuario escribe su correo y pide el enlace
//   2. paso-nueva      llego desde el correo y escribe la contraseña nueva
//   3. paso-invalido   el enlace vencio o ya se uso
//
// El cliente `sbClient` y `urlRecuperacion()` vienen de ../shared/supabase.js

const pasoSolicitar = document.getElementById('paso-solicitar');
const pasoNueva = document.getElementById('paso-nueva');
const pasoInvalido = document.getElementById('paso-invalido');

const formSolicitar = document.getElementById('form-solicitar');
const formNueva = document.getElementById('form-nueva');

const btnSolicitar = document.getElementById('btn-solicitar');
const btnNueva = document.getElementById('btn-nueva');
const btnReintentar = document.getElementById('btn-reintentar');

const solicitarError = document.getElementById('solicitar-error');
const solicitarOk = document.getElementById('solicitar-ok');
const nuevaError = document.getElementById('nueva-error');
const nuevaOk = document.getElementById('nueva-ok');
const invalidoDetalle = document.getElementById('invalido-detalle');

function mostrar(elemento, mensaje) {
  elemento.textContent = mensaje;
  elemento.classList.remove('hidden');
}

function ocultar(elemento) {
  elemento.textContent = '';
  elemento.classList.add('hidden');
}

function verPaso(seccion) {
  [pasoSolicitar, pasoNueva, pasoInvalido].forEach(function (s) {
    s.classList.toggle('hidden', s !== seccion);
  });
}

// ---------------------------------------------------------------------------
// De que forma llego el usuario a esta pantalla
// ---------------------------------------------------------------------------

// Supabase devuelve los datos en el fragmento (#), no en la query (?), porque
// el token no debe viajar al servidor en ningun momento.
const hash = new URLSearchParams(window.location.hash.slice(1));

if (hash.get('error')) {
  // Enlace vencido, ya usado, o el usuario lo abrio dos veces.
  verPaso(pasoInvalido);
  const detalle = hash.get('error_description');
  if (detalle) {
    invalidoDetalle.textContent = decodeURIComponent(detalle.replace(/\+/g, ' '));
  }
} else if (hash.get('type') === 'recovery') {
  // Viene del correo. El SDK canjea el token del hash por una sesion temporal
  // que solo sirve para cambiar la contraseña.
  verPaso(pasoNueva);
}

// Una vez leido, se borra el hash de la barra de direcciones: ahi va el token
// de acceso y no tiene por que quedar en el historial del navegador.
if (window.location.hash) {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

btnReintentar.addEventListener('click', function () {
  verPaso(pasoSolicitar);
});

// ---------------------------------------------------------------------------
// Paso 1: pedir el enlace
// ---------------------------------------------------------------------------

formSolicitar.addEventListener('submit', async function (event) {
  event.preventDefault();
  ocultar(solicitarError);
  ocultar(solicitarOk);

  const email = document.getElementById('rec-email').value.trim();
  if (!email) {
    mostrar(solicitarError, 'Escribe tu correo electrónico.');
    return;
  }

  btnSolicitar.disabled = true;
  btnSolicitar.textContent = 'Enviando...';

  try {
    const { error } = await sbClient.auth.resetPasswordForEmail(email, {
      redirectTo: urlRecuperacion()
    });

    if (error) {
      // El caso tipico es haber pedido varios enlaces seguidos.
      if (error.status === 429) {
        mostrar(
          solicitarError,
          'Pediste varios enlaces muy seguido. Espera un minuto e intenta de nuevo.'
        );
      } else {
        mostrar(solicitarError, 'No se pudo enviar el enlace. Intenta nuevamente.');
      }
      console.error(error);
      return;
    }

    // A proposito no se dice si el correo existe o no: responder distinto
    // dejaria que cualquiera averigue que correos estan registrados en la
    // plataforma probando uno por uno.
    mostrar(
      solicitarOk,
      'Si ese correo está registrado, ya te enviamos el enlace. Revisa tu bandeja de entrada y la carpeta de spam.'
    );
    formSolicitar.reset();

  } catch (error) {
    mostrar(solicitarError, 'Ocurrió un error inesperado. Intenta nuevamente.');
    console.error(error);
  } finally {
    btnSolicitar.disabled = false;
    btnSolicitar.textContent = 'Enviarme el enlace';
  }
});

// ---------------------------------------------------------------------------
// Paso 2: guardar la contraseña nueva
// ---------------------------------------------------------------------------

formNueva.addEventListener('submit', async function (event) {
  event.preventDefault();
  ocultar(nuevaError);
  ocultar(nuevaOk);

  const password = document.getElementById('rec-password').value;
  const password2 = document.getElementById('rec-password2').value;

  if (password !== password2) {
    mostrar(nuevaError, 'Las dos contraseñas no coinciden.');
    return;
  }

  if (password.length < 6) {
    mostrar(nuevaError, 'La contraseña debe tener al menos 6 caracteres.');
    return;
  }

  btnNueva.disabled = true;
  btnNueva.textContent = 'Guardando...';

  try {
    // Sin sesion de recuperacion activa esto falla, que es justo lo que
    // queremos: nadie puede cambiar una contraseña abriendo la pantalla
    // directamente.
    const { error } = await sbClient.auth.updateUser({ password: password });

    if (error) {
      if (error.message && error.message.toLowerCase().includes('session')) {
        verPaso(pasoInvalido);
      } else {
        mostrar(nuevaError, 'No se pudo guardar la contraseña: ' + error.message);
      }
      console.error(error);
      return;
    }

    mostrar(nuevaOk, 'Listo. Tu contraseña quedó actualizada, ya puedes entrar.');

    // Se cierra la sesion temporal para que el usuario entre con su contraseña
    // nueva, en vez de quedar adentro por el enlace del correo.
    await sbClient.auth.signOut();

    setTimeout(function () {
      window.location.replace('../LoginRegistro/loRe.html');
    }, 2500);

  } catch (error) {
    mostrar(nuevaError, 'Ocurrió un error inesperado. Intenta nuevamente.');
    console.error(error);
  } finally {
    btnNueva.disabled = false;
    btnNueva.textContent = 'Guardar contraseña';
  }
});
