# Seguridad · VoiceToWeb

## Contraseñas (bcrypt)

- Se guardan con `bcryptjs`, 10 rondas de sal. Nunca se guarda ni se registra la contraseña en texto.
- Mínimo 8 caracteres y máximo 72 **bytes**: bcrypt ignora lo que pasa de 72, así que se rechaza en lugar de dar una falsa sensación de seguridad.
- **Tiempo de respuesta parejo:** si el correo no existe, el login compara igual contra un hash de relleno (`HASH_FALSO`). Así no se puede saber qué correos tienen cuenta midiendo cuánto tarda la respuesta.
- **Mensaje genérico:** correo inexistente, contraseña equivocada o cuenta sin contraseña responden lo mismo: "El correo o la contraseña no coinciden."
- El registro sí responde `409` si el correo ya existe, para que la persona sepa que debe iniciar sesión. Es una concesión de usabilidad: revela que el correo está registrado.

## Sesiones (JWT)

- Firmados con `HS256` y `JWT_SECRET`. El payload solo lleva `sub` (el id del usuario) y la expiración.
- Duran `JWT_EXPIRES_IN` (7 días por defecto).
- `requireAuth` exige `Authorization: Bearer <token>`, verifica la firma aceptando solo `HS256` y **consulta la base de datos** en cada petición: un usuario borrado no puede seguir usando su token.
- Sin `JWT_SECRET` el servidor no arranca.
- El token vive en el `localStorage` del frontend. Es simple y funciona entre dominios (Vercel y Render), pero un XSS en el frontend podría leerlo. Angular escapa las plantillas por defecto, lo que reduce ese riesgo.

## CORS

- Solo se permiten los orígenes listados en `FRONTEND_URL` (separados por comas, sin `/` final; el código quita la barra si viene).
- Un origen no permitido no recibe cabeceras CORS y el navegador bloquea la respuesta.
- Las peticiones sin cabecera `Origin` (curl, Postman, health checks de Render) se permiten: CORS protege al navegador, no reemplaza la autenticación.
- No se usan cookies, así que no hay credenciales que CORS deba proteger.

## Límites de intentos

| Ruta | Límite | Clave |
|---|---|---|
| `POST /api/auth/login` | 10 cada 15 min | IP (`trust proxy` en 1 para leer la IP real detrás del proxy de Render) |
| `POST /api/paginas/generar` y `/editar` | 20 cada 15 min (juntas) | id del usuario |
| `/api/proyectos` | 120 cada 15 min | id del usuario |

Al pasarlo responden `429` con un mensaje en español y las cabeceras estándar `RateLimit` (borrador 8). El contador vive en memoria: se reinicia al reiniciar el servidor y no se comparte entre instancias.

## Datos y consultas

- Todas las consultas SQL son parametrizadas.
- Las columnas sensibles (`password_hash`, `google_id`) nunca se devuelven: se usa `COLUMNAS_PUBLICAS`.
- Los proyectos y sus versiones se filtran siempre por `usuario_id`; uno ajeno responde `404`, igual que uno inexistente, para no revelar que existe. Una versión no puede tomar como base una versión de otro proyecto.
- Las entradas de las rutas se validan con Zod: órdenes de hasta 2000 caracteres, páginas de hasta 150 000 y JSON de hasta 1 MB.
- La API key de Gemini solo vive en el backend y viaja en la cabecera `x-goog-api-key`, no en la URL.

## Páginas generadas

Lo que devuelve Gemini es **dato no confiable**, aunque el prompt pida que no haya JavaScript.

1. **En el servidor:** `validarPagina` rechaza cualquier página con `<script>`, y la edición por secciones rechaza bloques con `<script>`, `on*` o `javascript:`. Lo que no pasa se reintenta una vez y después es `502`, sin guardarse.
2. **En el navegador** (`vista-previa/sanear.ts` del frontend, ver su `vista-previa.md`):
   - un saneado a punto fijo quita scripts, marcos, objetos, `<base>`, meta refresh, `on*`, `srcdoc`, `formaction`, URLs `javascript:` y CSS que ejecuta código, y deja solo las hojas de Google Fonts;
   - la vista previa es un iframe con `sandbox=""`, **sin ningún permiso**: ni scripts, ni mismo origen, ni formularios, ni ventanas, ni navegación;
   - lleva una CSP sin `script-src`, y los enlaces que navegan se neutralizan.
3. **Lo que se descarga** es la página saneada.

El servidor nunca interpreta ni ejecuta el HTML: solo lo valida como texto, y en la edición por secciones lo parsea con parse5, que no ejecuta nada.

## Variables de entorno

| Variable | Sensible | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión de PostgreSQL (incluye la contraseña) |
| `JWT_SECRET` | Sí | Secreto de firma. Largo, aleatorio y **distinto en cada proyecto y en cada entorno** |
| `GEMINI_API_KEY` | Sí | API key de Google AI Studio |
| `DB_SSL` | No | `false` solo para un PostgreSQL local |
| `FRONTEND_URL` | No | Orígenes permitidos por CORS |
| `JWT_EXPIRES_IN` | No | Duración de la sesión |
| `GEMINI_MODEL` | No | Modelo de Gemini (por defecto `gemini-3.5-flash-lite`) |
| `PORT` | No | Puerto (Render lo asigna) |

- `.env` está en `.gitignore`; el repositorio solo tiene `.env.example` sin valores.
- Genera el secreto con `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

## Pendientes conocidos

- `POST /api/auth/registro` no tiene límite de intentos.
- No hay cabeceras de seguridad HTTP (por ejemplo con `helmet`).
- No hay revocación de tokens: cerrar sesión borra el token del navegador, pero el token sigue siendo válido hasta que expira.
