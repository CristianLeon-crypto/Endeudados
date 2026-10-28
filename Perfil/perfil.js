// Pantalla "Mi perfil": ver y corregir los datos del usuario.
//
// El cliente `sbClient` viene de ../shared/supabase.js.
//
// Los datos viven en public.usuarios (la fila la crea el trigger del registro
// con el nombre y la cédula). La fila se enlaza con Supabase Auth por
// usuarios.auth_id (= auth.users.id); usuarios.id es otro uuid distinto.
// El correo vive en Supabase Auth y aquí solo se muestra.
//
// Para que guardar funcione, RLS debe dejar al usuario leer y actualizar SOLO
// su propia fila (ver el SQL en la explicación que acompaña a este archivo).

const TABLA_PERFIL = 'usuarios';

const form = document.getElementById('form-perfil');
const inputNombre = document.getElementById('perfil-nombre');
const inputCedula = document.getElementById('perfil-cedula');
const inputEmail = document.getElementById('perfil-email');
const btnGuardar = document.getElementById('btn-guardar');
const btnDescartar = document.getElementById('btn-descartar');
const btnCerrarSesion = document.getElementById('btn-cerrar-sesion');

const formEliminar = document.getElementById('form-eliminar');
const inputConfirmar = document.getElementById('confirmar-eliminar');
const btnEliminar = document.getElementById('btn-eliminar');
const errorEliminar = document.getElementById('eliminar-error');

const errorCarga = document.getElementById('error-carga');
const errorGeneral = document.getElementById('perfil-error');
const mensajeOk = document.getElementById('perfil-ok');
const errorNombre = document.getElementById('error-perfil-nombre');
const errorCedula = document.getElementById('error-perfil-cedula');

const tituloNombre = document.getElementById('titulo-datos');
const correoCabecera = document.getElementById('perfil-correo-cabecera');
const iniciales = document.getElementById('perfil-iniciales');

// Lo que está guardado en la base. Sirve para saber si hay cambios y para
// volver atrás con "Descartar cambios".
let guardado = null;
// uuid de la sesión (auth.users.id). Se compara contra usuarios.auth_id.
let authId = null;

// ---------------------------------------------------------------------------
// Utilidades de pantalla
// ---------------------------------------------------------------------------

function mostrar(elemento, mensaje) {
  elemento.textContent = mensaje;
  elemento.classList.remove('hidden');
}

function ocultar(elemento) {
  elemento.textContent = '';
  elemento.classList.add('hidden');
}

function errorEnCampo(input, contenedorError, mensaje) {
  input.setAttribute('aria-invalid', 'true');
  mostrar(contenedorError, mensaje);
}

function limpiarErroresDeCampo() {
  [[inputNombre, errorNombre], [inputCedula, errorCedula]].forEach(function (par) {
    par[0].removeAttribute('aria-invalid');
    ocultar(par[1]);
  });
}

// "Cristian León" -> "CL". Con un solo nombre, solo su inicial.
function calcularIniciales(nombre) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) {
    return '?';
  }
  const primera = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primera + ultima).toUpperCase();
}

function pintarCabecera() {
  tituloNombre.textContent = guardado.nombre;
  iniciales.textContent = calcularIniciales(guardado.nombre);
}

function llenarFormulario() {
  inputNombre.value = guardado.nombre;
  inputCedula.value = guardado.cedula;
}

// Los datos de los campos, ya limpios, tal como se mandarían a guardar.
function leerFormulario() {
  return {
    nombre: inputNombre.value.trim(),
    // Igual que en el registro: de la cédula solo se conservan los dígitos.
    cedula: inputCedula.value.replace(/\D/g, '')
  };
}

function hayCambios() {
  const actual = leerFormulario();
  return actual.nombre !== guardado.nombre || actual.cedula !== guardado.cedula;
}

function actualizarBotones() {
  const cambios = guardado !== null && hayCambios();
  btnGuardar.disabled = !cambios;
  btnDescartar.disabled = !cambios;
}

function habilitarFormulario() {
  inputNombre.disabled = false;
  inputCedula.disabled = false;
  // El correo queda deshabilitado a propósito: solo se muestra.
  inputConfirmar.disabled = false;
}

// ---------------------------------------------------------------------------
// Validación (mismas reglas que el registro)
// ---------------------------------------------------------------------------

function validar(datos) {
  let valido = true;

  if (datos.nombre.length < 2) {
    errorEnCampo(inputNombre, errorNombre, 'Escribe tu nombre completo.');
    valido = false;
  } else if (datos.nombre.length > 100) {
    errorEnCampo(inputNombre, errorNombre, 'El nombre no puede tener más de 100 caracteres.');
    valido = false;
  }

  if (datos.cedula.length < 6 || datos.cedula.length > 10) {
    errorEnCampo(inputCedula, errorCedula, 'La cédula debe tener entre 6 y 10 dígitos.');
    valido = false;
  }

  return valido;
}

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------

async function cargarPerfil() {
  // Guardia de sesión: sin sesión no hay perfil que mostrar.
  const { data: sesionData, error: sesionError } = await sbClient.auth.getSession();

  if (sesionError) {
    throw sesionError;
  }

  const sesion = sesionData.session;
  if (!sesion) {
    window.location.replace('../LoginRegistro/loRe.html');
    return;
  }

  authId = sesion.user.id;
  inputEmail.value = sesion.user.email || '';
  correoCabecera.textContent = sesion.user.email || '';

  const { data, error } = await sbClient
    .from(TABLA_PERFIL)
    .select('nombre, cedula')
    .eq('auth_id', authId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    // La fila no existe o RLS no deja verla. En ambos casos no hay nada que editar.
    throw new Error('No se encontró el perfil del usuario ' + authId);
  }

  guardado = { nombre: data.nombre || '', cedula: String(data.cedula || '') };
  pintarCabecera();
  llenarFormulario();
  habilitarFormulario();
  actualizarBotones();
}

// ---------------------------------------------------------------------------
// Guardar
// ---------------------------------------------------------------------------

form.addEventListener('submit', async function (event) {
  event.preventDefault();
  ocultar(errorGeneral);
  ocultar(mensajeOk);
  limpiarErroresDeCampo();

  const datos = leerFormulario();

  if (!validar(datos)) {
    return;
  }

  if (!hayCambios()) {
    mostrar(mensajeOk, 'No hay cambios para guardar.');
    return;
  }

  btnGuardar.disabled = true;
  btnDescartar.disabled = true;
  btnGuardar.textContent = 'Guardando...';

  try {
    // .select() devuelve la fila actualizada. Si RLS no deja actualizar, Supabase
    // no da error: simplemente no toca ninguna fila y `data` llega vacío. Por eso
    // se comprueba, para no decirle "guardado" a alguien cuyo cambio no se hizo.
    const { data, error } = await sbClient
      .from(TABLA_PERFIL)
      .update({ nombre: datos.nombre, cedula: datos.cedula })
      .eq('auth_id', authId)
      .select('nombre, cedula')
      .maybeSingle();

    if (error) {
      // 23505 = violación de unicidad. A propósito no se dice que la cédula ya
      // existe: confirmarlo permitiría averiguar quién está registrado.
      if (error.code === '23505') {
        errorEnCampo(
          inputCedula,
          errorCedula,
          'No se pudo guardar esta cédula. Revisa que sea correcta y no esté registrada.'
        );
      } else {
        mostrar(errorGeneral, 'No se pudieron guardar los cambios. Intenta nuevamente.');
      }
      console.error(error);
      return;
    }

    if (!data) {
      mostrar(errorGeneral, 'No se pudieron guardar los cambios. Intenta nuevamente.');
      console.error('El update no afectó ninguna fila (revisar políticas RLS de ' + TABLA_PERFIL + ').');
      return;
    }

    guardado = { nombre: data.nombre, cedula: String(data.cedula) };
    pintarCabecera();
    llenarFormulario();
    mostrar(mensajeOk, 'Listo. Tus datos quedaron actualizados.');

  } catch (error) {
    mostrar(errorGeneral, 'Ocurrió un error inesperado. Intenta nuevamente.');
    console.error(error);
  } finally {
    btnGuardar.textContent = 'Guardar cambios';
    actualizarBotones();
  }
});

// ---------------------------------------------------------------------------
// Descartar cambios y estado de los botones
// ---------------------------------------------------------------------------

btnDescartar.addEventListener('click', function () {
  llenarFormulario();
  limpiarErroresDeCampo();
  ocultar(errorGeneral);
  ocultar(mensajeOk);
  actualizarBotones();
});

// Al escribir se limpia el error de ese campo y se recalcula si hay cambios.
[[inputNombre, errorNombre], [inputCedula, errorCedula]].forEach(function (par) {
  par[0].addEventListener('input', function () {
    par[0].removeAttribute('aria-invalid');
    ocultar(par[1]);
    ocultar(mensajeOk);
    actualizarBotones();
  });
});

// ---------------------------------------------------------------------------
// Eliminar la cuenta (EN-44)
// ---------------------------------------------------------------------------
//
// Todo el borrado lo hace la función eliminar_cuenta() de la base: borra al
// usuario de la sesión en auth.users y, por cascade, su perfil, ingresos,
// gastos, deudas y abonos. No recibe parámetros: no hay forma de pedirle que
// borre a otro. El cliente solo la llama y sale.

const PALABRA_CONFIRMACION = 'ELIMINAR';

function confirmacionValida() {
  return inputConfirmar.value.trim().toUpperCase() === PALABRA_CONFIRMACION;
}

inputConfirmar.addEventListener('input', function () {
  ocultar(errorEliminar);
  btnEliminar.disabled = !confirmacionValida();
});

formEliminar.addEventListener('submit', async function (event) {
  event.preventDefault();

  if (!confirmacionValida()) {
    return;
  }

  btnEliminar.disabled = true;
  inputConfirmar.disabled = true;
  btnEliminar.textContent = 'Eliminando...';

  try {
    const { error } = await sbClient.rpc('eliminar_cuenta');

    if (error) {
      throw error;
    }

    // El usuario ya no existe en el servidor, así que solo se limpia la sesión
    // guardada en este navegador. Un signOut normal intentaría avisarle al
    // servidor por una sesión que ya no está.
    await sbClient.auth.signOut({ scope: 'local' });
    window.location.replace('../index.html');

  } catch (error) {
    mostrar(errorEliminar, 'No se pudo eliminar la cuenta. No se borró nada; intenta nuevamente.');
    console.error(error);
    btnEliminar.textContent = 'Eliminar mi cuenta para siempre';
    inputConfirmar.disabled = false;
    btnEliminar.disabled = !confirmacionValida();
  }
});

// ---------------------------------------------------------------------------
// Cerrar sesión
// ---------------------------------------------------------------------------

btnCerrarSesion.addEventListener('click', async function () {
  btnCerrarSesion.disabled = true;

  try {
    const { error } = await sbClient.auth.signOut();
    if (error) {
      throw error;
    }
    window.location.replace('../LoginRegistro/loRe.html');
  } catch (error) {
    btnCerrarSesion.disabled = false;
    mostrar(errorGeneral, 'No se pudo cerrar la sesión. Intenta nuevamente.');
    console.error(error);
  }
});

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------

cargarPerfil().catch(function (error) {
  tituloNombre.textContent = 'No pudimos cargar tu perfil';
  mostrar(errorCarga, 'No se pudo cargar tu perfil. Recarga la página o intenta de nuevo en unos minutos.');
  console.error(error);
});
