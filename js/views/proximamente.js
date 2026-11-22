// Pantallas pendientes (fase 2).

function soon(kanji, titulo, texto) {
  return {
    mount(el) {
      el.innerHTML = `
        <section class="soon">
          <div class="kanji jp" lang="ja">${kanji}</div>
          <h2>${titulo}: próximamente</h2>
          <p>${texto}</p>
        </section>`;
    },
  };
}

export const mapa = soon('地図', 'Mapa', 'Aquí irán los lugares del viaje y cómo llegar a cada alojamiento.');
export const traducir = soon('翻訳', 'Traducir', 'Aquí podréis traducir textos y carteles entre español y japonés.');
