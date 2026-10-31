import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Texto do assistente com Markdown (listas, código, tabelas). Links abrem no navegador. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
