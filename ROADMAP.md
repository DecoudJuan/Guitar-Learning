# Roadmap — Guitar Learning

Una clase de guitarra que corre entera en el navegador. La cámara ve **la
guitarra** y **las manos**; la app dice qué dedo va en qué traste y si lo
estás haciendo bien. No sintetiza sonido: el sonido lo hace tu guitarra.

Punto de partida: el proyecto `manos` (instrumento gestual). Se conserva el
stack de visión (MediaPipe + filtrado One Euro + histéresis) y la infra
(Vite, TS estricto, i18n, DOM sin `innerHTML`, CSP). Se elimina todo el motor
de audio.

## Principios

1. **Cero audio sintetizado.** Ni sintes, ni timbres, ni efectos, ni MIDI.
   "Acústica" y "eléctrica" son *tipos de guitarra* (geometría del mástil y
   digitaciones sugeridas), no timbres.
2. **La visión es la maestra.** Todo el feedback sale de lo que se ve:
   posición de la mano sobre el diapasón, dedo por dedo.
3. **Todo local.** Sin backend, sin cuentas, sin telemetría. El modelo de
   manos es la única descarga.
4. **Práctica, no demo.** El objetivo es que alguien que no sabe nada llegue a
   tocar una progresión completa.

## Fases

### F0 — Corte y documentación ✅
Desconectar el remoto viejo, apuntar a `DecoudJuan/Guitar-Learning`, renombrar
la carpeta, y dejar `ROADMAP.md`, `BITACORA.md` y `CLAUDE.md` escritos antes de
tocar código.

### F1 — Demolición ✅
Borrar `src/audio`, `src/midi`, el sintetizador y todo lo que dependía de él.
Reducir `App`, `index.html`, el CSS, los ajustes y los diccionarios al
esqueleto mínimo que compila y muestra la cámara con las manos.

### F2 — Dominio guitarra ✅
`src/guitar/`: afinación estándar, nota en (cuerda, traste), geometría del
diapasón (posición de trastes por `2^(-n/12)`), y una biblioteca de acordes con
digitación real (dedo, cuerda, traste, cejilla) para acústica y eléctrica.

### F3 — Calibración del diapasón ✅
Homografía de 4 puntos: el alumno marca las cuatro esquinas del mástil (cejuela
y traste 12) una vez, y queda guardada. Con eso, cualquier punto de la imagen
se convierte en coordenadas (cuerda, traste) y viceversa.

### F4 — Detección automática del mástil ✅
Visión clásica sobre el frame: escala de grises, Sobel, transformada de Hough.
Las cuerdas son un haz de rectas casi paralelas y los trastes su perpendicular;
de ahí sale el cuadrilátero del diapasón sin que el alumno marque nada. La
calibración manual queda como respaldo y como semilla.

### F5 — Lectura de la mano sobre el diapasón ✅
Las yemas de la mano que pisa se proyectan al espacio del diapasón y se
convierten en un conjunto de posiciones pisadas, con la misma histéresis y el
mismo filtro que usaba el instrumento gestual.

### F6 — Evaluación del acorde ✅
Comparar lo pisado contra la digitación objetivo: qué dedo está bien, cuál
está una cuerda arriba, cuál en el traste equivocado, cuál falta. Salida
estructurada, dedo por dedo, para que la UI pueda ser específica.

### F7 — Motor de lecciones ✅
Currícula progresiva (primeros acordes → progresiones → cambios cronometrados
→ canciones), máquina de estados de la sesión (presentar, sostener, validar,
avanzar), racha, puntaje y progreso persistido.

### F8 — Render y diagramas ✅
Overlay sobre la cámara: el cuadrilátero del diapasón, los puntos objetivo,
los dedos detectados en verde/rojo. Diagrama de acorde clásico al lado.

### F9 — Interfaz ✅
Panel de ajustes (tipo de guitarra, zurdo/diestro, tolerancia, idioma),
selector de lección, importación de cifrados para practicar canciones, y la
guía de calibración. Traducciones completas es/en.

### F10 — Deploy ✅
`vercel.json` con la CSP ajustada, README reescrito, `npm run build` limpio.

---

## Después del roadmap

Lo que queda anotado como próximo, en orden de valor:

- **Tests.** La homografía, la geometría de trastes, el juez y el viewport son
  funciones puras esperando un runner.
- **Seguir el mástil.** Hoy la calibración es estática: si se mueve la guitarra
  hay que volver a marcarla. El detector ya sabe encontrar el cuadrilátero;
  falta correrlo cada tanto y corregir la homografía en vez de reemplazarla.
- **Cambios cronometrados.** Un metrónomo visual y una lección que exige llegar
  al acorde dentro del tiempo, que es como se practica de verdad.
- **Ritmo de la mano derecha.** La otra mano está en el cuadro y no se mira.
- **Más formas.** La biblioteca cubre lo que un principiante necesita; los
  acordes que un cifrado pide y no están se reportan pero no se enseñan.
