# Kavea

Centro de operaciones conversacionales multi-tenant. Unifica Instagram Direct, Facebook
Messenger y WhatsApp en una sola bandeja y opera sobre las conversaciones con agentes que
clasifican, responden y escalan.

Producto de **Boosty Digital LLC**. Dominio: [kavea.ai](https://kavea.ai).

## Estructura

```
docs/     Documentos fundacionales, invariantes y plan por fases
brand/    Identidad visual y assets de marca
web/      Sitio público (Astro estático → Netlify)
app/      Aplicación multi-tenant (Next.js → Vercel)      · pendiente, fase 0
supabase/ Migraciones y edge functions                     · pendiente, fase 0
```

## Documentos

Se leen en orden. El 03 es normativo: ninguna implementación puede contradecirlo.

| Documento | Qué fija |
|---|---|
| `docs/00-documento-base.md` | Qué es Kavea, alcance de v1, riesgos y fases |
| `docs/01-identidad-de-marca.md` | Color, tipografía, voz. Normativo para todo lo visual |
| `docs/02-conexion-instagram-facebook.md` | Investigación de la conexión con Meta |
| `docs/03-invariantes-meta.md` | **Normativo.** Lo que ninguna implementación puede contradecir |
| `docs/04-configuracion-app-meta.md` | Configuración de la app de Meta |
| `docs/05-checklist-tech-provider.md` | Estado del trámite de Access Verification |
| `docs/06-arquitectura-plataforma.md` | Arquitectura cerrada: superficies, esquema, RLS |
| `docs/fases/` | Plan detallado de cada fase de construcción |

## Superficies

| Superficie | Dominio | Despliegue |
|---|---|---|
| Sitio público | `kavea.ai` | Netlify, desde `web/` |
| App de cliente | `*.kavea.ai` | Vercel, desde `app/` |
| Panel interno | `admin.kavea.ai` | Vercel, misma base de código |
| Receptor de eventos | Supabase Edge Function | Supabase |

El subdominio es enrutado, no aislamiento. La frontera de seguridad es RLS más el token
de sesión: si alguien falsifica la cabecera `Host`, Postgres lo bloquea igual.

## Desarrollo

```bash
# Sitio público
cd web && npm install && npm run dev
```

## Reglas que no se rompen

- **Ningún secreto entra al repositorio.** Claves de Supabase, Resend, Meta y Claude van
  en variables de entorno del proveedor.
- **RLS activo en toda tabla de negocio**, con `force row level security`.
- **El receptor de webhooks no hace trabajo**: valida firma, encola, devuelve 200 en
  menos de 5 segundos. Meta desuscribe una Página tras una hora de fallos, en silencio.
- **La media entrante de Meta no se almacena**, solo su URL. Es causa documentada de
  rechazo del App Review.
- **Dogfooding primero**: ningún cliente entra antes de que Boosty lleve un mes operando.
