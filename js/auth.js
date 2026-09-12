/**
  * @file Supabase Authentication - auth.js
 */
const SUPABASE_URL = 'https://nuuqonentwzzhptkjjyh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_q6mqvT5opf6IdhtSQ8Kq0Q_H-BlIRxT';
const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


const tabLogin = document.getElementById('tab-login');
const tabRegistro = document.getElementById('tab-registro');
const formLogin = document.getElementById('form-login');
const formRegistro = document.getElementById('form-registro');

function activarTabLogin() {
  tabLogin.classList.add('active');
  tabRegistro.classList.remove('active');
  formLogin.classList.remove('hidden');
  formRegistro.classList.add('hidden');
}

function activarTabRegistro() {
  tabRegistro.classList.add('active');
  tabLogin.classList.remove('active');
  formRegistro.classList.remove('hidden');
  formLogin.classList.add('hidden');
}

tabLogin.addEventListener('click', activarTabLogin);
tabRegistro.addEventListener('click', activarTabRegistro);


// ===============================
// MENSAJES DE ERROR
// ===============================

const loginError = document.getElementById('login-error');
const regError = document.getElementById('reg-error');

function mostrarError(elemento, mensaje) {
  elemento.textContent = mensaje;
  elemento.classList.remove('hidden');
}

function ocultarError(elemento) {
  elemento.textContent = '';
  elemento.classList.add('hidden');
}


// ===============================
// REGISTRO DE USUARIO
// ===============================

formRegistro.addEventListener('submit', async function (event) {
  event.preventDefault();

  ocultarError(regError);

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

    alert('Registro exitoso. Ya puedes iniciar sesión.');

    formRegistro.reset();
    activarTabLogin();

  } catch (error) {
    mostrarError(
      regError,
      'Ocurrió un error inesperado. Intenta nuevamente.'
    );

    console.error(error);
  }
});


// ===============================
// INICIO DE SESIÓN
// ===============================

formLogin.addEventListener('submit', async function (event) {
  event.preventDefault();

  ocultarError(loginError);

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
      mostrarError(
        loginError,
        'Correo o contraseña incorrectos.'
      );
      console.error(error);
      return;
    }

    console.log('Usuario autenticado:', data.user);

    // Por ahora mostramos un mensaje de prueba
    alert('Inicio de sesión exitoso.');

    // Más adelante cambiaremos esto por:
    // window.location.href = 'dashboard.html';

  } catch (error) {
    mostrarError(
      loginError,
      'Ocurrió un error inesperado. Intenta nuevamente.'
    );

    console.error(error);
  }
});
