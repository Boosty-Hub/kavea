export default function NoEncontrado() {
  return (
    <main className="pagina" style={{ maxWidth: 480 }}>
      <p className="label">Error 404</p>
      <h1 style={{ marginBlock: '12px 16px' }}>Esta dirección no existe</h1>
      <p className="muted">
        El enlace está roto, la organización no existe o no tienes acceso a ella.
      </p>
    </main>
  )
}
