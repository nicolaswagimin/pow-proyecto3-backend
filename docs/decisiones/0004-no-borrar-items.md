# 0004 · `items` deja de usarse pero no se borra

- **Estado:** aceptada · **Fecha:** 2026-10-19

## Contexto
`items` era el CRUD de ejemplo del proyecto base. VoiceToWeb lo reemplaza por proyectos y versiones, y la API ya no lo usa.

## Decisión
`schema.sql` deja de crear la tabla `items`, pero **no la borra**: un `DROP TABLE` en un archivo que se ejecuta en cada arranque borraría datos sin aviso en cualquier base existente. Es el mismo criterio que en CodeToDiagram y a11Lens.

## Consecuencias
- Las bases nuevas no tienen `items`, y las existentes la conservan sin uso.
- Para eliminarla a mano: `DROP TABLE IF EXISTS items;` (documentado en [base-de-datos.md](../base-de-datos.md)).
