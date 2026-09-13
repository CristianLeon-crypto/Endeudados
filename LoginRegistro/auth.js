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
  const cedula = document.getElementById('reg-cedula').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;

  if (!nombre || !cedula || !email || !password) {
    mostrarError(regError, 'Completa todos los campos.');
    return;
  }

  try {
    // Crear usuario en Supabase Authentication
    const { data: authData, error: authError } =
      await client.auth.signUp({
        email: email,
        password: password
      });

    if (authError) {
      mostrarError(regError, authError.message);
      return;
    }

    const usuarioAuth = authData.user;

    if (!usuarioAuth) {
      mostrarError(
        regError,
        'No se pudo crear el usuario en Supabase.'
      );
      return;
    }

    // Guardar los datos personales en la tabla usuarios
    const { error: datosError } = await client
      .from('usuarios')
      .insert([
        {
          auth_id: usuarioAuth.id,
          nombre: nombre,
          cedula: cedula,
          email: email
        }
      ]);

    if (datosError) {
      mostrarError(
        regError,
        'La cuenta fue creada, pero no se pudieron guardar tus datos: ' +
        datosError.message
      );
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
