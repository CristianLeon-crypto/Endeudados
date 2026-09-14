// Cliente de Supabase compartido por todas las pantallas.
//
// La URL y la key viven aca y solo aca. Antes estaban escritas dentro de
// LoginRegistro/auth.js, y cada pantalla nueva que necesitara la base de datos
// iba a terminar copiandolas. Ver EN-29.
//
// La anon key es publica por diseño: viaja al navegador en cualquier caso, y
// esconderla no aporta nada. Lo que protege los datos son las politicas de RLS
// de la base, no el secreto de esta cadena.
//
// Requiere que el SDK de Supabase se haya cargado antes:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   <script src="../shared/supabase.js"></script>

const SUPABASE_URL = 'https://nuuqonentwzzhptkjjyh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_q6mqvT5opf6IdhtSQ8Kq0Q_H-BlIRxT';

// `supabase` es el global que expone el SDK del CDN.
const sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// URL base de la pantalla de recuperacion, calculada en tiempo de ejecucion.
// Asi el correo de recuperacion apunta a donde el usuario realmente esta:
// Live Server en local, la preview de Vercel, o produccion. Si estuviera
// escrita a mano siempre mandaria a produccion.
function urlRecuperacion() {
  return `${window.location.origin}/RecuperarPassword/recPass.html`;
}
