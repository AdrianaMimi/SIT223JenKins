import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controlled as CodeMirror } from 'react-codemirror2';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/neo.css';
import 'codemirror/mode/markdown/markdown';
import 'codemirror/addon/display/placeholder';
import 'highlight.js/styles/github.css';

export default function PostQuestionEditor({
    value,
    onChange,
    placeholder = 'Write details here… Use **bold**, _italic_, lists, headings, or the toolbar. Click Preview to see the result.',
}) {
    const editorRef = useRef(null);
    const [tab, setTab] = useState('write'); // write | preview
    const [font, setFont] = useState('');

    // Always give CodeMirror a string (for safety)
    const safeValue = typeof value === 'string' ? value : (value ? String(value) : '');

    // Keep latest value for string transforms
    const valueRef = useRef(safeValue);
    useEffect(() => { valueRef.current = safeValue; }, [safeValue]);

    // ---------- editor callbacks ----------
    const handleBeforeChange = useCallback((_editor, _data, v) => {
        onChange?.(v);
    }, [onChange]);

    const handleEditorDidMount = useCallback((editor) => {
        editorRef.current = editor;
    }, []);

    // ---------- position/selection helpers (string-based) ----------
    const setSelections = (sels) => {
        const ed = editorRef.current;
        if (!ed || !sels) return;
        const doc = ed.getDoc();
        doc.setSelections(sels);
        ed.focus();
    };

    const splitLines = (text) => text.split('\n');
    const posToIndex = (lines, { line, ch }) => {
        let idx = 0;
        for (let i = 0; i < line; i++) idx += (lines[i]?.length ?? 0) + 1;
        return idx + ch;
    };
    const indexToPos = (lines, index) => {
        let idx = 0;
        for (let line = 0; line < lines.length; line++) {
            const len = lines[line]?.length ?? 0;
            if (idx + len >= index) return { line, ch: index - idx };
            idx += len + 1;
        }
        const last = Math.max(0, lines.length - 1);
        return { line: last, ch: (lines[last] || '').length };
    };
    const normalizeSel = (a, b) => {
        if (a.line < b.line) return { from: a, to: b };
        if (a.line > b.line) return { from: b, to: a };
        return a.ch <= b.ch ? { from: a, to: b } : { from: b, to: a };
    };
    const leadingWSLen = (s) => (s.match(/^\s*/) || [''])[0].length;

    // String-based transformation runner
    const runTransform = (transformer, adjustSelection) => {
        const ed = editorRef.current; if (!ed) return;
        const doc = ed.getDoc();
        const sels = doc.listSelections();

        const text = valueRef.current ?? '';
        const lines = splitLines(text);

        const primary = normalizeSel(sels[0].anchor, sels[0].head);
        const fromIdx = posToIndex(lines, primary.from);
        const toIdx = posToIndex(lines, primary.to);

        const { nextText, newSelection } = transformer(text, lines, { fromIdx, toIdx, selPos: primary });
        if (nextText !== text) onChange?.(nextText);

        const nextLines = splitLines(nextText);
        const finalSel = adjustSelection ? adjustSelection(nextLines, newSelection) : newSelection;

        // Restore selection on next tick so CM receives the new value first
        setTimeout(() => {
            setSelections([{
                anchor: indexToPos(nextLines, finalSel.anchor),
                head: indexToPos(nextLines, finalSel.head),
            }]);
        }, 0);
    };

    // ---------- actions (bold/italic/link/blockquote/lists/heading/code) ----------
    const wrapInline = (left, right = left) => {
        runTransform((text, _lines, { fromIdx, toIdx }) => {
            const sel = text.slice(fromIdx, toIdx);
            const wrapped = `${left}${sel}${right}`;
            const nextText = text.slice(0, fromIdx) + wrapped + text.slice(toIdx);
            const anchor = fromIdx + left.length;
            const head = anchor + sel.length;
            return { nextText, newSelection: { anchor, head } };
        });
    };

    const toggleLinePrefix = (prefix) => {
        runTransform((text, lines, { selPos }) => {
            const { from, to } = selPos;
            const startLine = from.line;
            const endLine = to.line;

            const allHave = (() => {
                for (let l = startLine; l <= endLine; l++) {
                    const s = lines[l] ?? '';
                    const i = leadingWSLen(s);
                    if (!s.slice(i).startsWith(prefix)) return false;
                }
                return true;
            })();

            const newLines = [...lines];
            for (let l = startLine; l <= endLine; l++) {
                const s = newLines[l] ?? '';
                const i = leadingWSLen(s);
                newLines[l] = allHave
                    ? (s.slice(i).startsWith(prefix) ? s.slice(0, i) + s.slice(i + prefix.length) : s)
                    : s.slice(0, i) + prefix + s.slice(i);
            }

            const nextText = newLines.join('\n');
            const newAnchorIdx = posToIndex(newLines, selPos.from);
            const newHeadIdx = posToIndex(newLines, selPos.to);
            return { nextText, newSelection: { anchor: newAnchorIdx, head: newHeadIdx } };
        });
    };

    const cycleHeading = () => {
        const levels = ['# ', '## ', '### '];
        runTransform((_text, lines, { selPos }) => {
            const { from, to } = selPos;
            const start = from.line;
            const end = to.line;

            const currentIdx = (() => {
                for (let i = 0; i < levels.length; i++) {
                    const p = levels[i];
                    let ok = true;
                    for (let l = start; l <= end; l++) {
                        const s = lines[l] ?? '';
                        const ws = leadingWSLen(s);
                        if (!s.slice(ws).startsWith(p)) { ok = false; break; }
                    }
                    if (ok) return i;
                }
                return -1;
            })();

            // Remove any existing heading prefixes (H1/H2/H3) from all lines
            const cleared = lines.map((s) => {
                const ws = leadingWSLen(s);
                for (const p of levels) {
                    if (s.slice(ws).startsWith(p)) return s.slice(0, ws) + s.slice(ws + p.length);
                }
                return s;
            });

            const nextIdx = (currentIdx + 1) % (levels.length + 1);
            const newLines = [...cleared];

            // Apply next heading level if not "normal"
            if (nextIdx < levels.length) {
                const p = levels[nextIdx];
                for (let l = start; l <= end; l++) {
                    const s = newLines[l] ?? '';
                    const ws = leadingWSLen(s);
                    newLines[l] = s.slice(0, ws) + p + s.slice(ws);
                }
            }

            const nextText = newLines.join('\n');
            const newAnchorIdx = posToIndex(newLines, selPos.from);
            const newHeadIdx = posToIndex(newLines, selPos.to);
            return { nextText, newSelection: { anchor: newAnchorIdx, head: newHeadIdx } };
        });
    };

    const insertFencedBlock = (lang = '') => {
        runTransform((text, lines, { selPos }) => {
            const { from } = selPos;
            const prevLine = Math.max(0, from.line - 1);
            const prev = (lines[prevLine] || '').trim();
            const current = (lines[from.line] || '').trim();

            const lead = prev ? '\n\n' : '\n';
            const tail = current ? '\n\n' : '\n';

            const insert = `${lead}\`\`\`${lang}\n// your code here\n\`\`\`${tail}`;
            const idx = posToIndex(lines, from);
            const nextText = text.slice(0, idx) + insert + text.slice(idx);

            const anchor = idx + lead.length + 3 + lang.length + 1; // after "```<lang>\n"
            const head = anchor + 17; // length of "// your code here"
            return { nextText, newSelection: { anchor, head } };
        });
    };

    const actions = [
        { key: 'bold', label: 'Bold', run: () => wrapInline('**') },
        { key: 'italic', label: 'Italic', run: () => wrapInline('_') },
        {
            key: 'link',
            label: 'Link',
            run: () => runTransform((text, _lines, { fromIdx, toIdx }) => {
                const sel = text.slice(fromIdx, toIdx) || 'link text';
                const rep = `[${sel}](https://)`;
                const nextText = text.slice(0, fromIdx) + rep + text.slice(toIdx);
                const anchor = fromIdx + 1; // inside [...]
                const head = anchor + sel.length;
                return { nextText, newSelection: { anchor, head } };
            })
        },
        { key: 'list', label: '• List', run: () => toggleLinePrefix('- ') },
        { key: 'olist', label: '1. List', run: () => toggleLinePrefix('1. ') },
        { key: 'head', label: 'Heading', run: cycleHeading },
        { key: 'fence', label: '{ } Code', run: () => insertFencedBlock('js') },
    ];

    // ---------- stats ----------
    const counts = useMemo(() => {
        const text = value || '';
        const words = (text.trim().match(/\S+/g) || []).length;
        const chars = text.length;
        return { words, chars };
    }, [value]);

    // ---------- codemirror options ----------
    const cmOptions = {
        mode: 'markdown',
        theme: 'neo',
        lineNumbers: false,
        lineWrapping: true,
        tabSize: 2,
        indentWithTabs: false,
        autofocus: false,
        placeholder,
    };

    return (
        <div className="card mb-2">
            <div className="card-header d-flex align-items-center justify-content-between">
                <div className="btn-group btn-group-sm" role="tablist" aria-label="Editor mode">
                    <button
                        type="button"
                        className={`btn ${tab === 'write' ? 'btn-primary' : 'btn-outline-primary'}`}
                        onClick={() => setTab('write')}
                    >
                        Write
                    </button>
                    <button
                        type="button"
                        className={`btn ${tab === 'preview' ? 'btn-primary' : 'btn-outline-primary'}`}
                        onClick={() => setTab('preview')}
                    >
                        Preview
                    </button>
                </div>

                {/* font dropdown */}
                <select
                    className="form-select form-select-sm ms-2"
                    style={{ width: 'auto' }}
                    value={font}
                    onChange={(e) => setFont(e.target.value)}
                >
                    <option value="">Default</option>
                    <option value="Arial">Arial</option>
                    <option value="Calibri">Calibri</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Courier New">Courier New</option>
                </select>

                <div className="small text-muted ms-3">
                    {counts.words} words • {counts.chars} chars
                </div>
            </div>

            {tab === 'write' ? (
                <>
                    <div className="px-2 pt-2 d-flex flex-wrap gap-2">
                        {actions.map((a) => (
                            <button
                                key={a.key}
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={a.run}
                            >
                                {a.label}
                            </button>
                        ))}
                    </div>

                    <div style={{ borderTop: '1px solid #e5e5e5', fontFamily: font || 'inherit' }}>
                        <CodeMirror
                            value={safeValue}
                            options={cmOptions}
                            editorDidMount={handleEditorDidMount}
                            onBeforeChange={handleBeforeChange}
                        />
                    </div>

                    <style>{`
            .CodeMirror { height: 260px; font-family: inherit !important; }
            .CodeMirror-placeholder { opacity: .6; }
          `}</style>

                    <div className='text-muted'>Click on heading button multiple times to cycle through different type headings</div>
                </>
            ) : (
                <div className="p-3" style={{ fontFamily: font }}>
                    <div className="small text-muted mb-2">Preview</div>
                    <div className="markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                            {safeValue || '_Nothing to preview yet…_'}
                        </ReactMarkdown>
                    </div>
                </div>
            )}
            <style>{`
            .markdown-body blockquote{
              padding: .5rem 1rem;
              margin: 0 0 1rem;
              border-left: 4px solid #d0d7de;
              color: #57606a;
              background: #f6f8fa;
            }
          `}</style>
        </div>
    );
}