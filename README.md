# DGA-PDF — Editor de PDF

**Dirección General de Aguas · Ministerio de Obras Públicas**

Visualiza, anota, firma y manipula documentos PDF directamente en el navegador. Todo el procesamiento ocurre **en tu equipo** (client-side): los archivos nunca se suben a un servidor. Exporta a PDF, imágenes o Word.

---

## Tabla de contenido

- [Requisitos previos](#requisitos-previos)
- [Instalación](#instalación)
- [Ejecución en desarrollo](#ejecución-en-desarrollo)
- [Compilación para producción](#compilación-para-producción)
- [Despliegue](#despliegue)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Funcionalidades](#funcionalidades)
- [Solución de problemas](#solución-de-problemas)

---

## Requisitos previos

Antes de instalar, asegúrate de tener:

| Herramienta | Versión recomendada | Verificar con |
|-------------|--------------------|----------------|
| **Node.js** | 18.18 o superior (LTS 20+ recomendado) | `node --version` |
| **Gestor de paquetes** | pnpm 9+ (recomendado), o npm 10+ / yarn | `pnpm --version` |
| **Navegador** | Chrome, Edge, Firefox o Safari actualizados | — |

> Se recomienda **pnpm** porque el proyecto define `pnpm.overrides` en `package.json`. Si no lo tienes, instálalo con:
> ```bash
> npm install -g pnpm
> ```

---

## Instalación

1. **Obtén el código** (clona el repositorio o descomprime el archivo del proyecto):

   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd foliopad
   ```

2. **Instala las dependencias:**

   ```bash
   pnpm install
   ```

   > Con npm: `npm install` &nbsp;·&nbsp; Con yarn: `yarn install`

No se requieren variables de entorno para el funcionamiento básico: la aplicación funciona 100 % en el navegador.

---

## Ejecución en desarrollo

Inicia el servidor de desarrollo:

```bash
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador. La página se recarga automáticamente al guardar cambios.

---

## Compilación para producción

```bash
# Genera la build optimizada
pnpm build

# Sirve la build de producción localmente
pnpm start
```

La aplicación quedará disponible en [http://localhost:3000](http://localhost:3000).

---

## Despliegue

El proyecto es una aplicación **Next.js 16** estándar y puede desplegarse en cualquier plataforma compatible.

### Vercel (recomendado)

1. Sube el proyecto a un repositorio Git (GitHub, GitLab o Bitbucket).
2. Importa el repositorio en [vercel.com/new](https://vercel.com/new).
3. Vercel detecta Next.js automáticamente. Pulsa **Deploy**.

No hay que configurar variables de entorno para el uso básico.

---

## Estructura del proyecto

```
.
├── app/
│   ├── layout.tsx           # Layout raíz, fuentes y metadata
│   ├── page.tsx             # Punto de entrada de la app
│   └── globals.css          # Estilos globales y tokens de diseño
├── components/
│   ├── pdf-editor/           # Componentes del editor
│   │   ├── pdf-editor.tsx        # Orquestador principal
│   │   ├── home-screen.tsx       # Pantalla de inicio
│   │   ├── page-canvas.tsx       # Render y capa de anotación por página
│   │   ├── editor-toolbar.tsx    # Barra de herramientas
│   │   ├── page-organizer/       # Vista de pantalla completa "Organizar páginas"
│   │   ├── annotation-*.tsx      # Vista y panel de propiedades de anotaciones
│   │   ├── *-dialog.tsx          # Diálogos (exportar, firmar, OCR, nuevo PDF)
│   │   └── ...
│   └── ui/                   # Componentes de UI (shadcn / Base UI)
├── hooks/
│   ├── use-pdf-document.ts   # Carga del documento con pdf.js
│   ├── use-pdf-editor-store.ts # Estado, historial (deshacer/rehacer)
│   └── use-pdf-search.ts     # Búsqueda de texto
├── lib/
│   ├── pdfjs.ts              # Configuración de pdf.js
│   ├── pdf-engine.ts         # Incrustado de anotaciones con pdf-lib
│   ├── pdf-export.ts         # Exportación a imágenes / Word
│   ├── pdf-pages.ts          # Crear, insertar, duplicar, extraer páginas
│   ├── pdf-session.ts        # Autoguardado en IndexedDB
│   ├── pdf-ocr.ts            # OCR con Tesseract.js
│   └── ...
├── next.config.mjs
├── package.json
└── tsconfig.json
```

---

## Funcionalidades

- **Visor de PDF** con zoom, navegación y miniaturas.
- **Anotaciones en vivo:** texto, resaltado, dibujo a mano alzada, rectángulo, elipse, línea, flecha y firma.
- **Edición de anotaciones:** seleccionar, mover, redimensionar, cambiar color/opacidad/grosor y eliminar.
- **Gestión de páginas:** rotar, reordenar, eliminar/restaurar, insertar en blanco, duplicar y extraer.
- **Crear PDF** en blanco (A4, Carta, Oficio, A3; vertical u horizontal).
- **Importar** PDF e imágenes y combinarlos.
- **Formularios:** rellenar campos de formularios PDF.
- **OCR** de documentos escaneados (Tesseract.js).
- **Búsqueda** de texto dentro del documento.
- **Autoguardado** de la sesión en el navegador (IndexedDB) con opción de restaurar.
- **Exportar** a PDF, imágenes (PNG) o Word (.docx).

> **Privacidad:** todo el procesamiento se realiza en el navegador. Ningún archivo se envía a un servidor.

---

## Solución de problemas

| Problema | Solución |
|----------|----------|
| `command not found: pnpm` | Instala pnpm: `npm install -g pnpm` |
| Errores de versión de Node | Usa Node 18.18+ (recomendado 20 LTS). Considera [nvm](https://github.com/nvm-sh/nvm). |
| El puerto 3000 está ocupado | Ejecuta en otro puerto: `pnpm dev -p 3001` |
| Fallos raros tras actualizar dependencias | Borra `node_modules` y `.next`, luego reinstala: `rm -rf node_modules .next && pnpm install` |
| La sesión guardada no aparece | El autoguardado usa IndexedDB; no funciona en modo incógnito con almacenamiento bloqueado. |

---

## Tecnologías

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · pdf.js · pdf-lib · Tesseract.js · shadcn / Base UI
