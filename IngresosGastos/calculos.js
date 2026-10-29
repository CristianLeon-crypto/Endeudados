// Logica pura del modulo Ingresos y Gastos: calculos, validaciones y formato.
// Tambien la usa la pantalla PlanPagos/.
//
// Nada de aca toca el DOM ni sabe de donde vienen los datos. Recibe listas de
// registros { concepto, monto, ... } y devuelve numeros o textos, asi que
// funciona igual con los datos de prueba de hoy que con los de Supabase.

// Tope de seguridad para un monto: 1 billon de pesos. Evita que un error de
// tipeo (ceros de mas) dispare los totales.
const MONTO_MAXIMO = 1000000000;
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
// Plan de pagos del mes (EN-88)
//
// Un solo mes, sin simular los siguientes. Con lo que queda despues de lo
// esencial se reservan primero los minimos de TODAS las deudas; todo lo que
// sobre va a la deuda de mayor tasa (la prioridad de la avalancha).
//
// estado:
//   'sin-deudas'    no hay deudas registradas: no hay nada que planear
//   'insuficiente'  la capacidad no cubre la suma de minimos: no hay plan
//   'plan'          alcanza; pagos dice cuanto abonarle a cada deuda
// ---------------------------------------------------------------------------

function calcularPlanPagos(ingresos, gastos, deudas) {
  const resumen = calcularResumen(ingresos, gastos);
  const resumenDeudas = calcularResumenDeudas(deudas);

  // Capacidad = ingresos - gastos esenciales del mes, el "disponible" del resumen
  const capacidad = resumen.disponible;

  // El minimo de una deuda nunca puede ser mayor que lo que se debe: una deuda
  // de 30.000 con minimo de 50.000 se salda con 30.000 (EN-101).
  const pagoMinimoTotal = resumenDeudas.ordenadas.reduce(function (total, deuda) {
    return total + Math.min(deuda.pagoMinimo, deuda.saldo);
  }, 0);

  const alcanza = capacidad >= pagoMinimoTotal;

  const plan = {
    totalIngresos: resumen.totalIngresos,
    totalGastos: resumen.totalGastos,
    capacidad,
    pagoMinimoTotal,
    excedente: alcanza ? capacidad - pagoMinimoTotal : 0,
    faltante: alcanza ? 0 : pagoMinimoTotal - capacidad,
    // Lo que queda despues de saldar TODAS las deudas, si es que sobra
    sobrante: 0,
    prioridad: resumenDeudas.prioridad,
    pagos: [],
    estado: 'plan'
  };

  if (resumenDeudas.cantidad === 0) {
    plan.estado = 'sin-deudas';
    return plan;
  }
  if (!alcanza) {
    plan.estado = 'insuficiente';
    return plan;
  }

  const reparto = repartirPagos(resumenDeudas.ordenadas, plan.excedente);
  plan.pagos = reparto.pagos;
  // Si alcanzo para saldar todas las deudas, esto es lo que queda libre.
  plan.sobrante = reparto.sobrante;

  return plan;
}

// Reparte un mes de pagos. Lo usan el plan del mes (EN-88) y la simulacion
// hasta quedar libre de deudas (EN-77), para que la regla de la avalancha
// viva en un solo lugar.
//
// ordenadas viene en orden avalancha: la prioridad es la primera. excedente
// es lo que queda despues de reservar los minimos.
function repartirPagos(ordenadas, excedente) {
  // Primero el minimo de cada deuda, topado a lo que se debe.
  const pagos = ordenadas.map(function (deuda, indice) {
    const minimo = Math.min(deuda.pagoMinimo, deuda.saldo);
    return { deuda, esPrioridad: indice === 0, minimo, extra: 0, pago: minimo };
  });

  // Despues el excedente, en orden de tasa y sin pasar del saldo de cada deuda.
  // Cuando una queda saldada, lo que sobra pasa a la siguiente: esa cascada ES
  // el metodo avalancha. Antes el excedente completo iba a la primera deuda
  // aunque solo se debieran 200.000 de ella, y el plan sugeria abonar de mas
  // mientras la siguiente recibia solo su minimo (EN-101).
  let porRepartir = excedente;
  pagos.forEach(function (item) {
    if (porRepartir <= 0) {
      return;
    }
    const faltaParaSaldar = item.deuda.saldo - item.pago;
    const extra = Math.min(faltaParaSaldar, porRepartir);
    item.extra = extra;
    item.pago += extra;
    porRepartir -= extra;
  });

  return { pagos, sobrante: porRepartir };
}

// ---------------------------------------------------------------------------
// Cuando quedo libre de deudas (EN-77)
//
// Repite el plan del mes hasta que todos los saldos llegan a cero. Supone que
// la capacidad de este mes se mantiene igual todos los meses: los mismos
// ingresos y gastos esenciales, y ninguna deuda nueva. Cada mes:
//   1. se reparte la capacidad con repartirPagos (minimos y avalancha)
//   2. se resta lo pagado
//   3. lo que queda debiendo genera el interes del mes
// Al pagar antes de cobrar interes, el primer mes es exactamente el plan que
// muestra la pantalla hoy.
//
// estado:
//   'sin-deudas'    no hay deudas con saldo: no hay nada que simular
//   'insuficiente'  la capacidad no cubre los minimos: no hay fecha posible
//   'no-termina'    con estos pagos la deuda no se termina. motivo dice por que:
//                     'intereses'  el interes del mes iguala o supera lo pagado
//                     'plazo'      baja, pero tardaria mas de 50 anios
//   'libre'         periodoLibre es el mes del ultimo pago
// ---------------------------------------------------------------------------

// Tope de la simulacion: 50 anios. Mas que eso no es un plan, y evita que un
// pago apenas mayor que el interes deje el ciclo corriendo por siglos.
const MESES_MAXIMOS_SIMULACION = 600;

function sumarSaldos(deudas) {
  return deudas.reduce(function (total, deuda) { return total + deuda.saldo; }, 0);
}

function simularLibreDeDeudas(ingresos, gastos, deudas, periodoInicial) {
  // Una deuda en cero (por ejemplo, saldada con abonos) ya no cuenta
  const conSaldo = deudas.filter(function (deuda) { return deuda.saldo > 0; });
  const planDelMes = calcularPlanPagos(ingresos, gastos, conSaldo);

  const resultado = {
    estado: planDelMes.estado,
    motivo: null,
    capacidad: planDelMes.capacidad,
    faltante: planDelMes.faltante,
    meses: 0,
    periodoLibre: null,
    totalIntereses: 0,
    totalPagado: 0,
    // Un renglon por mes con lo pagado, el interes y el saldo de cada deuda.
    // Lo va a mostrar el cronograma (EN-89).
    cronograma: []
  };

  if (planDelMes.estado !== 'plan') {
    return resultado;
  }

  // Copias: la simulacion baja los saldos mes a mes y no debe tocar las deudas
  // que tiene la pantalla.
  let vigentes = conSaldo.map(function (deuda) { return Object.assign({}, deuda); });
  let saldoAnterior = sumarSaldos(vigentes);

  while (vigentes.length > 0) {
    if (resultado.meses === MESES_MAXIMOS_SIMULACION) {
      resultado.estado = 'no-termina';
      resultado.motivo = 'plazo';
      return resultado;
    }

    // Los minimos solo bajan con el tiempo (cada uno esta topado a su saldo y
    // las deudas saldadas salen), asi que si alcanzo el primer mes alcanza
    // todos. Lo que antes era minimo de una deuda saldada pasa al excedente.
    const ordenadas = ordenarPorAvalancha(vigentes);
    const minimos = ordenadas.reduce(function (total, deuda) {
      return total + Math.min(deuda.pagoMinimo, deuda.saldo);
    }, 0);
    const reparto = repartirPagos(ordenadas, resultado.capacidad - minimos);

    let pagadoDelMes = 0;
    let interesDelMes = 0;
    const detalle = reparto.pagos.map(function (item) {
      const restante = item.deuda.saldo - item.pago;
      // Se redondea a pesos cada mes: sin eso quedan saldos de centavos que
      // alargan la fecha un mes de mas.
      const interes = Math.round(restante * tasaMensualEquivalente(item.deuda.tasaEA));
      item.deuda.saldo = restante + interes;

      pagadoDelMes += item.pago;
      interesDelMes += interes;
      return { id: item.deuda.id, nombre: item.deuda.nombre, pago: item.pago, interes, saldo: item.deuda.saldo };
    });

    resultado.meses += 1;
    resultado.totalPagado += pagadoDelMes;
    resultado.totalIntereses += interesDelMes;

    vigentes = vigentes.filter(function (deuda) { return deuda.saldo > 0; });
    const saldoTotal = sumarSaldos(vigentes);

    resultado.cronograma.push({
      periodo: sumarMesesAPeriodo(periodoInicial, resultado.meses - 1),
      pagado: pagadoDelMes,
      interes: interesDelMes,
      saldo: saldoTotal,
      deudas: detalle
    });

    // Si el saldo no bajo, el interes se come todo el pago: nunca va a bajar.
    if (saldoTotal > 0 && saldoTotal >= saldoAnterior) {
      resultado.estado = 'no-termina';
      resultado.motivo = 'intereses';
      return resultado;
    }
    saldoAnterior = saldoTotal;
  }

  resultado.estado = 'libre';
  resultado.periodoLibre = resultado.cronograma[resultado.cronograma.length - 1].periodo;
  return resultado;
}

// ---------------------------------------------------------------------------
// Cronograma resumido (EN-89)
//
// Una fila por deuda a partir del cronograma de simularLibreDeDeudas(): en que
// mes queda en cero, cuanto se le abona y cuantos intereses genera. Van en el
// orden en que se saldan, que no siempre es el de la tasa: una deuda chica
// puede saldarse con su minimo antes que la prioridad. Las que no alcanzan a
// saldarse dentro de la simulacion van al final con periodoSaldada en null.
// ---------------------------------------------------------------------------

function resumirCronograma(simulacion) {
  const porDeuda = new Map();

  simulacion.cronograma.forEach(function (mes, indice) {
    mes.deudas.forEach(function (fila) {
      if (!porDeuda.has(fila.id)) {
        porDeuda.set(fila.id, {
          id: fila.id,
          nombre: fila.nombre,
          periodoSaldada: null,
          meses: null,
          totalPagado: 0,
          totalIntereses: 0
        });
      }
      const resumen = porDeuda.get(fila.id);
      resumen.totalPagado += fila.pago;
      resumen.totalIntereses += fila.interes;
      if (fila.saldo === 0) {
        resumen.periodoSaldada = mes.periodo;
        resumen.meses = indice + 1;
      }
    });
  });

  // sort es estable: con el mismo mes queda el orden avalancha del primer mes
  const deudas = Array.from(porDeuda.values()).sort(function (a, b) {
    if (a.meses === null || b.meses === null) {
      return (a.meses === null) - (b.meses === null);
    }
    return a.meses - b.meses;
  });

  return {
    deudas,
    totalPagado: simulacion.totalPagado,
    totalIntereses: simulacion.totalIntereses
  };
}

// ----
// Analisis financiero (modulo Deudas)
//
// Funciones que arman los datos de los graficos de torta de la pantalla
// Deudas/. Devuelven las cifras que se muestran como titulares y una lista de
// porciones { etiqueta, valor } lista para Chart.js.
// ----

// Estado financiero del mes: como se reparte el ingreso entre lo esencial y
// lo que queda disponible. Con deficit la porcion disponible no existe.
function calcularEstadoFinanciero(ingresos, gastos) {
  const resumen = calcularResumen(ingresos, gastos);

  const porciones = [{ etiqueta: 'Gastos esenciales', valor: resumen.totalGastos }];
  if (resumen.disponible > 0) {
    porciones.push({ etiqueta: 'Disponible', valor: resumen.disponible });
  }

  return {
    totalIngresos: resumen.totalIngresos,
    totalGastos: resumen.totalGastos,
    disponible: resumen.disponible,
    estado: resumen.estado,
    porciones
  };
}

// Distribucion del saldo total entre cada deuda, en orden avalancha
function calcularDistribucionDeudas(deudas) {
  const resumen = calcularResumenDeudas(deudas);

  return {
    saldoTotal: resumen.saldoTotal,
    cantidad: resumen.cantidad,
    prioridad: resumen.prioridad,
    porciones: resumen.ordenadas.map(function (deuda) {
      return { etiqueta: deuda.nombre, valor: deuda.saldo };
    })
  };
}

// Ratios del mes: ingresos frente a gastos esenciales y gastos hormiga
function calcularRatios(ingresos, gastos, gastosHormiga) {
  const totalIngresos = sumarMontos(ingresos);
  const totalGastos = sumarMontos(gastos);
  const totalHormiga = calcularResumenHormiga(gastosHormiga).totalMensual;

  return {
    totalIngresos,
    totalGastos,
    totalHormiga,
    porciones: [
      { etiqueta: 'Ingresos', valor: totalIngresos },
      { etiqueta: 'Gastos esenciales', valor: totalGastos },
      { etiqueta: 'Gastos hormiga', valor: totalHormiga }
    ]
  };
}

// ----
// Abonos (pagos a deudas)
// ----

// deudas: lista de { id, nombre, ... } tal como la devuelve la capa de datos.
function validarAbono(entrada, deudas) {
  const existe = deudas.some(function (deuda) {
    return String(deuda.id) === String(entrada.deudaId);
  });

  return armarResultado({
    deudaId: existe ? { valor: entrada.deudaId } : { error: 'Selecciona una deuda.' },
    monto: validarMonto(entrada.monto)
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

// ('2026-11', 3) -> '2027-02'
function sumarMesesAPeriodo(periodo, meses) {
  const [anio, mes] = periodo.split('-').map(Number);
  return periodoDeFecha(new Date(anio, mes - 1 + meses, 1));
}

// '2026-09' -> 'septiembre de 2026'
function nombreDelPeriodo(periodo) {
  const [anio, mes] = periodo.split('-').map(Number);
  return new Date(anio, mes - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Proyeccion: cuanto falta para terminar de pagar (con interes)
// ---------------------------------------------------------------------------

// Tope de meses simulados (50 anos): evita colgar la pantalla cuando el pago
// apenas cubre los intereses.
const MESES_MAXIMOS_PROYECCION = 600;

// Del excedente del mes solo se puede comprometer en abonos extra una parte.
// El resto queda libre para ocio, imprevistos y paz mental.
const PORCENTAJE_ABONABLE = 0.7;
const PASO_ABONO_EXTRA = 10000;

// Tope del abono extra: 70% del excedente, redondeado a la baja en pasos de
// 10.000. Si el excedente es muy justo devuelve 0: no se puede aumentar.
function topeAbonoExtra(excedente) {
  if (excedente <= 0) {
    return 0;
  }
  return Math.floor((excedente * PORCENTAJE_ABONABLE) / PASO_ABONO_EXTRA) * PASO_ABONO_EXTRA;
}

// Cuantos meses faltan para pagar TODAS las deudas si cada mes se pagan los
// minimos mas un abono extra, con interes compuesto y avalancha.
// deudas: [{ nombre, saldo, tasaEA, pagoMinimo }], igual que la capa de datos.
// Devuelve { estado, meses, interesesTotales }:
//   'sin-deudas'  no hay deudas que pagar
//   'no_amortiza' lo que se paga no cubre los intereses: la deuda crece
//   'limite'      con ese pago no se termina en 50 anos
//   'ok'          meses: cuanto falta; interesesTotales: interes pagado en total
function proyectarSalidaDeuda(deudas, abonoExtra) {
  if (!deudas.length) {
    return { estado: 'sin-deudas' };
  }

  const tasas = deudas.map(function (deuda) {
    return tasaMensualEquivalente(deuda.tasaEA);
  });
  const saldos = deudas.map(function (deuda) { return deuda.saldo; });
  const presupuesto = deudas.reduce(function (total, deuda) {
    return total + Math.min(deuda.pagoMinimo, deuda.saldo);
  }, 0) + abonoExtra;

  const interesesPrimerMes = deudas.reduce(function (total, _, i) {
    return total + saldos[i] * tasas[i];
  }, 0);
  if (presupuesto <= interesesPrimerMes) {
    return { estado: 'no_amortiza' };
  }

  // Avalancha: la plata va primero a la deuda de mayor tasa
  const orden = deudas.map(function (_, i) { return i; }).sort(function (a, b) {
    return tasas[b] - tasas[a];
  });

  let meses = 0;
  let interesesTotales = 0;

  while (meses < MESES_MAXIMOS_PROYECCION && saldos.some(function (saldo) { return saldo > 0.5; })) {
    meses++;
    deudas.forEach(function (_, i) {
      const interes = saldos[i] * tasas[i];
      interesesTotales += interes;
      saldos[i] += interes;
    });

    let bolsa = presupuesto;
    orden.forEach(function (i) {
      const pago = Math.min(bolsa, saldos[i]);
      saldos[i] -= pago;
      bolsa -= pago;
    });
  }

  if (saldos.some(function (saldo) { return saldo > 0.5; })) {
    return { estado: 'limite' };
  }

  return { estado: 'ok', meses, interesesTotales: Math.round(interesesTotales) };
}

// 'ok' con 14 meses desde noviembre de 2026 -> 'enero de 2028'
function fechaQuedaLibre(meses) {
  const fecha = new Date();
  fecha.setMonth(fecha.getMonth() + meses);
  return fecha.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}

// Texto del tiempo restante, igual en las dos pantallas que lo muestran
function textoProyeccion(proyeccion) {
  if (proyeccion.estado === 'sin-deudas') {
    return 'No tienes deudas registradas: ya estás libre.';
  }
  if (proyeccion.estado === 'no_amortiza') {
    return 'Con este abono la deuda nunca se termina: lo que pagas no cubre los intereses.';
  }
  if (proyeccion.estado === 'limite') {
    return 'Con este abono no se termina ni en 50 años. Sube el abono extra.';
  }

  const anios = Math.floor(proyeccion.meses / 12);
  const resto = proyeccion.meses % 12;
  const duracion = anios > 0
    ? `${anios} ${anios === 1 ? 'año' : 'años'}${resto ? ` y ${resto} ${resto === 1 ? 'mes' : 'meses'}` : ''}`
    : `${proyeccion.meses} ${proyeccion.meses === 1 ? 'mes' : 'meses'}`;
  return `${duracion}, quedando libre en ${fechaQuedaLibre(proyeccion.meses)}.`;
}

