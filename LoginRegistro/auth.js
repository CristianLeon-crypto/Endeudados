/// SUBASE datos
const SUPABASE_URL = 'https://nuuqonentwzzhptkjjyh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_q6mqvT5opf6IdhtSQ8Kq0Q_H-BlIRxT';
const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// MENSAJES DE ERROR / INFORMACIÓN
const loginError = document.getElementById('login-error');
const loginInfo = document.getElementById('login-info');
const regError = document.getElementById('reg-error');
const regSuccess = document.getElementById('reg-success');

function mostrarError(elemento, mensaje) {
  elemento.textContent = mensaje;
  elemento.classList.remove('hidden');
}

function ocultarError(elemento) {
  elemento.textContent = '';
  elemento.classList.add('hidden');
}

// REGISTRO DE USUARIO
formRegistro.addEventListener('submit', async function (event) {
  event.preventDefault();

  ocultarError(regError);
  ocultarError(regSuccess);

  const nombre = document.getElementById('reg-nombre').value.trim();
  // En Colombia la cédula se escribe con puntos (1.020.304.050). Se dejan solo
  // los dígitos antes de mandarla.
  const cedula = document.getElementById('reg-cedula').value.replace(/\D/g, '');
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;

  if (!nombre || !cedula || !email || !password) {
    mostrarError(regError, 'Completa todos los campos.');
    return;
  }

  if (cedula.length < 6 || cedula.length > 10) {
    mostrarError(regError, 'La cédula debe tener entre 6 y 10 dígitos.');
    return;
  }

  try {
    // Un solo paso. Nombre y cédula viajan dentro del signUp y el perfil en
    // public.usuarios lo crea un trigger en la base de datos (EN-24, EN-25).
    //
    // Antes este archivo hacía un select y un insert sobre usuarios. Los dos
    // salían sin sesión, porque signUp no devuelve sesión mientras el correo no
    // esté confirmado, y RLS los rechazaba: el select devolvía lista vacía y el
    // insert fallaba. El trigger corre dentro de Postgres y no necesita sesión.
    const { data: authData, error: authError } =
      await client.auth.signUp({
        email: email,
        password: password,
        options: {
          data: { nombre: nombre, cedula: cedula },
          // El enlace del correo vuelve a donde el usuario se registró:
          // Live Server, preview de Vercel o producción.
          emailRedirectTo: `${window.location.origin}/LoginRegistro/loRe.html`
        }
      });

    if (authError) {
      if (authError.status === 429) {
        mostrarError(
          regError,
          'Se enviaron demasiados correos en poco tiempo. Espera unos minutos e intenta de nuevo.'
        );
      } else if (authError.status >= 500) {
        // El trigger rechazó el registro: cédula ya registrada o datos
        // inválidos. A propósito no se dice cuál de los dos: confirmar que una
        // cédula existe le permitiría a cualquiera averiguar quién está
        // registrado en la plataforma.
        mostrarError(
          regError,
          'No se pudo crear la cuenta. Revisa que la cédula y el correo sean correctos y no estén registrados.'
        );
      } else {
        mostrarError(regError, 'No se pudo crear la cuenta: ' + authError.message);
      }
      console.error(authError);
      return;
    }

    if (!authData.user) {
      mostrarError(regError, 'No se pudo crear la cuenta. Intenta nuevamente.');
      return;
    }

    mostrarError(
      regSuccess,
      'Registro exitoso. Te enviamos un correo de confirmación, revisa tu bandeja de entrada y confirma tu cuenta antes de iniciar sesión.'
    );

    formRegistro.reset();

  } catch (error) {
    mostrarError(
      regError,
      'Ocurrió un error inesperado. Intenta nuevamente.'
    );

    console.error(error);
  }
});

// INICIO DE SESIÓN
formLogin.addEventListener('submit', async function (event) {
  event.preventDefault();

  ocultarError(loginError);
  ocultarError(loginInfo);

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    mostrarError(
      loginError,
      'Escribe tu correo y tu contraseña.'
    );
    return;
  }

  try {
    const { data, error } =
      await client.auth.signInWithPassword({
        email: email,
        password: password
      });

    if (error) {
      if (error.message && error.message.toLowerCase().includes('confirm')) {
        mostrarError(
          loginInfo,
          'Debes confirmar tu correo electrónico antes de iniciar sesión. Revisa el mensaje que te enviamos a tu correo.'
        );
      } else {
        mostrarError(
          loginError,
          'Correo o contraseña incorrectos.'
        );
      }
      console.error(error);
      return;
    }

    console.log('Usuario autenticado:', data.user);

    // Redirigir al usuario a la pantalla de Ingresos y Gastos
    window.location.href = '../IngresosGastos/inGas.html';

  } catch (error) {
    mostrarError(
      loginError,
      'Ocurrió un error inesperado. Intenta nuevamente.'
    );

    console.error(error);
  }
});
