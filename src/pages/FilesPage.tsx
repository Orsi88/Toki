import { useMemo, useState } from 'react'
import { FAM, FILE_DEF, FILE_FIELDS, fmtBytes } from '../domain/mfEngine.ts'
import { FILE_BYTE_LIMIT, FILE_COUNT_LIMIT, FILE_TOTAL_LIMIT, generateFiles, validateFileRequest, zipArtifacts, folderPreview, sanitizeFolder, type FileRequest, type FolderMode } from '../domain/files.ts'
import { downloadBlob, downloadNotice, type Notice } from '../ui/browser.ts'
import { FieldList, type EngineField } from '../ui/Fields.tsx'
import { ClearButton } from '../ui/ClearButton.tsx'
import { SearchField } from '../ui/SearchField.tsx'

export function FilesPage({
  extension,
  onToast,
}: {
  extension?: string
  onToast: (message: string | Notice, bad?: boolean) => void
}) {
  const [selected, setSelected] = useState<string[]>(extension ? [extension.toUpperCase()] : ['PDF'])
  const [filter, setFilter] = useState('')
  const [config, setConfig] = useState<Record<string, unknown>>({ ...FILE_DEF, sel: extension ? [extension.toUpperCase()] : ['PDF'] })
  const [folderMode, setFolderMode] = useState<FolderMode>('familia')
  const [folderName, setFolderName] = useState('arquivos_teste')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [summary, setSummary] = useState('')
  const request = useMemo<FileRequest>(() => ({
    sel: selected,
    nome: String(config.nome || 'arquivo_teste'),
    nomeVar: String(config.nomeVar || 'Simples'),
    vazio: Boolean(config.vazio),
    tam: Number(config.tam ?? 1),
    unid: String(config.unid || 'MB'),
    conteudo: String(config.conteudo || 'Estrutura real'),
    real: String(config.real || 'PNG'),
    qtd: Number(config.qtd ?? 1),
    folderMode,
    folderName,
    audioDur: Number(config.audioDur ?? 2),
    audioKind: String(config.audioKind || 'Tom de teste'),
    audioChannels: Number(config.audioChannels ?? 1),
    audioRate: Number(config.audioRate ?? 44100),
    videoDur: Number(config.videoDur ?? 2),
    videoRes: String(config.videoRes || '320×180'),
    videoOrient: String(config.videoOrient || 'Horizontal'),
    videoFps: Number(config.videoFps ?? 8),
    videoAudio: Boolean(config.videoAudio),
    imgFundo: String(config.imgFundo || 'Opaco'),
    imgGif: String(config.imgGif || 'Estático'),
    imgQuadros: Number(config.imgQuadros ?? 4),
    imgFrameMs: Number(config.imgFrameMs ?? 200),
    imgProp: String(config.imgProp || 'Horizontal'),
    imgQual: Number(config.imgQual ?? 80),
    imgExif: String(config.imgExif || 'Sem EXIF'),
  }), [config, folderMode, folderName, selected])
  const error = validateFileRequest(request)
  const folded = filter.trim().toLocaleLowerCase('pt-BR').replace(/^\./, '')

  async function generate() {
    setBusy(true)
    try {
      const count = (value: number) => value.toLocaleString('pt-BR')
      const produced = await generateFiles(request, Math.floor(Math.random() * 1_000_000_000), (done, total) => setProgress(`Gerando ${count(done)} de ${count(total)}...`))
      const zip = await zipArtifacts(produced, (percent) => setProgress(`Compactando ${percent}%...`))
      downloadBlob(`${sanitizeFolder(folderName)}.zip`, zip)
      const total = produced.reduce((sum, file) => sum + file.sizeBytes, 0)
      const byExtension = new Map<string, number>()
      for (const file of produced) byExtension.set(file.extension, (byExtension.get(file.extension) ?? 0) + file.sizeBytes)
      const detail = [...byExtension].map(([ext, bytes]) => `${ext} ${bytes} B`).join(' · ')
      setSummary(`${produced.length} arquivos · ${fmtBytes(total)}. ${detail}.`)
      onToast(downloadNotice())
    } catch (caught) {
      onToast(caught instanceof Error ? caught.message : 'Falha ao gerar arquivos.', true)
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  const preview = folderPreview(selected, request)
  const fieldConfig = {
    ...config,
    _audio: selected.includes('WAV'),
    _mp3: selected.includes('MP3'),
    _video: selected.includes('AVI'),
    _mp4: selected.includes('MP4'),
    _png: selected.includes('PNG'),
    _gif: selected.includes('GIF'),
    _jpg: selected.includes('JPG') || selected.includes('JPEG'),
  }

  function reset() {
    const base = extension ? [extension.toUpperCase()] : ['PDF']
    setSelected(base)
    setFilter('')
    setConfig({ ...FILE_DEF, sel: base })
    setFolderMode('familia')
    setFolderName('arquivos_teste')
    setSummary('')
    onToast('Configurações e prévia limpas.')
  }

  return (
    <div className="work">
      <ClearButton disabled={busy} onClick={reset} />
      <section className="step">
        <header className="step-title">
          <b>1</b>
          <h2>Selecione os tipos de extensão</h2>
        </header>
        <SearchField
          aria-label="Filtrar extensão"
          placeholder="Filtrar extensão"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <div className="group-grid">
          {FAM.map((family: { n: string; exts: string[] }) => {
            const exts = family.exts.filter((ext) => !folded || ext.toLocaleLowerCase('pt-BR').includes(folded))
            if (!exts.length) return null
            return (
              <div key={family.n}>
                <h3>{family.n}</h3>
                <div className="chips">
                  {exts.map((ext) => (
                    <button
                      key={ext}
                      type="button"
                      aria-pressed={selected.includes(ext)}
                      onClick={() => setSelected((current) => current.includes(ext) ? current.filter((item) => item !== ext) : [...current, ext])}
                    >
                      {ext}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>
      <section className="step">
        <header className="step-title">
          <b>2</b>
          <h2>Defina as configurações e propriedades dos arquivos</h2>
        </header>
        <FieldList
          fields={FILE_FIELDS as EngineField[]}
          config={fieldConfig}
          onChange={(name, value) => setConfig((current) => ({ ...current, [name]: value }))}
        />
      </section>
      <section className="step">
        <header className="step-title">
          <b>3</b>
          <h2>Defina e configure a estrutura e organização das pastas</h2>
        </header>
        <div className="fields">
          <label className="field">
            <span>Organização</span>
            <select value={folderMode} onChange={(event) => setFolderMode(event.target.value as FolderMode)}>
              <option value="raiz">Todos na raiz</option>
              <option value="unica">Uma pasta para todos</option>
              <option value="familia">Uma pasta por família</option>
              <option value="extensao">Uma pasta por extensão</option>
            </select>
          </label>
          {folderMode !== 'raiz' ? (
            <label className="field">
              <span>Pasta raiz</span>
              <input value={folderName} onChange={(event) => setFolderName(event.target.value)} />
            </label>
          ) : null}
        </div>
        <pre className="tree">{preview}</pre>
        {error ? <p className="banner bad">{error}</p> : null}
        <button id="mf-generate" className="primary" type="button" disabled={Boolean(error) || busy} onClick={generate}>
          {busy ? progress || 'Gerando...' : 'Gerar arquivos'}
        </button>
        <p className="muted file-limits">
          Até {FILE_COUNT_LIMIT.toLocaleString('pt-BR')} arquivos e {fmtBytes(FILE_TOTAL_LIMIT)} por lote, com no máximo {fmtBytes(FILE_BYTE_LIMIT)} por arquivo.
          Tudo é gerado no seu navegador, então lotes grandes usam bastante memória e podem levar alguns minutos.
        </p>
        {summary ? <p className="file-summary">{summary}</p> : null}
      </section>
    </div>
  )
}
