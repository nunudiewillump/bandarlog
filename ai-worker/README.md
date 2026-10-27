# Generador de ilustraciones de Bandarlog

Proceso Python separado del servicio web, sin API de generación de pago. Un agente semántico usa el codificador CLIP del modelo para elegir un plan gráfico y un renderizador de pictogramas lo dibuja en el estilo de líneas de Bandarlog. La mascota se genera por difusión a partir de su referencia. Modelo `segmind/tiny-sd`, revisión fijada `cad0bd7495fa6c4bcca01b19a723dc91627fe84f`, licencia CreativeML OpenRAIL-M; la licencia del modelo y sus restricciones siguen vigentes. `rembg`/u2netp produce el recorte transparente. Los pesos descargados se convierten con `torch.load(weights_only=True)` a Safetensors antes de cargarse; no se ejecuta código remoto del repositorio del modelo. Se conservan TLS y las comprobaciones de descarga.

Se ha probado realmente en CPU: icono y mascota se generaron, la API rechazó peticiones sin clave y Bandarlog guardó las dos imágenes con estado `ready`. La última muestra con pictograma de líneas y mascota de referencia tardó aproximadamente 40 segundos en CPU; el tiempo depende del equipo y de la primera descarga de pesos. La generación con un modelo CPU pequeño varía en calidad y detalle; la mascota utiliza la imagen original como referencia para mantener la identidad. No es un modelo 3D interactivo: produce ilustraciones estáticas. El trabajador solo recibe nombre y descripción de comisión, los convierte en una categoría gráfica y utiliza prompts predefinidos; no recibe personas, tareas ni fotos de perfil.

## Equipo virtual gratuito para pruebas

Abre `notebooks/Bandarlog_IA_gratis.ipynb` en [Google Colab](https://colab.research.google.com/). Después de incorporar esta PR a main, el cuaderno clona el repositorio, instala las dependencias en un entorno aislado, solicita una clave privada sin mostrarla y abre un túnel HTTPS temporal. La descarga del túnel comprueba el SHA-256 oficial.

Colab tiene recursos y duración limitados; no es un alojamiento permanente. No se requiere Colab Pro ni GPU para esta implementación. No dejes claves en el cuaderno ni guardes salidas que las contengan. Al desconectarse Colab, las imágenes ya guardadas en Neon permanecen, pero las nuevas generaciones necesitarán reabrir la sesión. El cuaderno está preparado y sus celdas se han comprobado sintácticamente; esta conversación no ha iniciado una sesión dentro de tu cuenta de Colab.

## Equipo propio

Python 3.12, CPU y al menos 8 GB de RAM recomendados. Los pesos ocupan varios GB y se descargan la primera vez. Desde la raíz del repositorio:

```sh
python3 -m venv .data/ai-venv
.data/ai-venv/bin/pip install -r ai-worker/requirements.txt
# Define ARTWORK_WORKER_TOKEN de forma privada, sin incluirlo en Git ni en el chat.
HF_HOME="$PWD/.data/ai-models" U2NET_HOME="$PWD/.data/ai-models/u2net" \
  .data/ai-venv/bin/uvicorn app:app --app-dir ai-worker --host 127.0.0.1 --port 7860 --no-access-log
```

Para conectar Railway a un equipo externo se necesita una dirección HTTPS accesible. Guarda `ARTWORK_WORKER_URL` y `ARTWORK_WORKER_TOKEN` como variables privadas del servicio web. La clave debe coincidir con la del trabajador. Nunca expongas `/generate` sin autenticación.

Al crear una comisión, se guarda primero y se encola la generación. La interfaz muestra una banana durante la espera. Las imágenes se normalizan y guardan en PostgreSQL para sobrevivir a reinicios. Los fallos mantienen los recursos anteriores y permiten reintentar. Si no hay trabajador configurado, la comisión sigue funcionando con los recursos de respaldo; no se presenta una imagen de respaldo como generada por IA.

## Hugging Face Spaces (alternativa si ya tienes PRO)

Según la [documentación actual de Spaces](https://huggingface.co/docs/hub/spaces-overview), CPU Basic no tiene coste por hora, pero crear un Space Docker requiere PRO/Team/Enterprise. No se considera una solución totalmente gratuita para quien no tiene ese plan. No se ha contratado ni activado un servicio allí.

`npm run ai:package` prepara `.data/ai-space` con el Dockerfile, dependencias, API y mascota. Si ya tienes el plan, sube esos archivos a un Space Docker CPU Basic y configura `ARTWORK_WORKER_TOKEN` como secreto del Space. `SPACE.md` contiene sus metadatos. El contenedor está preparado; no se ha desplegado en una cuenta externa.

## Pruebas automáticas gratuitas

El repositorio es público. `.github/workflows/checks.yml` usa ejecutores estándar de GitHub Actions para instalar, compilar y ejecutar pruebas, incluidas las de navegador, sin credenciales de Neon ni Gmail. Las capturas se retienen siete días. La IA pesada no se ejecuta en cada PR: sus pruebas normales validan imágenes y protocolo sin contratar proveedores. No se usan ejecutores grandes de pago.
