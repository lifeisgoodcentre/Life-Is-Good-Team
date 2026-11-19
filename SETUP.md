# Guía de instalación — Life Is Good Team Portal

Tiempo estimado: **30–40 minutos**, una sola vez. Coste: **0 $** (planes gratuitos de Supabase y GitHub).

## Qué es público y qué es privado

| Dónde | Qué contiene | ¿Quién lo ve? |
|---|---|---|
| **GitHub** (repositorio público) | El diseño de la web, el código y el póster de uniforme | Cualquiera que busque el repositorio |
| **Supabase** (base de datos) | El texto del Code, las preguntas, las respuestas correctas, el progreso y las firmas | Solo el personal aprobado y con sesión iniciada. Las respuestas correctas no las ve nadie desde la web |
| **Tu ordenador** (`private/`) | El contenido editable del Code | Solo tú. **No se sube a GitHub** (lo bloquea `.gitignore`) |

---

## Paso 1 — Crear el proyecto en Supabase

1. Entra en <https://supabase.com> y crea una cuenta (puedes usar *Continue with GitHub*).
2. **New project**:
   - Name: `lig-team-portal`
   - Database password: genera una y **guárdala** en un sitio seguro.
   - Region: **Sydney (ap-southeast-2)**, la más cercana a Brisbane.
3. Espera 1–2 minutos a que el proyecto esté listo.

## Paso 2 — Crear la base de datos

1. En el menú izquierdo abre **SQL Editor** → **New query**.
2. Abre el archivo `supabase/schema.sql`, copia **todo** su contenido, pégalo y pulsa **Run**. Debe decir *Success*.
3. Haz otra **New query** con el contenido de `private/seed_content.sql` y pulsa **Run**. Esto carga:
   - Los 2 módulos de la inducción de seguridad y los 13 del Code (48 preguntas en total)
   - Las 15 tareas de la checklist de la primera semana
   - Los 4 documentos oficiales (Fair Work Information Statement, Casual y Fixed Term Information Statements, y el award)

## Paso 3 — Configurar el inicio de sesión

1. **Authentication → Sign In / Providers → Email**:
   - *Enable Email provider*: **activado**
   - *Confirm email*: **desactivado**. El servicio de email gratuito de Supabase solo envía correos a los miembros del proyecto, así que la confirmación por email no les llegaría a tus empleados. En su lugar, cada cuenta nueva queda **pendiente hasta que la apruebes**.
2. **Authentication → URL Configuration → Site URL**: pon la dirección de GitHub Pages (Paso 5). Puedes volver a esto al final.

## Paso 4 — Conectar la web con Supabase

1. En Supabase, abre **Project Settings → API** (o *Data API / API Keys*).
2. Copia:
   - **Project URL** (algo como `https://abcdefgh.supabase.co`)
   - La clave **anon public**. Si tu proyecto muestra *Publishable key* y *Legacy API keys*, usa la **anon** de *Legacy API keys*, que es un texto largo que empieza por `eyJ`. ⚠️ **Nunca** uses la clave `service_role` ni la *secret key*.
3. Abre `js/config.js` y pega los dos valores entre las comillas:
   ```js
   export const config = {
     supabaseUrl: "https://abcdefgh.supabase.co",
     supabaseAnonKey: "eyJhbGciOi...",
   };
   ```
   La clave *anon* está pensada para ir en la web. Es seguro publicarla, porque toda la seguridad está en la base de datos.

## Paso 5 — Publicar en GitHub Pages

1. Crea una cuenta en <https://github.com> si no tienes una.
2. **New repository**:
   - Name: `lig-team-portal`
   - Visibilidad: **Public**. GitHub Pages gratis requiere un repositorio público, y el contenido del Code no va en el repositorio.
3. Sube los archivos de la carpeta `staff-portal` **excepto la carpeta `private/`**:
   - **Opción fácil (web):** en el repositorio nuevo, *Add file → Upload files*, arrastra `index.html`, `README.md`, `SETUP.md`, `.nojekyll`, `.gitignore` y las carpetas `assets`, `css`, `js`, `supabase` y `.github`. Luego *Commit changes*.
   - **Opción git:** te ayudo a hacerlo con comandos desde aquí.
4. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, Branch: `main` / `(root)` → **Save**.
5. En 1–2 minutos la web estará en `https://TU-USUARIO.github.io/lig-team-portal/`.
6. Vuelve al Paso 3.2 y pon esa dirección como *Site URL*.

## Paso 6 — Tu cuenta de manager

1. Abre la web y pulsa **Create account**.
2. **La primera persona que se registra se convierte automáticamente en manager (admin) activo.** Hazlo tú antes de compartir el enlace.
3. Verás el enlace **Team** arriba a la derecha: es el panel del manager.

## Paso 7 — Invitar al equipo

1. Comparte el enlace con el equipo (WhatsApp o el grupo del equipo).
2. Cada persona crea su cuenta con su nombre, rol, local, email y contraseña.
3. En **Team → Awaiting approval** pulsa **Approve**. Solo entonces podrán ver el contenido.
4. Puedes dar acceso de manager a otra persona (por ejemplo, un Director) desde su ficha → *Give manager access*.

---

## Uso diario

**Ver quién ha terminado:** en **Team** filtra por *Not signed* para ver a quién le falta. Pulsa **Export CSV** para guardar el registro.

**Ver una firma:** pulsa en el nombre de la persona. Su acknowledgement firmado aparece abajo y se puede imprimir o guardar como PDF.

**Alguien olvidó su contraseña:** abre `supabase/reset-password.sql`, cambia el email y la contraseña temporal, y ejecútalo en el SQL Editor. Conserva todo su progreso.

**Alguien deja la empresa:** en su ficha, *Deactivate access*. Su historial y su firma se conservan.

## Onboarding de una persona nueva

Cada persona ve **"Your onboarding"** con estos pasos:

1. **Documentos.** Abre cada documento oficial y confirma que lo leyó. El portal muestra los que corresponden a su tipo de contrato: a los casuales les añade el *Casual Employment Information Statement* y a los de plazo fijo el *Fixed Term Contract Information Statement*.
2. **Inducción de seguridad.** 2 módulos con quiz.
3. **Code of Conduct.** 13 módulos con quiz y la firma al final.
4. **Su rol.** Módulos específicos por rol, cuando los añadas.
5. **Checklist de la primera semana.** La persona marca cada tarea y **tú la confirmas** desde su ficha.
6. **Camiseta oficial.** Indica su talla y tú marcas cuándo se la entregaste.

En **Team** ves el % de onboarding de cada persona, las tareas pendientes de confirmar y las camisetas por entregar. Al pulsar en una persona puedes:

- Confirmar tareas de la checklist.
- Cambiar el tipo de contrato y la talla.
- Marcar la camiseta como entregada.
- Ver sus módulos y su firma.

⚠️ **Casuales:** la ley pide volver a darles el *Casual Employment Information Statement* pasados 12 meses (pequeña empresa). El portal registra la primera entrega; la renovación anual todavía corre por tu cuenta.

## Cambiar el contenido del Code

1. Edita `private/content.mjs`: textos, preguntas y respuestas (`correct` es la posición de la respuesta correcta, empezando en 0).
2. En una terminal, dentro de `staff-portal`:
   ```
   node private/build-seed.mjs
   ```
3. Copia el nuevo `private/seed_content.sql` en el SQL Editor de Supabase y pulsa **Run**. El progreso de la gente se conserva.
4. Si el cambio es importante y todos deben volver a leer y firmar: **Team → Publish a new Code version** (por ejemplo `1.1`). Esto solo reinicia el Code; la inducción de seguridad, los documentos y la checklist se conservan.

**Inducción de seguridad, checklist y documentos:** se editan en `private/onboarding.mjs` y se publican igual, con `node private/build-seed.mjs` y ejecutando el SQL. ⚠️ La inducción de seguridad es una guía general para una barbería en Queensland. Revísala y añade lo propio de cada local, como el punto de reunión o quién es el responsable de primeros auxilios.

**Módulos por rol:** añade en `private/content.mjs` (o en `onboarding.mjs`) un módulo con `track: "role"` y `roles: ["Receptionist"]` (o el rol que corresponda). Solo lo verán las personas de ese rol.

## Cosas a tener en cuenta

- **Pausa del plan gratuito:** Supabase pausa los proyectos gratuitos tras unos 7 días sin actividad. El archivo `.github/workflows/keepalive.yml` hace una pequeña consulta cada 3 días para evitarlo. Si aun así se pausa, entra en Supabase y pulsa *Restore project*.
- **Probar sin Supabase:** en tu ordenador puedes abrir la demo con `?demo` al final de la dirección local. Usa el contenido de `private/` y no guarda nada online. La demo **no funciona** en GitHub Pages, porque allí no está `private/`.
- **Los textos están en inglés**, igual que el PDF original.
