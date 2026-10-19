# 0001 · La página llega en stream, con alternativa automática sin stream

- **Estado:** aceptada · **Fecha:** 2026-10-19

## Contexto
La construcción en vivo es la parte más visible de VoiceToWeb: mientras Gemini escribe, la página se arma en la ventana por bloques. Una página tarda de 10 a 60 s en generarse. Esperar en silencio y mostrarla de golpe se siente como si la herramienta no escuchara.

El frontend está en Vercel y el backend detrás del proxy de Render. Algunos proxies retienen las respuestas largas en búfer o las cortan. Hay que verificarlo, y la app tiene que funcionar igual si pasa.

## Opciones
1. **Esperar la respuesta completa.** Simple, pero no hay construcción en vivo real; el «progreso» sería una animación inventada.
2. **Server-Sent Events (`EventSource`).** No permite `POST` con cuerpo ni la cabecera `Authorization`.
3. **`fetch` con un cuerpo NDJSON en stream** (un evento JSON por línea), leído con `ReadableStream`.
4. **WebSocket.** Es una conexión aparte, más difícil detrás de Render y exagerada para una respuesta que va en un solo sentido.

## Decisión
Opción 3, con una alternativa automática.

- **Backend.** Usa `streamGenerateContent?alt=sse` de Gemini y reenvía cada trozo como `{"tipo":"parcial","trozo":…}`.
  - Cabeceras: `Content-Type: application/x-ndjson`, `Cache-Control: no-cache, no-transform` y `X-Accel-Buffering: no`, más `flushHeaders()`.
  - Un evento `inicio` apenas abre, un `latido` cada 3 s y, al final, `final` con la página ya validada.
  - Los errores de entrada son `400` antes de abrir el stream. Los de la IA llegan como evento `error` con su código.
- **Alternativa `?stream=0`.** La misma ruta responde un JSON con la página final.
- **Frontend** (`PaginasService`). Pasa solo a la alternativa cuando:
  - no llega **ningún byte en 12 s** (con latidos cada 3 s, eso solo pasa si algo retiene el stream);
  - el stream **se corta antes del `final`**;
  - un proxy responde 502, 503 o 504 sin JSON.

  En la alternativa, la UI dice «sin vista en vivo» y, al llegar la página, la arma igual por bloques, en orden. Los errores con mensaje del servidor (400, 401, 429, IA inválida) no se repiten.

## Consecuencias
- Lo que se ve armarse es lo que Gemini ya mandó: cada bloque `data-vtw` aparece cuando cierra.
- **Probado en local** detrás de un proxy que retiene toda la respuesta: a los 12 s el cliente corta, repite con `?stream=0` y la página llega y se guarda. En Render se comprueba después del push con el comando de [despliegue.md](../despliegue.md#5-el-stream-detrás-del-proxy-de-render).
- **Costo de la alternativa.** Si el primer intento se corta, el servidor deja de leer de Gemini, y la segunda petición vuelve a generar: en el peor caso, dos llamadas a Gemini para una página. La caché evita repetir las que sí terminaron.
- `HttpClient` de Angular no entrega el cuerpo a medida que llega, así que esta ruta usa `fetch`. Por eso el token y el 401 se manejan en el servicio y no en el interceptor.
