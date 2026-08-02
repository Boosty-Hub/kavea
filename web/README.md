# kavea

Sitio público de **Kavea** — [kavea.ai](https://kavea.ai).

Landing y documentos legales. La aplicación de producto vive en otro repositorio.

## Por qué está hecho así

Este sitio tiene un requisito duro que manda sobre todo lo demás: **el rastreador de
Meta tiene que poder leer `/privacidad` y `/eliminacion-de-datos` y recibir un 200.**
Un enlace que no responde es causa documentada de rechazo del App Review, sin más
explicación. De ahí salen las tres decisiones de fondo:

- **HTML estático, sin SSR ni middleware.** Nada que pueda devolver un 5xx o un
  challenge a un rastreador.
- **Cero JavaScript en cliente.** Ni analítica, ni cookies, ni banner de consentimiento.
  La página se lee entera con JS desactivado.
- **Sin protección de bots.** No se activa ningún challenge de Netlify sobre este sitio.

Las fuentes van self-hosted vía `@fontsource-variable/instrument-sans`, sin llamadas a
Google Fonts. Es coherente con lo que la política de privacidad declara.

## Stack

| Pieza | Elección |
|---|---|
| Framework | Astro (salida estática) |
| Tipografía | Instrument Sans Variable, self-hosted |
| Alojamiento | Netlify |
| Dependencias en cliente | ninguna |

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # genera dist/
npm run preview  # sirve dist/
```

## Estructura

```
public/            Assets servidos tal cual: favicon, og, robots, sitemap, _redirects
src/
  components/      Logo, Cavea (pieza narrativa animada), Header, Footer
  data/legal.ts    Fuente única de los datos societarios y de contacto
  layouts/         Base (head + chrome) y Legal (documentos con índice)
  pages/           index, privacidad, terminos, eliminacion-de-datos, 404
  styles/global.css  Tokens del libro de marca v0.1
```

### `src/data/legal.ts`

Todos los datos societarios y de contacto salen de este archivo. Cambiar la razón
social, el domicilio o un correo es tocar un archivo, no cuatro documentos.

> ⚠ Los campos marcados con `porConfirmar` en ese archivo llevan un valor provisional.
> Hay que confirmarlos antes de enviar la app a App Review: Meta contrasta los datos
> societarios publicados con los del portafolio de negocio verificado.

## Rutas

| Ruta | Contenido |
|---|---|
| `/` | Landing |
| `/privacidad` | Política de privacidad |
| `/terminos` | Términos del servicio |
| `/eliminacion-de-datos` | Instrucciones de eliminación de datos |

Los alias en inglés (`/privacy`, `/terms`, `/data-deletion`) redirigen con 301 a las
rutas en español. Son los que conviene poner en los campos de configuración de la app
de Meta.

## Identidad

Los tokens de color, la escala tipográfica y las reglas de uso vienen del libro de
identidad de marca v0.1. Lo que no se toca:

- Solo dos pesos tipográficos: 400 y 500. Nunca 600 ni 700.
- El wordmark siempre en minúsculas.
- Sentence case en toda la interfaz. Nunca Title Case.
- Terracota nunca es fondo de área grande: vive en acentos.
- Un único elemento terracota por vista.
- Sin signos de exclamación.

Única desviación deliberada y anotada: el `h1` escala hasta 44 px en pantallas grandes,
por encima de los 40 px que fija la escala de interfaz. Está marcado en `global.css`.

## Despliegue

Netlify construye con `npm run build` y publica `dist/`. La configuración está en
`netlify.toml`, incluidas las cabeceras de seguridad.

---

Kavea es un producto de **Boosty Digital LLC**.
