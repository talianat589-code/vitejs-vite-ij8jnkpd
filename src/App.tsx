
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import "./index.css";
import HandCamera from "./components/HandCamera";

type Landmark = {
  x: number;
  y: number;
  z: number;
};

type FrameData = {
  timestamp: number;
  hands: Landmark[][];
};

type SignSample = {
  id: string;
  label: string;
  createdAt: string;
  frames: FrameData[];
};

function App() {
  const [modo, setModo] = useState<"senas" | "voz">("senas");

  const [etiqueta, setEtiqueta] = useState("");
  const [grabando, setGrabando] = useState(false);
  const [muestras, setMuestras] = useState<SignSample[]>([]);
  const [estado, setEstado] = useState(
    "Escribe el nombre de una seña para comenzar."
  );
  const [datosCargados, setDatosCargados] = useState(false);

  // EFECTO 1: Recuperar las muestras guardadas al abrir la aplicación
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(
        "lsc-conecta-muestras"
      );

      if (guardado) {
        const datos = JSON.parse(guardado);

        if (Array.isArray(datos)) {
          setMuestras(datos);
          setEstado(
            `Se recuperaron ${datos.length} muestras guardadas.`
          );
        }
      }
    } catch (error) {
      console.error("Error al recuperar las muestras:", error);
      setEstado("No se pudieron recuperar los datos guardados.");
    } finally {
      setDatosCargados(true);
    }
  }, []);

  // EFECTO 2: Guardar automáticamente cuando cambien las muestras
  useEffect(() => {
    if (!datosCargados) return;

    try {
      localStorage.setItem(
        "lsc-conecta-muestras",
        JSON.stringify(muestras)
      );
    } catch (error) {
      console.error("Error al guardar las muestras:", error);
      setEstado(
        "No se pudieron guardar todos los datos. Descarga una copia JSON."
      );
    }
  }, [muestras, datosCargados]);
  const grabandoRef = useRef(false);
  const framesRef = useRef<FrameData[]>([]);
  const etiquetaRef = useRef("");
  const timerRef = useRef<number | null>(null);

  // Recibir los puntos de referencia de la cámara
  const procesarManos = useCallback((hands: Landmark[][]) => {
    if (!grabandoRef.current || hands.length === 0) {
      return;
    }

    framesRef.current.push({
      timestamp: Math.round(performance.now()),
      hands: hands.map((hand) =>
        hand.map((point) => ({
          x: point.x,
          y: point.y,
          z: point.z,
        }))
      ),
    });
  }, []);

  // Finalizar y guardar una grabación
  const finalizarGrabacion = useCallback(() => {
    if (!grabandoRef.current) return;

    grabandoRef.current = false;
    setGrabando(false);

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const frames = [...framesRef.current];
    const nombre = etiquetaRef.current;

    if (frames.length < 5) {
      setEstado(
        "Se capturaron muy pocos fotogramas. Intenta grabar nuevamente."
      );
      return;
    }

    const nuevaMuestra: SignSample = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: nombre,
      createdAt: new Date().toISOString(),
      frames,
    };

    setMuestras((actuales) => [...actuales, nuevaMuestra]);

    setEstado(
      `Muestra guardada: ${nombre}. Fotogramas capturados: ${frames.length}.`
    );
  }, []);

  // Iniciar una grabación de tres segundos
  const iniciarGrabacion = () => {
    const nombre = etiqueta.trim();

    if (!nombre) {
      setEstado("Primero escribe el nombre de la seña.");
      return;
    }

    if (grabandoRef.current) return;

    framesRef.current = [];
    etiquetaRef.current = nombre;

    grabandoRef.current = true;
    setGrabando(true);
    setEstado(`Grabando la seña: ${nombre}. Mantén tus manos visibles.`);

    timerRef.current = window.setTimeout(() => {
      finalizarGrabacion();
    }, 3000);
  };

  // Evitar que quede un temporizador activo al salir
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      grabandoRef.current = false;
    };
  }, []);

  // Descargar las muestras como archivo JSON
  const descargarDatos = () => {
    if (muestras.length === 0) {
      setEstado("Todavía no hay muestras para descargar.");
      return;
    }

    const dataset = {
      project: "LSC Conecta",
      formatVersion: 1,
      description:
        "Muestras de puntos de referencia de manos para investigación y entrenamiento de reconocimiento de señas.",
      totalSamples: muestras.length,
      samples: muestras,
    };

    const contenido = JSON.stringify(dataset, null, 2);

    const archivo = new Blob([contenido], {
      type: "application/json",
    });

    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement("a");

    enlace.href = url;
    enlace.download = "lsc-conecta-dataset.json";

    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

    URL.revokeObjectURL(url);

    setEstado("Archivo de datos descargado correctamente.");
  };

  // Eliminar todas las muestras de la sesión actual
  const limpiarMuestras = () => {
    if (grabandoRef.current) {
      setEstado("Finaliza la grabación antes de limpiar los datos.");
      return;
    }

    setMuestras([]);
    setEstado("Se eliminaron las muestras de esta sesión.");
  };

  // IMPORTAR MUESTRAS DESDE UN ARCHIVO JSON
  const importarDatos = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const archivo = event.target.files?.[0];

    if (!archivo) return;

    try {
      const contenido = await archivo.text();
      const datos = JSON.parse(contenido);

      const muestrasImportadas = Array.isArray(datos)
        ? datos
        : datos.samples;

      if (!Array.isArray(muestrasImportadas)) {
        throw new Error(
          "El archivo no contiene una lista de muestras válida."
        );
      }

      const validas = muestrasImportadas.filter(
        (muestra: any) =>
          typeof muestra.label === "string" &&
          Array.isArray(muestra.frames) &&
          muestra.frames.length > 0
      );

      if (validas.length === 0) {
        throw new Error(
          "No se encontraron muestras válidas en el archivo."
        );
      }

      setMuestras((actuales) => {
        const idsExistentes = new Set(
          actuales.map((muestra) => muestra.id)
        );

        const nuevas = validas.map((muestra: any) => ({
          ...muestra,
          id:
            muestra.id && !idsExistentes.has(muestra.id)
              ? muestra.id
              : `${Date.now()}-${Math.random()
                  .toString(36)
                  .slice(2, 9)}`,
          createdAt:
            muestra.createdAt || new Date().toISOString(),
        }));

        return [...actuales, ...nuevas];
      });

      setEstado(
        `Se importaron ${validas.length} muestras correctamente.`
      );
    } catch (error) {
      console.error("Error al importar:", error);

      setEstado(
        error instanceof Error
          ? error.message
          : "No se pudo importar el archivo."
      );
    }

    // Permitir seleccionar nuevamente el mismo archivo
    event.target.value = "";
  };

  // ELIMINAR UNA MUESTRA INDIVIDUAL
  const eliminarMuestra = (id: string) => {
    setMuestras((actuales) =>
      actuales.filter((muestra) => muestra.id !== id)
    );

    setEstado("La muestra fue eliminada.");
  };

  return (
    <main className="app">
      <header className="header">
        <div className="logo">
          <span className="logo-icon">🤟</span>
          <div>
            <h1>LSC Conecta</h1>
            <p>La comunicación nos une</p>
          </div>
        </div>

        <span className="status">● Prototipo</span>
      </header>

      <section className="welcome">
        <span className="eyebrow">
          COMUNICACIÓN SIN BARRERAS
        </span>

        <h2>Conectemos a través de la comunicación.</h2>

        <p>
          Una herramienta para acercar a las personas sordas
          y oyentes mediante la Lengua de Señas Colombiana.
        </p>
      </section>

      <section className="selector">
        <button
          className={modo === "senas" ? "tab active" : "tab"}
          onClick={() => setModo("senas")}
        >
          🤟 Señas a voz
        </button>

        <button
          className={modo === "voz" ? "tab active" : "tab"}
          onClick={() => setModo("voz")}
        >
          🎙️ Voz a señas
        </button>
      </section>

      {modo === "senas" ? (
        <section className="panel">
          <div className="panel-heading">
            <h3>Laboratorio de señas</h3>
            <span className="tag">Aprendizaje</span>
          </div>

          <div className="learning-intro">
            <h3>Enseñemos nuevas señas a la aplicación</h3>
            <p>
              Registra ejemplos de movimientos para construir
              nuestro primer conjunto de datos.
            </p>
          </div>

          <label className="field-label" htmlFor="sign-name">
            Nombre de la seña
          </label>

          <input
            id="sign-name"
            className="sign-input"
            type="text"
            value={etiqueta}
            onChange={(event) => setEtiqueta(event.target.value)}
            placeholder="Ejemplo: saludo"
            disabled={grabando}
          />

          <div className="recording-instructions">
            <strong>Instrucciones:</strong>
            <ol>
              <li>Escribe una etiqueta para la seña.</li>
              <li>Coloca tus manos frente a la cámara.</li>
              <li>Pulsa «Grabar muestra».</li>
              <li>Realiza la seña durante tres segundos.</li>
              <li>Repite el proceso para recopilar más ejemplos.</li>
            </ol>
          </div>

          <HandCamera onDetection={procesarManos} />

          <div className="recording-status">
            <span
              className={
                grabando
                  ? "recording-indicator recording"
                  : "recording-indicator"
              }
            />

            <p>{estado}</p>
          </div>

          {!grabando ? (
            <button
              className="primary record-button"
              onClick={iniciarGrabacion}
            >
              ● Grabar muestra (3 segundos)
            </button>
          ) : (
            <button
              className="primary stop-button"
              onClick={finalizarGrabacion}
            >
              Detener y guardar muestra
            </button>
          )}

          <div className="dataset-summary">
            <div>
            <p className="helper-text">
  {datosCargados
    ? "✓ Datos cargados. Las muestras nuevas se guardan automáticamente."
    : "Cargando muestras guardadas..."}
</p>
              <span className="result-label">
                MUESTRAS RECOPILADAS
              </span>
              <p className="dataset-number">{muestras.length}</p>
            </div>

            <div>
              <span className="result-label">
                SEÑAS DIFERENTES
              </span>
              <p className="dataset-number">
                {new Set(muestras.map((sample) => sample.label)).size}
              </p>
            </div>
          </div>

          <div className="import-section">
    <h3>Importar datos anteriores</h3>

    <p className="helper-text">
      Selecciona un archivo JSON de LSC Conecta
      para recuperar las muestras guardadas.
    </p>

    <label className="import-button">
      📂 Seleccionar archivo JSON

      <input
        type="file"
        accept=".json,application/json"
        onChange={importarDatos}
        disabled={grabando || !datosCargados}
      />
    </label>
  </div>


  <div className="sample-list">
  <h3>Mis muestras</h3>

  {muestras.length === 0 ? (
    <p className="helper-text">
      Aún no has guardado muestras.
    </p>
  ) : (
    muestras.map((sample, index) => (
      <div className="sample-item" key={sample.id}>
        <div>
          <strong>
            {index + 1}. {sample.label}
          </strong>

          <p>
            {sample.frames.length} fotogramas
          </p>
        </div>

        <button
          className="delete-sample"
          onClick={() => eliminarMuestra(sample.id)}
          disabled={grabando}
          aria-label={`Eliminar muestra ${sample.label}`}
        >
          🗑️
        </button>
      </div>
    ))
  )}
</div>

          <button
            className="primary download-button"
            onClick={descargarDatos}
            disabled={muestras.length === 0 || grabando}
          >
            Descargar conjunto de datos
          </button>

          <button
            className="secondary-button"
            onClick={limpiarMuestras}
            disabled={muestras.length === 0 || grabando}
          >
            Limpiar muestras
          </button>

          <p className="helper-text">
            Los datos se conservan en la memoria de esta sesión.
            Descarga el archivo JSON antes de cerrar o actualizar
            la página para no perder las muestras.
          </p>
        </section>
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <h3>Habla y traduce</h3>
            <span className="tag">Micrófono</span>
          </div>

          <div className="voice-area">
            <div className="mic-icon">🎙️</div>
            <h3>Comunícate con tu voz</h3>
            <p>
              En una siguiente etapa conectaremos el reconocimiento
              de voz y el diccionario visual de LSC.
            </p>
          </div>

          <textarea
            placeholder="Escribe aquí un mensaje para probar la interfaz..."
          />

          <button
            className="primary"
            onClick={() =>
              alert("Próximamente agregaremos las señas visuales.")
            }
          >
            Ver traducción
          </button>
        </section>
      )}

      <footer>
        <p>LSC Conecta · Proyecto de accesibilidad</p>
        <p>Desarrollado para Colombia 🇨🇴</p>
      </footer>
    </main>
  );
}

export default App;
