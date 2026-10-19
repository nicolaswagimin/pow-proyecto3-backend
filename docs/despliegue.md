# Despliegue · VoiceToWeb

El backend va en **Render** (Web Service gratuito) y la base de datos en **Neon** (PostgreSQL gratuito). El frontend va en Vercel (ver el README de [pow-proyecto3-frontend](https://github.com/nicolaswagimin/pow-proyecto3-frontend)).

## 1. Base de datos en Neon

1. Crea un proyecto en <https://neon.tech> (uno por proyecto, o una base distinta para cada uno).
2. Copia la **connection string** de PostgreSQL. Tiene la forma `postgresql://usuario:contraseña@host/neondb?sslmode=require`.
3. No hace falta crear las tablas: el backend ejecuta `schema.sql` al arrancar. Si prefieres hacerlo a mano, pégalo en el editor SQL de Neon.

Neon exige SSL: deja `DB_SSL` sin definir o en `true`.

## 2. API key de Gemini

Crea una en <https://aistudio.google.com/apikey>. Puede ser la misma para los tres proyectos.

## 3. Web Service en Render

1. En <https://render.com>: **New → Web Service** y conecta el repositorio `pow-proyecto3-backend`.
2. Configura:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. En **Environment**, agrega:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La connection string de Neon |
| `GEMINI_API_KEY` | Tu API key |
| `JWT_SECRET` | Un secreto nuevo (no el de local), generado con `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `FRONTEND_URL` | La URL de Vercel sin `/` final; puedes sumar las locales: `https://pow-proyecto3.vercel.app,http://localhost:4200,http://localhost:4203` |
| `JWT_EXPIRES_IN` | Opcional (`7d` por defecto) |
| `GEMINI_MODEL` | Opcional. Por defecto `gemini-3.5-flash-lite`; si la pones, usa ese mismo valor |

No definas `PORT`: Render lo asigna.

4. Despliega y abre `https://pow-proyecto3-backend.onrender.com/api/health`. Debe responder `{"ok":true,"db":true,"ia":true}`.
5. Esa URL más `/api` es la que usa `src/environments/environment.ts` del frontend.

## 4. Conectar CORS

Cuando Vercel te dé la URL del frontend, ponla en `FRONTEND_URL` y guarda. Render vuelve a desplegar solo.

## 5. El stream detrás del proxy de Render

`POST /api/paginas/generar` y `/editar` responden en stream (NDJSON) para que la página se arme en vivo. El servidor manda las cabeceras contra el búfer (`Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`), un evento `inicio` apenas abre y un `latido` cada 3 s.

Si algún proxy retuviera o cortara el stream, el frontend no se queda esperando:
- si no llega un byte en 12 s, o el stream se corta sin el evento `final`, repite la petición con `?stream=0`;
- muestra el progreso igual;
- arma la página por bloques cuando llega.

Está probado en local detrás de un proxy que retiene toda la respuesta (ver [decisiones/0001](decisiones/0001-respuesta-en-stream-con-alternativa.md)).

**Comprobarlo en Render después de desplegar** (los trozos deben llegar de a poco, no todos al final):

```bash
TOKEN=$(curl -s -X POST https://pow-proyecto3-backend.onrender.com/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"tu@correo.com","password":"tu-contraseña"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -N -X POST https://pow-proyecto3-backend.onrender.com/api/paginas/generar -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" -d '{"orden":"una página de prueba para una panadería '"$(date +%s)"'"}' \
  | while IFS= read -r l; do echo "$(date +%T) ${l:0:60}"; done
```

## Comprobaciones

| Síntoma | Causa probable |
|---|---|
| El servicio no arranca y el log dice "Falta la variable JWT_SECRET" | Falta `JWT_SECRET` |
| `/api/health` responde `"db": false` | `DATABASE_URL` mal copiada, o `DB_SSL=false` con Neon |
| `/api/health` responde `"ia": false` | Falta `GEMINI_API_KEY` |
| El frontend dice "No hay conexión con el backend" pero `/api/health` funciona en el navegador | El origen de Vercel no está en `FRONTEND_URL` (CORS) |
| La página se ve completa de golpe, sin armarse en vivo, y aparece «sin vista en vivo» | Un proxy retiene el stream: funciona igual con la alternativa sin stream. Revisa la comprobación del punto 5 |
| La primera petición tarda unos 50 s | El plan gratuito de Render duerme el servicio tras un rato sin uso; el frontend avisa "El servidor está despertando" |

## En local

```bash
npm install
cp .env.example .env     # rellena DATABASE_URL, GEMINI_API_KEY y JWT_SECRET
npm run dev              # http://localhost:3003, se reinicia al guardar
npm test                 # pruebas con node:test (Gemini, la red y la base simulados)
```

Desde la carpeta raíz del repositorio de proyectos, `./demo.sh` arranca los tres backends y los tres frontends a la vez.
