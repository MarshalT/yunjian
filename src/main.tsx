import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
// @uiw/react-md-editor 编辑器样式（必须在 index.css 之后导入）
import '@uiw/react-md-editor/markdown-editor.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
