# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Sin publicar] · 2026-10-19 · Funcionalidad completa

### Agregado
- `POST /api/paginas/generar` y `/editar`: Gemini genera y edita páginas completas (un HTML con su CSS, sin JavaScript) en **stream NDJSON**, con eventos `inicio`, `latido`, `fase`, `parcial`, `reintento`, `final` y `error`. Cabeceras contra el búfer de proxies. Con `?stream=0`, alternativa con JSON.
- Validación con Zod de cada página (completa, de 200 a 100 000 caracteres, sin `<script>`, `on*` ni `javascript:`) y un reintento con los errores.
- Edición por secciones de páginas de más de 40 000 caracteres: Gemini elige los bloques `data-vtw` con un índice y edita solo esos; parse5 los reemplaza en su lugar.
- Caché de la IA en `ia_cache`: la misma orden (normalizada) sobre el mismo HTML no vuelve a llamar a Gemini.
- Un reintento cuando Gemini está muy solicitado (503) y mensajes claros para la cuota (429).
- Proyectos y versiones por usuario: `/api/proyectos` (listar, crear, abrir con todas sus versiones, renombrar, borrar) y `/api/proyectos/:id/versiones`. Las versiones forman un árbol (`base_id`).
- Tablas `proyectos`, `versiones` e `ia_cache`.
- Límites: 20 páginas y 120 operaciones con proyectos cada 15 minutos por usuario.
- 55 pruebas con `node:test` (`npm test`), con Gemini, la caché, la red y la base simulados.
- Dependencias: `zod` y `parse5`.

### Cambiado
- Modelo por defecto: `gemini-3.5-flash-lite`.
- El cuerpo JSON acepta hasta 1 MB.

### Corregido
- La edición por secciones corrompía la página cuando se agregaba un bloque justo antes de otro que también cambiaba, si no había espacio entre ellos. Varios bloques nuevos tras el mismo quedaban además en orden inverso.

### Eliminado
- El CRUD de ejemplo `/api/items` y la ruta genérica `/api/ia`. La tabla `items` deja de crearse pero no se borra (ver [ADR 0004](docs/decisiones/0004-no-borrar-items.md)).

### Documentación
- Nuevos: `docs/ia.md` y las decisiones 0001 a 0004.
- Actualizados: `api.md`, `base-de-datos.md`, `seguridad.md`, `despliegue.md` (cómo comprobar el stream en Render) y `arquitectura-backend.md`.

### Variables de entorno
- Ninguna nueva. Si en Render `GEMINI_MODEL` tiene otro valor, pon `gemini-3.5-flash-lite` o bórrala.

## 2026-10-12

### Documentación
- El proyecto pasa a llamarse **VoiceToWeb** en el README.
- `docs/api.md`: cada endpoint con request, response y errores.
- `docs/base-de-datos.md`: tablas, columnas, relaciones y consultas.
- `docs/seguridad.md`: bcrypt, JWT, CORS, límites de intentos, variables de entorno y pendientes conocidos.
- `docs/despliegue.md`: Neon, Render, variables y comprobaciones.
- `docs/arquitectura-backend.md`: carpetas, middleware en orden y flujo de una petición.

El código no cambió.

## 2026-10-06

### Agregado
- Autenticación con correo y contraseña: registro, login y `/yo`, con bcrypt y JWT.
- Límites de intentos: 10 logins cada 15 min por IP y 30 preguntas a la IA cada 15 min por usuario.
- Items filtrados por usuario (`usuario_id` con `ON DELETE CASCADE`).
- Tabla `usuarios` lista para un futuro login con Google (`google_id`, `avatar_url`, `proveedor`).

### Base inicial
- Express con CORS configurable, PostgreSQL (Neon o Supabase) con creación automática de tablas, Gemini por API REST y `/api/health`.
