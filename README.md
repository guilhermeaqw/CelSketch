# CelSketch

**CelSketch** é um aplicativo desktop open-source de **animação 2D e desenho digital** para **Windows** (e Linux).

---

## Download Rápido (Windows)

> **[Baixar Instalador — CelSketch Setup 1.1.0.exe (Recomendado)](https://github.com/guilhermeaqw/CelSketch/releases/download/v1.1.0/CelSketch.Setup.1.1.0.exe)**

| Versão | Arquivo | Descrição |
| :--- | :--- | :--- |
| **Instalador Windows (Recomendado)** | [CelSketch.Setup.1.1.0.exe](https://github.com/guilhermeaqw/CelSketch/releases/download/v1.1.0/CelSketch.Setup.1.1.0.exe) | Instala com assistente, cria atalho na Área de Trabalho/Menu Iniciar e associa arquivos `.celsketch`. |
| **Windows Portátil (Sem instalação)** | [CelSketch.1.1.0.exe](https://github.com/guilhermeaqw/CelSketch/releases/download/v1.1.0/CelSketch.1.1.0.exe) | Basta clicar duas vezes para abrir, sem instalar nada. |
| **Todas as Versões / Histórico** | [GitHub Releases](https://github.com/guilhermeaqw/CelSketch/releases/latest) | Página oficial de lançamentos. |

### Como instalar
1. Clique em **[CelSketch.Setup.1.1.0.exe](https://github.com/guilhermeaqw/CelSketch/releases/download/v1.1.0/CelSketch.Setup.1.1.0.exe)** para baixar.
2. Execute o instalador e siga os passos na tela *(se o Windows SmartScreen exibir um aviso por ser um app open-source sem certificado pago, clique em **Mais informações → Executar assim mesmo**)*.
3. Abra o **CelSketch** pelo atalho criado na Área de Trabalho ou Menu Iniciar.

---

## Principais Recursos (v1.1.0)

- **Motor de Desenho & Pincéis**: Sensibilidade de pressão para mesas digitalizadoras, traços suaves com largura variável, **Stabilizer** em tempo real e galeria visual com categorias **Padrão** e **Borrar** (incluindo desfoque suave e smudge reais por pixel) + recorte por **Clipping Mask** ao vivo.
- **Câmera 2D Profissional + 7 Efeitos Prontos**:
  - Keyframes de **Zoom, Pan e Rotação** na Timeline com 5 curvas de easing, trilha de movimento (*Motion Path*) no canvas, alças diretas e modo *Camera View* com passepartout.
  - 7 efeitos não-destrutivos empilháveis com barras de duração na timeline: **Impact Shake**, **Wind Sway**, **Handheld**, **Earthquake**, **Punch Zoom**, **Heartbeat** e **Float Drift**.
- **Pós-Produção Estilo Anime**: **Bloom / Glow**, **Aberração Cromática**, **Motion Blur de Câmera**, **Vinheta** e **Granulação de Filme** com 4 presets prontos — visível ao vivo no canvas e aplicado em todos os exports.
- **Desfoque por Camada / Frame / Seleção (`Ctrl+Shift+B`)**: **Desfoque de Movimento Direcional** com bússola 360° e direção de rastro (*Ambos / Frente / Trás*), **Desfoque Gaussiano** e **Desfoque Radial** (*Zoom / Giro*).
- **Seleções Booleanas & Pintura**: Laço Livre (`Q`), Laço Poligonal (`Shift+Q`) e Selecionar Tudo (`Ctrl+A`), com **`Shift` para adicionar** e **`Alt` para remover** áreas, recorte automático de pincel/borracha/formas dentro da seleção, ferramenta **Degradê** (Linear/Radial), **Níveis / Brilho & Contraste** (`Ctrl+L`) e **Matiz / Saturação / Luminosidade** (`Ctrl+U`).
- **Timeline de Animação**: Múltiplas camadas com Opacidade, Modos de Mesclagem, **Hold Exposure**, Onion Skinning, Light Table, faixa de reprodução `In`/`Out`, áudio sincronizado, `ArrowLeft`/`ArrowRight` e `Shift+Space`.
- **Projeto Nativo & Exportação**: Arquivos `.celsketch` (`Ctrl+S` / `Ctrl+Shift+S`), importação PSD e exportação unificada para **Vídeo MP4**, **GIF Animado**, **Sequência PNG** e **Frame PNG**.

---

## Desenvolvimento & Build

```bash
npm install
npm run dev        # Rodar em modo desenvolvimento
npm run dist:win   # Gerar Instalador (Setup.exe) e Portátil (.exe) para Windows
npx electron-builder --linux  # Gerar AppImage e .deb para Linux
```
