# 0002 · Las páginas grandes se editan por secciones

- **Estado:** aceptada · **Fecha:** 2026-10-19

## Contexto
Para editar una página («cambia el título a azul») Gemini necesita el HTML actual. Con cada orden la página crece, y una de 60 000 o 100 000 caracteres hace la petición lenta y cara en cuota. Además, la respuesta tiene que volver entera: pedirle a Gemini que reescriba 100 000 caracteres para cambiar un color es un riesgo, porque puede tocar lo que no se pidió o cortarse.

## Opciones
1. **Mandar siempre la página entera.** Simple, pero sin techo.
2. **Mandar solo el `<body>`, o recortar el CSS.** Achica poco y Gemini sigue reescribiendo todo.
3. **Por secciones.** Gemini elige qué bloques tocar con un índice y después edita solo esos.

## Decisión
- **Hasta 40 000 caracteres:** página entera (opción 1), con la respuesta en stream. Es lo común y da la mejor calidad.
- **Más de 40 000 caracteres:** por secciones (opción 3), aprovechando que cada bloque de primer nivel lleva `data-vtw` (el prompt lo pide).
  1. **Elegir.** Gemini recibe el índice (id, etiqueta, primer título y 120 caracteres de texto por bloque) y la orden. Responde JSON con `{ secciones, nuevas, estilos }`.
  2. **Editar.** Recibe solo esos bloques, el CSS (hasta 12 000 caracteres) y la orden, y devuelve JSON con los bloques nuevos o editados y, si hace falta, el CSS.
  3. **Aplicar.** El servidor ubica cada bloque en el texto con parse5 (posiciones de origen) y lo **reemplaza sin tocar nada más**. Después valida el documento armado como cualquier página.

  Los dos JSON se validan con Zod (ids que existen y que se eligieron, sin JavaScript) y se reintentan una vez.

## Consecuencias
- Cada llamada mide unos pocos kilobytes, aunque la página pese 100 000 caracteres.
- Lo que no se eligió queda igual byte a byte, y el diff de bloques del frontend resalta justo lo que cambió.
- Son dos llamadas en lugar de una, solo en páginas grandes.
- Una página grande sin `data-vtw` no se puede editar por secciones y responde `400` con un mensaje claro. Las que genera VoiceToWeb siempre los traen.
- Se prueba con una página generada de más de 40 000 caracteres (`test/generar.test.js`).
