"use client";

/**
 * Último recurso: erro que derruba até o layout raiz. Precisa trazer o próprio <html> e <body> e
 * não pode depender de CSS nem de componentes do sistema (podem ser justamente o que quebrou),
 * por isso o estilo é todo em linha.
 */
export default function ErroGlobal({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          background: "#f7f6f2",
          color: "#10241b",
        }}
      >
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>O sistema está indisponível por um instante</h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, margin: "0 0 12px" }}>
            Ocorreu um erro inesperado. Tente de novo em instantes. Se continuar, avise a equipe da Central de Atas
            informando o código abaixo.
          </p>
          {error.digest && (
            <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 16px" }}>Código do erro: {error.digest}</p>
          )}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              fontSize: 15,
              padding: "10px 20px",
              border: 0,
              borderRadius: 10,
              background: "#0d6b55",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
