// Logica pura del modulo Ingresos y Gastos: calculos, validaciones y formato.
//
// Nada de aca toca el DOM ni sabe de donde vienen los datos. Recibe listas de
// registros { concepto, monto, ... } y devuelve numeros o textos, asi que
// funciona igual con los datos de prueba de hoy que con los de Supabase.

// Tope de seguridad para un monto: 1 billon de pesos. Evita que un error de
// tipeo (ceros de mas) dispare los totales.
const MONTO_MAXIMO = 1000000000000;
const LARGO_MAXIMO_CONCEPTO = 60;

const formatoPesos = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const formatoMiles = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

// ---------------------------------------------------------------------------
// Calculos (EN-6)
// ---------------------------------------------------------------------------

function sumarMontos(registros) {
  return registros.reduce(function (total, registro) {
    return total + registro.monto;
  }, 0);
}

// Todo lo que muestra la seccion de resumen sale de aca.
//
// estado:
//   'vacio'         no hay ingresos ni gastos
//   'sin-ingresos'  hay gastos pero ningun ingreso (el porcentaje no existe)
//   'excedido'      los gastos esenciales superan los ingresos
//   'justo'         los gastos se comen exactamente todo el ingreso
//   'normal'        queda dinero disponible
function calcularResumen(ingresos, gastos) {
  const totalIngresos = sumarMontos(ingresos);
  const totalGastos = sumarMontos(gastos);
  const disponible = totalIngresos - totalGastos;

  // Con ingresos en cero el porcentaje seria una division por cero: se deja en
  // null y la pantalla muestra un texto en vez de un numero.
  const porcentajeGastos = totalIngresos > 0 ? (totalGastos / totalIngresos) * 100 : null;

  let estado = 'normal';
  if (totalIngresos === 0 && totalGastos === 0) {
    estado = 'vacio';
  } else if (totalIngresos === 0) {
    estado = 'sin-ingresos';
  } else if (disponible < 0) {
    estado = 'excedido';
  } else if (disponible === 0) {
    estado = 'justo';
  }

  return { totalIngresos, totalGastos, disponible, porcentajeGastos, estado };
}

// ---------------------------------------------------------------------------
// Validaciones (EN-4, EN-5)
// ---------------------------------------------------------------------------

// Convierte lo que el usuario escribio en un numero de pesos.
// Acepta "1500000", "1.500.000" y "$ 1.500.000". Rechaza centavos y cualquier
// otra cosa devolviendo NaN, para no adivinar que quiso decir con "1,5".
function parsearMonto(texto) {
  const limpio = String(texto).replace(/[\s$]/g, '');
  const soloDigitos = /^\d+$/;
  const conPuntosDeMiles = /^\d{1,3}(\.\d{3})+$/;

  if (!soloDigitos.test(limpio) && !conPuntosDeMiles.test(limpio)) {
    return NaN;
  }
  return Number(limpio.replace(/\./g, ''));
}

// mensajeVacio permite cambiar el texto cuando el campo no se llama "concepto"
// (por ejemplo el nombre de una deuda).
function validarConcepto(texto, mensajeVacio) {
  const concepto = String(texto).trim();
  if (!concepto) {
    return { error: mensajeVacio || 'Escribe un concepto.' };
  }
  if (concepto.length > LARGO_MAXIMO_CONCEPTO) {
    return { error: `El concepto puede tener máximo ${LARGO_MAXIMO_CONCEPTO} caracteres.` };
  }
  return { valor: concepto };
}

function validarMonto(texto) {
  if (!String(texto).trim()) {
    return { error: 'Escribe el monto.' };
  }
  const monto = parsearMonto(texto);
  if (Number.isNaN(monto)) {
    return { error: 'Escribe el monto en pesos, solo números y sin centavos. Ej. 1.500.000' };
  }
  if (monto <= 0) {
    return { error: 'El monto debe ser mayor que cero.' };
  }
  if (monto > MONTO_MAXIMO) {
    return { error: 'Ese monto es demasiado alto. Revisa que no sobren ceros.' };
  }
  return { valor: monto };
}

// Junta los resultados de cada campo en { valido, errores, datos }.
// errores tiene una llave por campo con problema; datos trae los valores ya
// limpios, listos para mandar a la capa de datos.
function armarResultado(campos) {
  const errores = {};
  const datos = {};

  Object.keys(campos).forEach(function (nombre) {
    if (campos[nombre].error) {
      errores[nombre] = campos[nombre].error;
    } else {
      datos[nombre] = campos[nombre].valor;
    }
  });

  return { valido: Object.keys(errores).length === 0, errores, datos };
}

function validarIngreso(entrada) {
  return armarResultado({
    concepto: validarConcepto(entrada.concepto),
    monto: validarMonto(entrada.monto)
  });
}

// categorias: lista de { id, nombre } tal como la devuelve la capa de datos.
function validarGasto(entrada, categorias) {
  const existe = categorias.some(function (categoria) {
    return categoria.id === entrada.categoria;
  });

  return armarResultado({
    concepto: validarConcepto(entrada.concepto),
    categoria: existe ? { valor: entrada.categoria } : { error: 'Selecciona una categoría.' },
    monto: validarMonto(entrada.monto)
  });
}

// ---------------------------------------------------------------------------
// Gastos hormiga
//
// Gastos chicos y repetidos. Lo que importa no es el monto del mes sino lo que
// suman en un año: impacto anual = monto mensual x 12.
// ---------------------------------------------------------------------------

const MESES_DEL_ANIO = 12;

function calcularImpactoAnual(montoMensual) {
  return montoMensual * MESES_DEL_ANIO;
}

function calcularResumenHormiga(gastosHormiga) {
  const totalMensual = gastosHormiga.reduce(function (total, gasto) {
    return total + gasto.montoMensual;
  }, 0);

  return {
    cantidad: gastosHormiga.length,
    totalMensual,
    impactoAnual: calcularImpactoAnual(totalMensual)
  };
}

function validarGastoHormiga(entrada) {
  return armarResultado({
    concepto: validarConcepto(entrada.concepto),
    montoMensual: validarMonto(entrada.montoMensual)
  });
}

// ---------------------------------------------------------------------------
// Deudas (metodo avalancha)
//
// La avalancha consiste en abonar de mas a la deuda con la tasa mas alta: es la
// que mas intereses cobra por cada peso que sigue debiendo.
// ---------------------------------------------------------------------------

const TASA_MAXIMA = 300; // % efectivo anual; mas que eso es un error de tipeo

// Tasa efectiva mensual equivalente a una efectiva anual:
// (1 + EA)^(1/12) - 1. No es simplemente EA / 12 porque el interes se compone.
function tasaMensualEquivalente(tasaEA) {
  return Math.pow(1 + tasaEA / 100, 1 / 12) - 1;
}

// Cuanto cuesta un mes de esa deuda si no se abona nada
function calcularInteresMensual(deuda) {
  return deuda.saldo * tasaMensualEquivalente(deuda.tasaEA);
}

// Mayor tasa primero. Si dos deudas tienen la misma tasa, primero la de menor
// saldo, que se termina de pagar antes.
function ordenarPorAvalancha(deudas) {
  return deudas.slice().sort(function (a, b) {
    if (b.tasaEA !== a.tasaEA) {
      return b.tasaEA - a.tasaEA;
    }
    return a.saldo - b.saldo;
  });
}

function calcularResumenDeudas(deudas) {
  const ordenadas = ordenarPorAvalancha(deudas);

  const saldoTotal = ordenadas.reduce(function (total, deuda) { return total + deuda.saldo; }, 0);
  const pagoMinimoTotal = ordenadas.reduce(function (total, deuda) { return total + deuda.pagoMinimo; }, 0);
  const interesMensual = ordenadas.reduce(function (total, deuda) {
    return total + calcularInteresMensual(deuda);
  }, 0);

  return {
    cantidad: ordenadas.length,
    ordenadas,
    saldoTotal,
    pagoMinimoTotal,
    // Se redondea a pesos: mostrar centavos en una estimacion no aporta nada
    interesMensual: Math.round(interesMensual),
    prioridad: ordenadas[0] || null
  };
}

// Acepta "42,5", "42.5", "42" y "42,5 %". Devuelve NaN si no se entiende.
function parsearTasa(texto) {
  const limpio = String(texto).replace(/[\s%]/g, '').replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(limpio)) {
    return NaN;
  }
  return Number(limpio);
}

function validarTasa(texto) {
  if (!String(texto).trim()) {
    return { error: 'Escribe la tasa de interés.' };
  }
  const tasa = parsearTasa(texto);
  if (Number.isNaN(tasa)) {
    return { error: 'Escribe la tasa como número, con máximo dos decimales. Ej. 42,5' };
  }
  if (tasa <= 0) {
    return { error: 'La tasa debe ser mayor que cero.' };
  }
  if (tasa > TASA_MAXIMA) {
    return { error: `La tasa no puede superar ${TASA_MAXIMA}% efectivo anual.` };
  }
  return { valor: tasa };
}

// El pago minimo si puede ser cero (hay creditos sin cuota minima este mes)
function validarPagoMinimo(texto) {
  if (!String(texto).trim()) {
    return { error: 'Escribe el pago mínimo.' };
  }
  const monto = parsearMonto(texto);
  if (Number.isNaN(monto)) {
    return { error: 'Escribe el monto en pesos, solo números y sin centavos. Ej. 180.000' };
  }
  if (monto > MONTO_MAXIMO) {
    return { error: 'Ese monto es demasiado alto. Revisa que no sobren ceros.' };
  }
  return { valor: monto };
}

function validarDeuda(entrada) {
  return armarResultado({
    nombre: validarConcepto(entrada.nombre, 'Escribe el nombre de la deuda.'),
    saldo: validarMonto(entrada.saldo),
    tasaEA: validarTasa(entrada.tasaEA),
    pagoMinimo: validarPagoMinimo(entrada.pagoMinimo)
  });
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

function formatearPesos(valor) {
  return formatoPesos.format(valor);
}

// "1500000" -> "1.500.000", para mostrar dentro del input
function formatearMiles(valor) {
  return formatoMiles.format(valor);
}

// Menos de 10% se muestra con un decimal para que un gasto pequeño no aparezca
// como "0 %".
function formatearPorcentaje(porcentaje) {
  if (porcentaje === null) {
    return 'Sin datos';
  }
  const decimales = porcentaje > 0 && porcentaje < 10 ? 1 : 0;
  return porcentaje.toLocaleString('es-CO', { maximumFractionDigits: decimales }) + '%';
}

// 42.5 -> '42,5% E.A.'
function formatearTasa(tasaEA) {
  return tasaEA.toLocaleString('es-CO', { maximumFractionDigits: 2 }) + '% E.A.';
}

// Periodo en formato 'AAAA-MM' segun la hora local del usuario (no UTC: a las
// 8 p. m. del 30 en Colombia ya es el dia 1 en UTC).
function periodoDeFecha(fecha) {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}`;
}

// '2026-09' -> 'septiembre de 2026'
function nombreDelPeriodo(periodo) {
  const [anio, mes] = periodo.split('-').map(Number);
  return new Date(anio, mes - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}
