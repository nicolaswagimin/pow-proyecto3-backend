# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Sin publicar] · 2026-10-12

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
