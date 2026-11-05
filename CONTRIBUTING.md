# Cómo trabajamos

## Ramas

```
main       producción. Solo recibe PR desde develop
develop    integración. Aquí llega todo lo terminado del sprint
feature/EN-88-plan-de-pago     trabajo nuevo
fix/EN-55-indice-deudas        correcciones
```

Se sale siempre de `develop`, nunca de `main`.

```bash
git checkout develop && git pull
git checkout -b feature/EN-88-plan-de-pago
```

## El número del ticket va en todo

En la rama, en el commit y en el título del PR. Es lo que permite que desde un
ticket de Jira se llegue al código y al revés.

```bash
git commit -m "feat(deudas): calcula el plan mensual (EN-88)"
gh pr create --base develop --title "feat(deudas): plan de pago mensual (EN-88)"
```

## Mensajes de commit

`tipo(area): que hace en presente (EN-XX)`

Tipos: `feat` funcionalidad nueva · `fix` corrección · `docs` documentación ·
`style` solo presentación · `refactor` reorganizar sin cambiar comportamiento ·
`chore` configuración y mantenimiento.

En español, sin emojis.

## Definición de terminado

Un ticket pasa a Finalizada solo cuando:

1. El criterio de aceptación del ticket se cumple.
2. Alguien lo probó funcionando, no solo que el código está escrito.
3. Hay un PR mergeado, y su enlace está en el ticket.

Escribir el código no es terminar.

## Base de datos

**Nada se cambia desde el dashboard de Supabase.** Todo cambio de esquema o de
políticas va como migración en el repo del backend. Si se toca el dashboard, el
repo queda mintiendo y no hay forma de saber qué hay en producción.

## Revisión

Ningún PR se mergea sin que otra persona lo mire. Si alguien lleva más de un día
esperando revisión, se dice en el daily como bloqueo: es lo único que lo
desatasca.
