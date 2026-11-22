import { useState } from 'react'
import type { FolderNode } from '../domain/files.ts'

// Cor do ícone por família de arquivo, só para bater o olho.
function tint(ext: string) {
  if (/^PDF$/.test(ext)) return '#c4524f'
  if (/^(DOCX?|ODT|RTF|TXT|MD)$/.test(ext)) return '#3f6fb5'
  if (/^(XLSX?|ODS|CSV)$/.test(ext)) return '#2f8a5b'
  if (/^(PPTX?|ODP)$/.test(ext)) return '#d0743c'
  if (/^(PNG|JPE?G|GIF|BMP|WEBP|SVG|TIFF?|ICO|HEIC)$/.test(ext)) return '#8a5cc2'
  if (/^(ZIP|RAR|7Z|TAR|GZ)$/.test(ext)) return '#b8932c'
  if (/^(MP3|WAV|OGG|FLAC|AAC|M4A|MP4|AVI|MOV|MKV|WEBM)$/.test(ext)) return '#2f8f8f'
  return '#7a706c'
}

function FolderIcon({ open }: { open?: boolean }) {
  return (
    <svg className="fv-folder" viewBox="0 0 24 24" aria-hidden="true">
      <path d={open ? 'M3 7.5h6l2 2h9v8.5a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3 18z' : 'M3 6.5h6l2 2h8.5A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z'} />
    </svg>
  )
}

function count(node: FolderNode): number {
  return node.files.reduce((sum, file) => sum + file.count, 0) + node.dirs.reduce((sum, dir) => sum + count(dir), 0)
}

// Prévia de Arquivos como uma janela de explorador: pastas à esquerda, arquivos da pasta escolhida à direita.
export function FolderView({ tree, rootLabel }: { tree: FolderNode; rootLabel: string }) {
  // Sem clique ainda, abre a primeira pasta que tem arquivos, para a prévia já mostrar o que vai sair.
  const [picked, setCurrent] = useState<string | null>(null)
  const firstWithFiles = (node: FolderNode): FolderNode | null => node.files.length ? node : node.dirs.map(firstWithFiles).find(Boolean) ?? null
  const find = (node: FolderNode, path: string): FolderNode | null => node.path === path ? node : node.dirs.map((dir) => find(dir, path)).find(Boolean) ?? null
  const shown = (picked !== null ? find(tree, picked) : null) ?? firstWithFiles(tree) ?? tree
  const crumbs = [rootLabel, ...shown.path.split('/').filter(Boolean)]

  const branch = (node: FolderNode, depth: number) => node.dirs.map((dir) => (
    <li key={dir.path}>
      <button type="button" className="fv-node" aria-current={dir.path === shown.path ? 'true' : undefined} style={{ paddingLeft: 10 + depth * 16 }} onClick={() => setCurrent(dir.path)}>
        <FolderIcon open={dir.path === shown.path} />
        <span>{dir.name}</span>
        <small>{count(dir)}</small>
      </button>
      {dir.dirs.length ? <ul>{branch(dir, depth + 1)}</ul> : null}
    </li>
  ))

  return (
    <div className="fv" role="group" aria-label="Visualizador das pastas do lote">
      <div className="fv-bar">
        <span className="fv-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="fv-path">{crumbs.join('  ›  ')}</span>
      </div>
      <div className="fv-body">
        <nav className="fv-side" aria-label="Pastas">
          <ul>
            <li>
              <button type="button" className="fv-node" aria-current={shown.path === '' ? 'true' : undefined} onClick={() => setCurrent('')}>
                <FolderIcon open={shown.path === ''} />
                <span>{rootLabel}</span>
                <small>{count(tree)}</small>
              </button>
              {tree.dirs.length ? <ul>{branch(tree, 1)}</ul> : null}
            </li>
          </ul>
        </nav>
        <div className="fv-main">
          <div className="fv-head" aria-hidden="true"><span>Nome</span><span>Tipo</span><span>Qtd.</span></div>
          <ul className="fv-list">
            {shown.dirs.map((dir) => (
              <li key={dir.path}>
                <button type="button" className="fv-row" onClick={() => setCurrent(dir.path)}>
                  <span className="fv-name"><FolderIcon /><span>{dir.name}</span></span>
                  <span>Pasta</span>
                  <span>{count(dir)}</span>
                </button>
              </li>
            ))}
            {shown.files.map((file) => (
              <li key={`${file.name}.${file.ext}`} className="fv-row">
                <span className="fv-name">
                  <span className="fv-file" style={{ background: tint(file.ext) }} aria-hidden="true">{file.ext.slice(0, 4)}</span>
                  <span>{file.name}</span>
                </span>
                <span>{file.ext}</span>
                <span>{file.count}</span>
              </li>
            ))}
            {!shown.dirs.length && !shown.files.length ? <li className="fv-empty">Pasta vazia</li> : null}
          </ul>
        </div>
      </div>
    </div>
  )
}
