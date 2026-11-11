// Apoyo para probar los scripts de navegador sin navegador ni base de datos.
//
// Los archivos de la app no tienen exports: cada pantalla los carga con una
// etiqueta <script> y usan globales (sbClient, document, window). Aca se
// cargan dentro de un contexto de vm con esos globales reemplazados por
// versiones falsas que guardan lo que se les pidio:
//
//   crearSupabaseFalso()  cliente que anota cada consulta y responde lo que
//                         la prueba le diga, sin tocar la base real
//   crearDocumentoFalso() document.getElementById con elementos minimos
//   cargarScript()        corre un archivo de la app dentro del contexto
//
// No usa dependencias: solo lo que trae Node.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Supabase falso
// ---------------------------------------------------------------------------

// Cada llamada a sbClient.from(tabla) arma una consulta que guarda la cadena
// de metodos (select, eq, insert...). Al esperarla con await se le pregunta a
// `responder` que devolver. Por defecto devuelve { data: [], error: null }.
function crearSupabaseFalso(opciones) {
  const config = opciones || {};
  const consultas = [];
  const llamadasAuth = [];

  const responder = config.responder || function () {
    return { data: [], error: null };
  };

  function crearConsulta(tabla) {
    const consulta = { tabla, pasos: [] };
    consultas.push(consulta);

    const constructor = {};
    ['select', 'insert', 'update', 'delete', 'eq', 'gte', 'lt', 'single', 'maybeSingle'].forEach(function (metodo) {
      constructor[metodo] = function () {
        consulta.pasos.push({ metodo, args: Array.from(arguments) });
        return constructor;
      };
    });
    // Hace que la consulta se pueda esperar con await, como la del SDK
    constructor.then = function (resolver, rechazar) {
      return Promise.resolve().then(function () { return responder(consulta); }).then(resolver, rechazar);
    };
    return constructor;
  }

  // auth: cada metodo responde lo que diga config.auth[metodo] o, si no
  // hay nada, { data: {}, error: null }.
  const respuestasAuth = config.auth || {};
  const auth = {};
  ['getSession', 'signOut', 'signUp', 'signInWithPassword', 'resetPasswordForEmail', 'updateUser'].forEach(function (metodo) {
    auth[metodo] = async function () {
      llamadasAuth.push({ metodo, args: Array.from(arguments) });
      const respuesta = respuestasAuth[metodo];
      if (typeof respuesta === 'function') {
        return respuesta.apply(null, arguments);
      }
      return respuesta || { data: {}, error: null };
    };
  });

  return {
    cliente: { from: crearConsulta, auth },
    consultas,
    llamadasAuth
  };
}

// Busca en la cadena de una consulta los argumentos de un metodo
function paso(consulta, metodo) {
  const encontrado = consulta.pasos.find(function (p) { return p.metodo === metodo; });
  return encontrado ? encontrado.args : undefined;
}

function pasos(consulta, metodo) {
  return consulta.pasos.filter(function (p) { return p.metodo === metodo; }).map(function (p) { return p.args; });
}

// ---------------------------------------------------------------------------
// DOM falso
// ---------------------------------------------------------------------------

function crearElemento(id) {
  const clases = new Set();
  const escuchas = {};

  return {
    id,
    value: '',
    textContent: '',
    disabled: false,
    reseteado: false,
    classList: {
      add: function (c) { clases.add(c); },
      remove: function (c) { clases.delete(c); },
      contains: function (c) { return clases.has(c); },
      toggle: function (c, forzar) {
        const poner = forzar === undefined ? !clases.has(c) : forzar;
        if (poner) { clases.add(c); } else { clases.delete(c); }
        return poner;
      }
    },
    addEventListener: function (tipo, fn) {
      (escuchas[tipo] = escuchas[tipo] || []).push(fn);
    },
    reset: function () { this.reseteado = true; },
    // Dispara el evento y espera a que terminen los manejadores async
    disparar: async function (tipo) {
      const evento = { preventDefault: function () { evento.prevenido = true; }, prevenido: false };
      for (const fn of escuchas[tipo] || []) {
        await fn(evento);
      }
      return evento;
    },
    visible: function () { return !clases.has('hidden'); }
  };
}

function crearDocumentoFalso() {
  const elementos = {};
  return {
    elementos,
    getElementById: function (id) {
      if (!elementos[id]) {
        elementos[id] = crearElemento(id);
      }
      return elementos[id];
    }
  };
}

// window.location falso: guarda a donde se mando al usuario
function crearUbicacionFalsa(inicial) {
  return Object.assign({
    origin: 'https://endeudados.test',
    pathname: '/',
    search: '',
    hash: '',
    href: '',
    reemplazadaPor: null,
    replace: function (url) { this.reemplazadaPor = url; }
  }, inicial || {});
}

// ---------------------------------------------------------------------------
// Carga de scripts
// ---------------------------------------------------------------------------

// Un Date que siempre dice que hoy es `hoy`, para que las fechas que guarda
// la capa de datos no dependan del dia en que se corren las pruebas.
function crearFechaFija(hoy) {
  const fija = new Date(hoy);
  return class FechaFija extends Date {
    constructor() {
      if (arguments.length === 0) {
        super(fija.getTime());
      } else {
        super(...arguments);
      }
    }
    static now() { return fija.getTime(); }
  };
}

const consolaMuda = { log: function () {}, error: function () {}, warn: function () {} };

// Corre `rutaRelativa` en un contexto nuevo con los globales dados y devuelve
// el contexto: las funciones declaradas en el archivo quedan como propiedades.
function cargarScript(rutasRelativas, globales) {
  const contexto = vm.createContext(Object.assign({ console: consolaMuda }, globales));
  [].concat(rutasRelativas).forEach(function (ruta) {
    const archivo = path.join(RAIZ, ruta);
    vm.runInContext(fs.readFileSync(archivo, 'utf8'), contexto, { filename: archivo });
  });
  return contexto;
}

// Los objetos creados dentro del contexto tienen otro Object.prototype, y
// assert.deepStrictEqual los veria distintos. Se pasan a objetos planos.
function plano(valor) {
  return JSON.parse(JSON.stringify(valor));
}

module.exports = {
  crearSupabaseFalso,
  paso,
  pasos,
  crearDocumentoFalso,
  crearUbicacionFalsa,
  crearFechaFija,
  cargarScript,
  plano
};
