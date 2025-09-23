import { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import styles from './imageprocessing.module.css';
import DisplayModal from './imageresizedisplay';
import BannerModal from './imageresizebanner';    

const ACCEPTED_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ACCEPTED_EXT = ["jpg", "jpeg", "png", "webp"];

const ImageProcessing = forwardRef(
    (
        {
            onFileSelected,
            onError,
            label = 'Upload Image',
            inputId = 'image-input',
            ModalComponent = DisplayModal,   // swap to BannerModal if need
            placeholderText = 'No file selected. Please upload a JPEG/JPG, PNG, or WebP image only',
        },
        ref
    ) => {
        const inputRef = useRef(null);
        const [hovered, setHovered] = useState(false);

        const [originalFile, setOriginalFile] = useState(null);
        const [editedFile, setEditedFile] = useState(null);
        const [fileName, setFileName] = useState('');
        const [showKonva, setShowKonva] = useState(false);

        const emit = (orig, edit) => onFileSelected?.({ original: orig ?? null, edited: edit ?? null });

        const clearInputOnly = () => {
            if (inputRef.current) inputRef.current.value = '';
            setFileName('');
            setOriginalFile(null);
            setEditedFile(null);
            setShowKonva(false);
            onFileSelected?.({ original: null, edited: null });
        };

        const reset = () => { clearInputOnly(); };
        useImperativeHandle(ref, () => ({ reset }), []);

        const handleImageUpload = (e) => {
            const file = e.target.files?.[0];
            // allow re-choosing the same file next time
            e.target.value = '';
            if (!file) return;

            if (!ACCEPTED_MIME.includes(file.type)) {
                onError?.('Invalid file type. Please upload a JPEG/JPG, PNG, or WebP image.');
                clearInputOnly();
                return;
            }
            const ext = file.name.split('.').pop()?.toLowerCase();
            if (!ext || !ACCEPTED_EXT.includes(ext)) {
                onError?.('Unsupported extension. Allowed: .jpg, .jpeg, .png, .webp');
                clearInputOnly();
                return;
            }

            // valid
            onError?.('');
            setFileName(file.name);
            setOriginalFile(file);
            setEditedFile(null);
            onFileSelected?.({ original: file, edited: null });
            setShowKonva(true);
        };

        const handleImageRemove = () => setTimeout(reset, 300);
        const openEditor = () => { if (originalFile) setShowKonva(true); };

        const handleExport = ({ file }) => {
            setEditedFile(file);
            emit(originalFile ?? file, file);
            setShowKonva(false);
        };

        return (
            <div>
                <div className="mb-3 position-relative">
                    <div className="bigbig-text fs-5">{label}</div>

                    <div className="d-flex align-items-center gap-2">
                        <label
                            htmlFor={inputId}
                            className={`btn btn-alice ${hovered ? 'shadow' : ''}`}
                            style={{ marginBottom: 0 }}
                            onMouseEnter={() => setHovered(true)}
                            onMouseLeave={() => setHovered(false)}
                        >
                            Browse...
                        </label>

                        <input
                            ref={inputRef}
                            id={inputId}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleImageUpload}
                            style={{ display: 'none' }}
                        />

                        <span className={styles.filenamedisplay}>
                            <span key={fileName || 'nofile'} className={styles.fadein}>
                                {fileName || placeholderText}
                            </span>

                            {fileName && (
                                <button
                                    type="button"
                                    onClick={openEditor}
                                    className={styles.fileedit}
                                    title="Crop / edit image"
                                >
                                    ✂️
                                </button>
                            )}

                            {fileName && (
                                <button
                                    type="button"
                                    onClick={handleImageRemove}
                                    className={styles.fileremove}
                                    title="Remove image"
                                >
                                    ×
                                </button>
                            )}
                        </span>
                    </div>
                </div>

                {/* Use whichever modal you pass in */}
                <ModalComponent
                    open={showKonva}
                    onClose={() => setShowKonva(false)}
                    file={originalFile}
                    onExport={handleExport}
                />
            </div>
        );
    }
);

export default ImageProcessing;





