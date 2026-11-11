# Cómo trabajamos

## Ramas

```
main       producción. Solo recibe lo que viene de develop
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

En la rama, en el commit y, si se abre PR, en su título. Es lo que permite que
desde un ticket de Jira se llegue al código y al revés.

```bash
git commit -m "feat(deudas): calcula el plan mensual (EN-88)"
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
3. El cambio está en `main` (o sea, en producción), y el enlace al commit o al
   PR está en el ticket.

Escribir el código no es terminar.

## Base de datos

**Nada se cambia desde el dashboard de Supabase.** Todo cambio de esquema o de
políticas va como migración en el repo del backend. Si se toca el dashboard, el
repo queda mintiendo y no hay forma de saber qué hay en producción.

## Revisión

El PR es opcional: el profe dijo (9-nov) que con 4 personas no hace falta.
Quien termina puede mergear directo a `develop`.

Lo que no es opcional es el punto 2 de la definición de terminado: **otra
persona** prueba el cambio funcionando antes de pasarlo a Finalizada. Sin PR,
esa prueba es la única revisión que queda.

Si se abre un PR y lleva más de un día esperando, se dice en el daily como
bloqueo.
